# Mensagens, conversas e notificações programadas

Implementação incremental sobre a `main`, mantendo autenticação, unidades de acesso, consentimentos e o pipeline de entregas existente. Nenhum comando deste trabalho foi aplicado ao Supabase de produção. A alteração da Edge Function é somente no código-fonte.

## Auditoria e estruturas reutilizadas

O envio administrativo já utilizava `messages`, `message_threads` (evento/unidade), `message_recipients`, `notification_jobs`, `delivery_attempts`, `mutation_receipts` e `audit_logs`. `app_mutate` validava os destinatários e retornava o identificador imutável da mensagem; `dispatch-notifications` reivindicava jobs com leases e verificava consentimento novamente imediatamente antes da admissão ao provedor. `notification_rules` configura avisos relativos ao casamento e permanece intacta. Não foi criado outro pipeline de envio.

O campo histórico `messages.read_at` representava leitura administrativa compartilhada. Não identificava qual administrador leu nem leitura do convidado. A nova tabela `message_reads` registra o administrador autenticado ou a unidade de acesso do convidado. O contrato de autenticação atual autoriza uma unidade familiar, não cada membro individualmente: a seleção de remetente é um nome informado dentro da unidade autorizada. Por isso, a interface diz “Visualizada na sua unidade”, sem inventar identidade individual. As mensagens administrativas usam “Felipe & Laís”; não se atribui autoria a um dos noivos sem dados confiáveis.

O snapshot e o AppProvider já ofereciam sincronização periódica. Reutilizamos esse mecanismo: atualização a cada 30 segundos enquanto visível e atualização imediata, limitada a uma por dois segundos, ao retornar ao aplicativo. Não é anunciado Realtime nem foi adicionada publication/subscription sem configuração correspondente.

## Compatibilidade e histórico

A migration nova é `supabase/migrations/20261014171048_messaging_conversations.sql`. As migrations históricas não foram editadas. Ela exige o contrato de perfil/consentimento 008 e o contrato de acesso por nome/PIN `20261013204105` já presentes na main. Não aplica a migration aposentada 009, seed ou alterações de autenticação.

`capabilities.messaging_v2` só aparece quando a migration está instalada. Sem ela, o frontend mantém envio e histórico legados, não chama as novas operações de leitura do convidado/resposta privada/exclusão e não oferece criação de agendamentos. O chat flutuante é compatível com ambos os snapshots. Agendamentos têm um segundo controle independente, `events.notification_scheduling_enabled`, inicialmente **false**, mesmo após a migration.

Mensagens antigas recebem audiência `LEGACY`, sem atribuir alcance arbitrariamente. Uma projeção antiga em `announcements` é vinculada somente se existir correspondência **um para um** por evento, conteúdo, instante e título do envio geral. Correspondências ambíguas são preservadas; a exclusão que poderia afetar uma projeção não identificada é recusada. Não se usa conteúdo semelhante para excluir outras mensagens.

A leitura administrativa histórica é preservada em `legacy_admin_read_at`, com legenda de leitura compartilhada, sem inventar recibos individuais. Mensagens antigas já acessíveis permanecem acessíveis. Há um reparo estritamente delimitado para o protocolo antigo de regras IN_APP: somente registros cujo UUID é o job da regra, com convidado/evento/unidade coincidentes, recebem o vínculo faltante em `message_recipients`. O worker atualizado também faz esse upsert com chave `message_id,guest_id`. Jobs antigos de regras IN_APP podem não ter `message_id`; exclusão e admissão reconhecem também o UUID estável do próprio job, sem ampliar o alcance a outros canais ou mensagens.

## Conversas, leitura e interface

O balão abre `ChatWindow` sobre a página atual; não navega. `/mensagens` continua disponível e utiliza o mesmo conteúdo. A apresentação automática do balão, controle por sessão, safe areas e movimento reduzido são preservados. O chat abre em 300 ms e fecha em 200 ms, sem animação sob movimento reduzido. Bolhas entram em 220 ms. O rodapé de composição fica separado da rolagem; `visualViewport` ajusta altura/posição ao teclado. Escape, foco contido, retorno do foco e fechamento externo utilizam o modal existente.

“Mensagens gerais” mostra apenas mensagens reconhecidas como gerais. “Nossa conversa” reúne mensagens do convidado, respostas privadas, destinatários individuais/familiares e histórico legado sem alcance comprovado. Avisos familiares não são promovidos a globais. A categoria geral não oferece campo para resposta pública. Mensagens próprias não entram no contador de não lidas; tombstones e duplicações também não.

Uma mensagem recebida somente é reconhecida automaticamente se estiver realmente renderizada, pelo menos 60% visível por 400 ms, na categoria aberta e com o documento visível. Cada operação confirma um único ID autorizado no servidor. Há ação manual acessível e tratamento de falha. Abrir o modal não lê todas as abas. Recibos persistem em reload e outros dispositivos da mesma unidade; administradores têm recibos próprios. Navegadores sem IntersectionObserver podem usar a ação manual.

