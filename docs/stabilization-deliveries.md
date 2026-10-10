# Estabilização de acesso, sincronização e envios

## Diagnóstico

O preflight do navegador incluía `x-client-info`, enviado pelo SDK Supabase, mas o CORS compartilhado não o autorizava. O navegador interrompia o fluxo antes do POST, embora código/hash fossem corretos. A lista explícita agora autoriza `authorization, apikey, content-type, x-client-info, x-worker-secret`. Conferimos os headers da versão 2.117.3 do SDK instalada; trace propagation não está ativado e os headers adicionais de PostgREST não são utilizados por `functions.invoke`.

O cliente também convertia indisponibilidade/rede em senha inválida. Agora distingue identify inválido/inativo, senha inválida, sessão administrativa e falha técnica. Identify só revela nome/ativação; o vínculo anônimo continua exigindo senha e limites de tentativa existentes. Nenhuma mudança nas migrations 001–005, Auth recovery ou resgate por código/senha.

A fila interrompia o processamento na primeira falha e retornava sem indicar o resultado. Agora retorna contagens e primeira falha; acionamento manual com pendências por erro gera SyncError. O background permanece silencioso. A interface mostra ação, tentativas e erro amigável, permite retry e exige confirmação para descartar uma alteração com erro. Não descarta nada automaticamente. A identidade original da mutação é preservada no retry.

A migration 005 já persistia mensagens, recipients e jobs. Produção só tinha `redeem-invitation` publicada: o worker de e-mail não existia no ambiente. Além disso, SMTP do Supabase Auth não configura o provider Resend das Functions. A UI agora diferencia registro/sincronização de aceitação efetiva pelo provider.

## Mensagens e convite inicial

Mensagens administrativas usam destinatários explícitos `MESSAGE_SEND_TO_GUESTS`. Depois de persistir/sincronizar, o cliente chama `dispatch-notifications` com JWT do ADMIN, evento e mensagem. O servidor valida `event_role(event_id)=ADMIN` e faz claim somente nesse evento/mensagem, com limite de 50 jobs por chamada, locks e leases. O dispatch ADMIN exige UUID de mensagem existente no evento; sem ele, rejeita antes de reivindicar qualquer job. A 006 persiste `mutation_receipts.result` na mesma transação de message/recipients/jobs e devolve o ID original em retries, antes de revalidar dados mutáveis. Receipts históricos sem resultado retornam duplicate sem ID: o frontend não faz dispatch, deixando pendências para o scheduler. O resumo consulta os estados dos jobs da mensagem; pending/skipped/failed nunca viram sucesso de e-mail. Batches maiores podem permanecer pendentes para o scheduler; o resumo informa processamento pendente. `x-worker-secret` continua permitindo o scheduler existente. Mensagens comuns preservam consentimento por canal. Todos + IN_APP também cria um announcement na mesma operação idempotente. O backend só aceita `create_announcement=true` com IN_APP e o conjunto exato de convidados ativos; Pessoa/Família ou EMAIL sozinho não criam aviso. A interface usa uma única lista ativa e deduplicada para contagem, validação e payload; 0 ou mais de 500 destinatários desabilitam o envio e não entram na fila.

Convites iniciais usam `send-invitations`, ADMIN autenticado, `guest_id` opcional e `request_id` UUID. O servidor resolve contato/unidade/código/senha. INDIVIDUAL usa acesso próprio; FAMILY usa acesso compartilhado, enviado ao e-mail daquele convidado. O convite inicial não depende de `consent_email`.

O botão de envelope permanece na lista mesmo após envio ou sem e-mail. O envio em massa pede confirmação e apresenta ativos/com e-mail/sem e-mail/quantidade deduplicada. A reserva SQL deduplica e-mail normalizado + unidade dentro do request. Um novo clique após resultado conhecido cria um request novo; erro de transporte mantém o mesmo request na tela para retry. Não há senha no payload do cliente, nos logs ou na tabela de histórico.

A reserva fica `pending` antes do POST. Um claim exclusivo incrementa attempts e marca locked_at/last_attempt_at; o token do lease impede que uma resposta atrasada sobrescreva uma tentativa posterior. Timeout/rede/408/429/5xx e concurrent_idempotent_requests permanecem pending, com motivo sanitizado e lease liberado. Rejeições definitivas (inclusive invalid_idempotent_request e 401/403) na primeira tentativa ficam failed. Se uma tentativa anterior teve resultado incerto, uma rejeição no retry não confirma que o primeiro envio falhou: a operação continua pending com o mesmo request/reservation/chave. Apenas HTTP 2xx com ID confirma sent e preenche invitations.sent_at, preservando a primeira data.

Retry de pending usa o mesmo request/reservation/Idempotency-Key. O SHA-256 do objeto exato from/to/subject/text/html é persistido como payload_hash; senha, HTML/texto e tokens não são armazenados no histórico. Payload diferente impede novo POST. A janela de 24h é fixa desde first_attempt_at, sem deslizar a cada retry; após ela a operação continua pending para verificação administrativa. O lease dura dois minutos, acima do timeout HTTP de 20 segundos. O endereço do primeiro POST é o congelado na reserva; mudança de contato após tentativa incerta bloqueia o retry. Um delivery definitivamente concluído não é reenviado no retry.