Envios usam a fila persistente existente e mutation UUID. O formulário bloqueia duplo clique; uma tentativa pendente idêntica reutiliza a operação existente. O estado transitório de um envio online não aparece como aviso de sincronização manual. Offline, erro real e outras operações pendentes continuam visíveis. O texto não declara entrega externa quando há somente registro local/outbox.

Respostas administrativas usam `MESSAGE_REPLY`, vinculadas a uma mensagem recebida autorizada: evento e unidade são derivados no servidor. Se houver remetente informado, ele precisa continuar pertencendo à unidade; sem ele, a resposta destina-se à unidade ativa. O payload não pode redirecionar a resposta para outra família.

## Exclusão e segurança

Somente ADMIN do evento pode excluir mensagens administrativas. GUEST e CERIMONIAL não podem. A confirmação é “Excluir mensagem?” / “Tem certeza que deseja excluir esta mensagem? Esta ação não poderá ser desfeita pela interface.”, com Cancelar e Excluir destrutivo.

A exclusão é lógica (`deleted_at/deleted_by`), oculta mensagem e projeção geral explicitamente vinculada e impede leitura/novo envio pelo contrato atualizado. Jobs não admitidos são interrompidos. Jobs enviados, incertos ou já admitidos são preservados para auditoria; e-mail, push ou WhatsApp já entregues **não podem ser recolhidos**. Avisos globais derivados de regras relativas podem representar vários jobs: excluir uma cópia individual não exclui o aviso coletivo de todos.

RPCs mantêm autenticação, papel/evento, `search_path` fixo e grants restritos. Tabelas novas têm RLS e somente SELECT autorizado para clientes; escrita passa pelas RPCs. Funções internas antigas renomeadas não permanecem públicas. As rotas de leitura reutilizam `can_read_message` e os consentimentos. Respostas familiares/privadas ficam vinculadas à unidade original; não acompanham indevidamente um convidado movido para outra família.

Mutation receipts, locks administrativos por evento e locks de leitura/exclusão preservam idempotência. Agendamentos têm UUID estável, versão para edição concorrente, `FOR UPDATE SKIP LOCKED` no vencimento e chaves únicas dos jobs. Autorização final de entrega mantém a admissão existente e verifica tombstones. Logs/auditoria novos usam IDs e ações, nunca corpo privado, telefone, PIN, e-mail ou tokens.

## Agendamento no servidor

`notification_schedules` descreve um disparo único: título, corpo, UTC, alcance, destinatários, canais, ativo, estado e versão. O calendário é PT-BR e o horário é de 24 horas; conversão e exibição usam `America/Sao_Paulo`. O servidor exige timestamp com timezone explícito, finito e futuro. UUIDs reservados por mensagens/jobs são rejeitados. Limites: título 160 caracteres, corpo 3800, até 500 destinatários, orçamento PUSH de 3000 bytes UTF-8 no JSON e WHATSAPP de 1000 bytes no título+corpo. Canais/destinatários são validados no servidor.

Edição e pausa somente antes da materialização. Cancelamento é permitido antes do envio/admissão; nunca promete revogar algo enviado. O worker materializa uma mensagem de ID igual ao agendamento, destinatários e jobs no pipeline existente. Repetir a execução não cria outra entrega. Revalida membros ativos e unidade familiar no vencimento, além dos consentimentos por canal na admissão. Não há timer do navegador executando agendamentos nem novo motor de recorrência; regras relativas existentes continuam disponíveis.

“Dispatched” é materialização em outbox, **não envio concluído**. A interface deriva agendada, pausada, em processamento, pendente, enviada, parcialmente entregue, falha, resultado incerto, ignorada e cancelada dos jobs reais. Sem destinatários ativos, informa esse resultado. Provedor desativado não se torna envio bem-sucedido. Resultado externo incerto exige revisão, sem repetição cega.

## Ativação manual posterior em produção

1. Conferir migrations realmente instaladas e contratos exigidos, fazer backup e testar esta migration incremental em cópia isolada com dados representativos. Não usar `db push` indiscriminado para aplicar migrations históricas aposentadas, nem executar seed.
2. Revisar e aplicar **somente a migration incremental nova**, em uma etapa posteriormente autorizada. A configuração de agendamento continua desativada.
3. Publicar posteriormente o código atualizado de `dispatch-notifications`. Ele permanece compatível com o schema antigo: metadados opcionais têm fallback. Nenhuma publicação de Edge Function ocorreu neste trabalho.
4. Verificar o worker periódico real: chamadas autenticadas por `WORKER_SECRET`/`x-worker-secret`, evento canônico, providers e permissões/consentimentos. O repositório não instala um novo cron de produção. Um clique administrativo não substitui o worker periódico.
5. Validar uma execução controlada, lease, admissão, resultado, recibos, ausência de duplicação e revogação antes do envio. Configurar frequência/capacidade considerando o lote de até 50 jobs e limites dos providers. Data programada significa elegibilidade do processamento, não SLA de entrega externa exata.
6. Só então habilitar `events.notification_scheduling_enabled=true` para o evento configurado canonicamente na produção (`EXPO_PUBLIC_EVENT_ID`), sem UUID de DEVELOP nem novo hardcode. A ação deve atingir exatamente uma linha. Exemplo operacional com variável bind do psql, **não executado nesta tarefa**:

   ```sql
   update public.events
   set notification_scheduling_enabled = true
   where id = :'configured_event_id'::uuid;
   ```