O frontend recebe um resultado estruturado e retém o request enquanto houver qualquer pending ou erro de transporte. Histórico ADMIN inclui request_id e metadata de tentativas (sem hash/token/credenciais), permitindo retomar após navegação/reload. Iniciar outro envio incerto exige o modal de confirmação explícita “Reenviar mesmo assim”, com aviso de possível duplicação; cancelar não inicia operação. Requests somente são mantidos em memória no cliente, sem armazenamento manual de credenciais. O servidor reserva o novo request e registra superseded_by no antigo atomicamente ao confirmar o override; o resultado antigo continua incerto no histórico, mas não reaparece como operação para retry após reload. Reservas superseded não adquirem novo lease.

Bulk é restaurado como uma única operação, exclusivamente sob a chave bulk. Congela e reserva todos os destinatários na mesma transação antes do primeiro POST. Retries usam o mesmo conjunto e reservations, retomando apenas pending elegíveis; aliases de família não geram segundo POST na mesma chamada. Contadores representam reservations distintas. Excluir um convidado não apaga deliveries pendentes ou históricos. guest_id é um identificador histórico, e o snapshot ADMIN traz os guest_ids originalmente vinculados à operação; aliases restantes continuam bloqueados pelo mesmo request após reload. A identidade mínima também é mantida internamente se uma remoção administrativa de delivery acontecer, sem contatos ou credenciais.

O template HTML/texto é provisório, centralizado em `send-invitations/template.ts`, com conteúdo dinâmico escapado e link textual de fallback. Usa Resend compartilhado, sem imagem definitiva.

## UX

Copiar link e copiar link + senha apenas copiam e mostram feedback. Não identificam, resgatam nem alteram sessão. A ficha do convidado oculta a URL crua. Membros de família iniciam recolhidos, expandem/recolhem exclusivamente pelo cabeçalho, com lápis/desvincular acessíveis e adicionar membro abaixo. Local abre diretamente `gps_url`, com fallback Google Maps pelo endereço; Web abre aba externa, nativo usa Linking. Google Maps e copiar endereço permanecem diretos. Waze/Uber/99 saem da interface, sem remover dados/utilitários existentes.

## Pós-merge: execução em produção

Durante este PR não publicar Functions nem aplicar migrations em produção.

1. Atualizar o checkout para a main após merge e vincular o projeto correto (`supabase link --project-ref "$SUPABASE_PROJECT_REF"`). Confirmar `supabase migration list`: 001–005 já aplicadas. Nunca reaplicar essas migrations.
2. Aplicar somente `202610090006_invitation_deliveries.sql` pelo fluxo de migrations (`supabase db push`, depois de conferir a lista pendente). Ela cria histórico/RLS, reserva/finalização privadas, claim de jobs por evento/mensagem e extensão do snapshot ADMIN. Não repetir a 005.
3. Configurar secrets das Functions com valores obtidos no ambiente autorizado, nunca no repositório:

```bash
# Defina EMAIL_API_KEY, WORKER_SECRET e PUBLIC_WEB_BASE_URL no ambiente local seguro.
# PUBLIC_WEB_BASE_URL é a URL HTTPS pública BASE, incluindo /convite-felipe-e-lais quando usar Pages.
supabase secrets set \
  EMAIL_PROVIDER=resend \
  EMAIL_API_KEY="$EMAIL_API_KEY" \
  EMAIL_FROM='Felipe & Laís <convite@felipeelais2026.com.br>' \
  WORKER_SECRET="$WORKER_SECRET" \
  PUBLIC_WEB_BASE_URL="$PUBLIC_WEB_BASE_URL"
```

O domínio remetente precisa estar verificado no Resend. `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são variáveis de runtime do projeto; service role permanece exclusivamente no servidor. SMTP do Supabase Auth é uma configuração distinta de `EMAIL_API_KEY`/provider de notificações. `WORKER_SECRET` é necessário se scheduler for usado; nunca enviá-lo ao frontend.

4. Publicar exatamente estas três Functions, com autenticação validada pelo handler:

```bash
supabase functions deploy redeem-invitation --no-verify-jwt
supabase functions deploy dispatch-notifications --no-verify-jwt
supabase functions deploy send-invitations --no-verify-jwt
```

5. Validar OPTIONS e POST em contexto anônimo para links FAMILY/INDIVIDUAL; testar senha correta/incorreta, link bloqueado e sessão ADMIN. Validar envio de um convite, histórico, `sent_at`, retry com mesmo request e reenvio explícito. Confirmar mensagens sem consentimento skipped e com consentimento sent após aceitação Resend.
6. Se desejar processamento periódico de jobs/regras pendentes, configurar um scheduler autorizado enviando POST para `dispatch-notifications` com `x-worker-secret`. Não publicar o segredo em código/cliente. A chamada ADMIN imediatamente após sincronização não agenda cron por conta própria.

## Refatoração futura da tela “Seu convite”

Pendência; **não implementada neste PR**: exibir `Faltam XX dias até o Sim` com base em 15/12/2026 às 16:00, timezone `America/Sao_Paulo`. Quando faltar 6 dias ou menos, trocar para `Faltam XX horas até o Sim`. Redesign geral/arte definitiva continuam para trabalho posterior.

A seleção em massa é feita por RPC privada para retornar a lista completa do evento, sem depender do limite padrão de linhas do PostgREST. A reserva transacional decide a deduplicação no servidor; os números do modal são informativos e não substituem essa validação.