7. Verificar no navegador capacidade v2, criação/edição/cancelamento, conversa privada, isolamento e recibos. Sem a ativação, mostrar histórico permitido e explicação de indisponibilidade, sem anunciar agendamento ativo.

Rollback seguro: desativar o flag de agendamento e pausar execução futura, preservar mensagens/recibos/jobs/auditoria e os filtros de tombstones. Não remover colunas/tabelas nem substituir RPCs por versões que exponham novamente mensagens excluídas. Retornar a UI anterior exige revisar compatibilidade, não downgrade destrutivo do banco.

## Validação e limites do ambiente

Testes unitários de classificação, ordenação, contadores, status, timezone e limites; matriz PostgreSQL de permissões, RLS, isolamentos, versões, consentimento, exclusão e idempotência; upgrade com histórico pré-migration; processos PostgreSQL concorrentes para envio, resposta, recibo, criação e vencimento. Edge tests usam providers simulados: não comprovam entrega em contas reais.

E2E cobre chat sem navegação, abas, leitura só da categoria exibida, offline/reconexão, contadores, resposta/exclusão, calendário PT-BR, pausa/cancelamento, teclados/viewport e regressões existentes. Chromium local testa exportação e instalação PWA com evento nativo em perfil não anônimo. Nenhum Android/iOS físico foi testado; simulação de teclado não substitui validação em aparelho. A UI demo persiste configurações, mas não simula um cron de produção.

## Arquivos

- Banco/testes: nova migration `20261014171048_messaging_conversations.sql`; `scripts/test-db.sh`; `tests/messaging-conversations.sql`, `tests/messaging-upgrade-prepare.sql`, `tests/messaging-upgrade-verify.sql`.
- Edge: `supabase/functions/dispatch-notifications/index.ts` e `handler.test.ts`.
- Integração compartilhada: `src/types/domain.ts`, `src/lib/AppProvider.tsx`, `src/lib/errors.ts`, `src/storage/syncLabels.ts`, `src/repositories/demo.ts`.
- Componentes: `src/components/ui.tsx`, `AdminModal.tsx`, `FloatingMessages.web.tsx`, novo `UnreadBadge.tsx`.
- Mensagens: `src/features/messages/AdminMessages.tsx`, `MessagesScreen.tsx`; novos `AdminConversation.tsx`, `ChatWindow.tsx`, `GuestMessages.tsx`, `MessageHistory.tsx`, `conversations.ts`, `useMessageComposer.ts`.
- Notificações: `src/features/notifications/AdminRules.tsx`; novos `ScheduledNotifications.tsx`, `ScheduleDateFields.tsx`, `ScheduleDateFields.web.tsx`, `scheduling.ts`.
- Frontend/testes: novo `tests/conversations.test.ts`; novos `tests/e2e/messaging-conversations.spec.ts`, `messaging-concurrency.spec.ts`; ajustes em `floating-messages.spec.ts`, `staff-and-pin.spec.ts`, `workflows.spec.ts`.
- Documentação: este arquivo.

Não foram alterados manifest, service worker, captura de instalação PWA, paleta, vídeo, autenticação, migrations históricas, regras de RSVP/presentes ou código de check-in.

## Resultados desta entrega

- 285 testes unitários passaram.
- 159 testes E2E da suíte completa passaram (demo e autenticação/integração PostgreSQL).
- 59 testes das Edge Functions passaram, incluindo destino IN_APP de regra e títulos/corpos por canal.
- Lint, TypeScript, verificação Deno e build/export web passaram.
- Exportação com Chromium normal: evento nativo de instalação capturado antecipadamente, `defaultPrevented=true`, nenhum erro de instalabilidade, worker controlador e isolamento de caches privados.
- Inspeção visual: chat em 320, 375, 390, 768 e 1280 px; criação/calendário de notificações em desktop e mobile; conversa administrativa e confirmação destrutiva em desktop/mobile.

A suíte PostgreSQL inclui os testes históricos preservados e testes de upgrade/segurança novos. Os ajustes finais passaram novamente por 18 testes E2E focados e pela suíte PostgreSQL, incluindo exclusão e bloqueio de readmissão do aviso legado sem `message_id`. Avisos preexistentes do ambiente Expo/SVG no desenvolvimento e o aviso de tipo de módulo do bootstrap PWA no build não foram transformados em mudanças fora do escopo.

## Implantação no baseline efetivo de PROD

A aplicação direta da migration original não é o roteiro autorizado para o baseline remoto divergente. Consulte [Compatibilização de produção](messaging-production-compatibility.md): instalador incremental completo, pré/pós-validação, prova de equivalência, ledger específico e contingência. Nenhum desses passos remotos foi executado por este trabalho.
