# Compatibilização de mensagens no Supabase PROD

## Estado e limites desta entrega

Preparação na `main`, após `0c88c73`. **Nenhum SQL de alteração, migration, reparo de histórico, deploy de Edge, secret ou flag foi executado remotamente.** Responder/Excluir não estão habilitados em PROD por este commit. O frontend permanece protegido por `capabilities.messaging_v2`.

A inspeção remota foi exclusivamente de metadados, definições SQL e pré-validação em transação READ ONLY, no projeto PROD `nwgyxmwaqckpghznbfzm`. Não foram lidas mensagens, contatos, PINs, nomes de convidados ou dados de RSVP. O changelog HTTP do Supabase foi bloqueado pelo proxy (403); a documentação atual de migrations foi consultada via `search_docs`.

### Divergência das evidências

O diagnóstico anexado descreve um banco perfil 008 + senha 009, com `app_snapshot → internal_snapshot_core → app_snapshot_v5` e sem `name_pin_snapshot_core`. Esse é um baseline suportado e testado de forma independente.

**Na consulta desta execução, `name_pin_snapshot_core(uuid)` existe.** O `app_snapshot` público chama esse core, acrescenta `current_invitation_id` e os conflitos do login por nome/PIN. Esse core preserva a delegação ao snapshot de perfil. `app_mutate` preserva CONTACT_UPDATE/PUSH_REGISTER e delegação para `internal_mutation_core`; o administrador preserva a delegação para `admin_action_v3`. Não foi encontrada extensão v2 instalada. PROD usa PostgreSQL 17.11. A pré-validação detectou grants DML das tabelas antigas, diferentes do fixture local inicial: RLS ligado, roles sem bypass e policies somente SELECT continuam impedindo escrita direta. O gate verifica essa combinação em vez de revogar permissões históricas; os testes reproduzem esses grants e negam as escritas. As tabelas novas revogam explicitamente escrita de clientes.

O registro atual consultado contém sete versões, de foundation a home_greeting (timestamps históricos diferentes dos nomes locais). Não contém `20261014171048`, perfil/senha/nome-PIN, apesar de contratos posteriores presentes. Isso **não prova** por que uma aplicação histórica foi executada ou registrada de outro modo. Também não autoriza reaplicação ou criação de registros retroativos. O diagnóstico anexado e a observação atual são evidências de momentos/estados distintos; não se afirma que uma delas descreve o estado de todos os acessos anteriores.

`name_pin_snapshot_core` foi introduzida no commit `6c20d17`, pela migration `20261013204105_name_pin_access.sql`, mediante **rename do snapshot público então existente**, sem criar um snapshot fictício. Sua ausência no baseline do anexo é compatível com aquele wrapper não instalado, e não demonstra falha de login. Não foi possível estabelecer a causa histórica dessa ausência sem os registros de implantação. A extensão de mensagens não chama esse nome: usa `app_snapshot` público e o preserva por rename. A pré-condição original exige o nome apenas como marcador de baseline.

## Decisão: instalador manual completo, não uma migration atrás da original

A solução é uma atualização SQL incremental autocontida em `scripts/messaging-prod/install.sql`. Ela troca a pré-condição nominal por um gate de contratos reais: colunas/tipos, funções/retornos/proprietários, hashes de corpos revisados, ACLs, delegações, RLS, policies, constraints, permissões de criação de schema e ausência de instalação parcial/conflitos. O gate aceita as implementações históricas revisadas e as observadas agora; um corpo desconhecido exige interromper e revisar, não flexibilizar a validação.

**As migrations históricas não foram alteradas.** Criar uma nova migration cronologicamente depois de `20261014171048` não corrigiria uma instalação sequencial: a original ainda falharia antes de atingir a nova. Por isso não se acrescenta uma segunda versão da mesma extensão ao diretório automático. O arquivo manual tem a finalidade de instalar essa extensão sobre o baseline efetivo.

Depois do gate, o payload inteiro da extensão original é **byte a byte idêntico**, incluindo DDL, backfills, functions, índices, triggers, ACLs e policies. `tests/messaging-prod-artifact.test.ts` verifica essa equivalência e seu SHA256 (`payload.sha256`). A pós-validação confere hashes exatos dos corpos v2. Os bancos isolados verificam que todos os cores preservados mantêm corpos, assinatura, retorno, security mode e search_path anteriores.

### Histórico e prevenção de duplicidade

1. `install.sql` não escreve no histórico Supabase. Uma falha aborta a transação inteira; uma segunda execução/instalação parcial é recusada **antes** do DDL.
2. Após instalação, pós-validação e revisão da equivalência, executar **somente** `register-equivalent.sql` com autorização de implantação. Ele registra a versão **da extensão realmente instalada**, `20261014171048 / messaging_conversations`, com a proveniência e checksum do payload equivalente. Não registra perfil, senha ou nomes retroativamente e não faz `migration repair`.
3. Essa etapa é justificável pela equivalência integral do payload, não por simplesmente encontrar `deleted_at` ou `messaging_v2`. O script exige as funções e os contratos v2 revisados. Um registro de mesmo timestamp/nome diferente interrompe a execução; repetir o registro correto não duplica.
4. Registro e instalação são etapas separadas deliberadamente: se o SQL instalado não corresponder integralmente ao artefato, **não registrar**. Preservar evidências e interromper. Nunca executar a migration original por cima; o teste confirma que ela falha sem deixar DDL parcial.
5. A divergência histórica das versões anteriores permanece uma pendência de reconciliação específica. **Nenhum `supabase db push` remoto é permitido por este plano**, mesmo após o registro v2. Não há automação atual que aplique SQL ao Supabase; CI aplica migrations exclusivamente em bancos descartáveis. Qualquer futuro pipeline remoto deve primeiro reconciliar o ledger completo por contrato/dump revisado, sem reaplicar históricos.

Não se apresenta esse registro como prova de equivalência do **baseline inteiro** com todas as migrations locais. Ele representa somente a extensão instalada agora, sobre os cores preservados. Um push Git não executa esses arquivos.

## Auditoria da extensão original e dependências

| Objeto | Alteração / dependência preservada |
| --- | --- |
| `messages` | Adiciona `deleted_at`, `deleted_by` (FK auth.users), `notification_title` com limite, `legacy_admin_read_at`, `audience` com check e default LEGACY. Não remove linhas. |
| `announcements` | Adiciona `message_id` (FK messages), `deleted_at`; projeções novas têm vínculo explícito. |
| Histórico | Copia leitura administrativa compartilhada para `legacy_admin_read_at`, sem inventar leitor individual. Associa anúncio legado apenas com evento, conteúdo **exato**, instante exato e correspondência 1:1 em ambos os lados; ambiguidades continuam bloqueando exclusão. Restaura apenas destinatário comprovado pelo UUID do job IN_APP legado e sua unidade. Backfills podem tocar `updated_at` via trigger existente. |
| Índices | `messages_visible_event`, `messages_unit_history`, `message_reads_reader`, `notification_schedules_event`, `notification_schedules_due`. Os dois índices de mensagens excluem tombstones. |
| `message_reads` | PK `(message_id,reader_key)`, FK composta `(event_id,message_id) → messages(event_id,id)`, cascade apenas para remoção física histórica do registro base. RLS e SELECT restrito; sem escrita direta autenticada/anon. |
| `message_reader` | ADMIN = usuário autorizado; GUEST = unidade da sessão. Não usa nome/Perfil como identidade de membro. |
| Visibilidade | `can_read_message` anterior vira `messaging_visibility_core`, com EXECUTE revogado dos clientes. Novo wrapper exige mensagem não excluída e restringe FAMILY/PRIVATE à unidade correta. Recria `guest_messages` e `own_message_reads` para apontar ao novo OID. Policies administrativas antigas permanecem; administradores podem inspecionar tombstones pela Data API, mas snapshots os ocultam. |
| `app_mutate` | Anterior vira `messaging_mutation_core`, privado. Novo wrapper intercepta operações de mensagens, mantém delegação de todas as outras operações ao core original, inclusive perfil/consentimento. |
| `admin_action` | Anterior vira `messaging_admin_core`, privado. Novo wrapper intercepta leitura/exclusão/agendamentos; todos os demais comandos permanecem no core original. |
| `app_snapshot` | Anterior vira `messaging_snapshot_core`, privado. Novo wrapper preserva o JSON/fluxo de login e substitui somente projeções de mensagens/anúncios/jobs/agendamentos e capacidades da extensão. |
| Recibos / auditoria | Reutiliza `mutation_receipts` e `audit_logs`. Resposta usa o pipeline canônico de destinatários e jobs; não há segundo pipeline. |
| Agendamento | Adiciona `events.notification_scheduling_enabled DEFAULT false`, `notification_schedules` com PK/FKs/checks/RLS, SELECT ADMIN e trigger `schedule_touch → touch_row`. NÃO habilita eventos. |
| Worker | `schedule_notifications` anterior vira `messaging_schedule_core`; mantém execução de regras antigas e adiciona novos schedules somente quando o flag do evento permite. `authorize_notification_attempt` anterior vira `messaging_admission_core`; novo wrapper impede admissão de mensagem excluída, mantendo a checagem final de consentimento/lease original. |
| Grants | RPCs de usuário: authenticated, sem anon/PUBLIC. Worker: service_role, sem authenticated. Cores renomeados: sem EXECUTE público/anon/authenticated/service_role. Todos os novos objetos expostos têm RLS. |

Nenhuma função v7 é criada. Nenhuma função de autenticação é alterada. `name_pin_snapshot_core` é opcional no gate; `authorize_notification_attempt` com sua assinatura completa, o pipeline de recipients e os gates de consentimento são obrigatórios.

### Por que manter o agendamento estruturalmente completo

`admin_action`, `app_snapshot` e `schedule_notifications` da extensão usam o tipo/registro da tabela `notification_schedules`; remover somente o DDL dessa parte deixaria dependências incompletas e criaria outra implementação. Foi mantida a extensão inteira, testada, com o flag sempre false na instalação. Habilitar a funcionalidade programada é outra etapa: revisar/publicar a Edge já preparada anteriormente, verificar worker/providers/consentimentos e só então autorizar o flag por evento. Nesta tarefa não se altera Edge nem secret.

O reply/delete/recibos não exigem habilitar schedules. A admissão final existente é preservada e recebe a proteção de tombstone no próprio banco, mesmo antes de uma atualização posterior da Edge.

## Contratos funcionais e segurança

- `MESSAGE_REPLY`: auth.uid e papel ADMIN, evento validado, âncora recebida não excluída, unidade ativa/não arquivada, destinatários derivados dos convidados dessa unidade. Se havia sender_guest_id histórico, mantém esse alvo declarado; não o trata como prova de autenticação individual. Thread/unidade da âncora preservados, PRIVATE, recibo idempotente e auditoria. Não aceita destinatário arbitrário do cliente.
- `MESSAGE_DELETE`: ADMIN, mensagem administrativa do evento, lock, tombstone e deleted_by. Repetição é sucesso sem nova auditoria. Mensagem inexistente/recebida indevidamente é rejeitada. GUEST/CEREMONIAL e outro evento não conseguem excluir.
- Anúncios ligados ficam também excluídos. Projeção histórica ambígua não é associada por semelhança nem apagada. Snapshots e contadores baseados em mensagens visíveis deixam de incluir tombstones; dados base, recipients, recibos e auditoria permanecem.
- Pendências ainda não admitidas são skipped; entregas admitidas/concluídas/uncertain não são recolhidas. O worker não ganha permissão para entregar após tombstone. Não se promete apagar e-mail/WhatsApp/push externos.
- Concorrência e idempotência reutilizam receipt/locks existentes. Recibos de leitura por ADMIN e unidade têm PK apropriada. Abrir a lista não marca todas as mensagens como lidas; frontend já solicita leitura por visibilidade.
- `SECURITY DEFINER` segue o contrato existente: proprietário postgres, search_path revisado, schema sem CREATE para usuários não confiáveis, auth/event_role antes das operações e cores inacessíveis diretamente. Não se amplia RLS para contornar erro.

## Roteiro manual — posterior autorização obrigatória

### 1. Antes da janela

Confirmar **projeto PROD `nwgyxmwaqckpghznbfzm`**, branch main e SHA aprovado. Não usar develop. Obter backup consistente/dump seguro de schema, dados e ledger; verificar possibilidade de restauração em cópia isolada. Guardar definições/hashes dos RPCs e roles/ACLs e revisar mudanças concorrentes. Não colocar dados reais ou secrets no Git.

Executar o artefato integral em cópia isolada restaurada desse backup, com usuários de teste e roles efetivos. Os fixtures desta entrega reproduzem contratos conhecidos, mas não substituem restauração integral de PROD nem provam entrega dos providers.

### 2. Pré-validação

No SQL Editor, executar **inteiro** `scripts/messaging-prod/preflight-readonly.sql`. É READ ONLY. Ele produz `CATALOG_READY` quando os gates passam e lista ledger, hashes, policies e constraints. Em ferramentas que mostram apenas o último result set, ausência de erro confirma conclusão, mas conservar todos os resultados/avisos é recomendado.

Interromper diante de exceção, corpo desconhecido, ACL/RLS diferente, conflito de nomes, coluna nova isolada, v2 já instalado, histórico v2 sem estrutura ou preflight antigo. Conferir projeto/backup manualmente: catálogo sozinho não confirma identidade do projeto ou entrega externa. Não remover guardas para forçar instalação.

### 3. Instalação

Executar **inteiro** `scripts/messaging-prod/install.sql`, sem selecionar fragmentos. É uma transação, com advisory lock de implantação, lock_timeout 5s e statement_timeout 120s. O gate é repetido dentro da transação. Planejar janela de baixa atividade: ALTER/indexes/backfill precisam de locks e podem bloquear envios momentaneamente. Se timeout, aguardar reversão completa e investigar; não aumentar timeout nem repetir cegamente.

Não executar seed, nome/PIN, versões v7 ou migrations anteriores. Não chamar db push. Não habilitar schedules.

### 4. Pós-validação e ledger

Executar `scripts/messaging-prod/verify-readonly.sql` integralmente. Conferir colunas, índices/tabelas, funções e hashes exatos, constraints, RLS, ACLs, trigger, isolamento das projeções e flag false.

Depois de comprovar a equivalência do payload e estado instalado, executar `scripts/messaging-prod/register-equivalent.sql`. Não executar se houve adaptação local diferente ou instalação incompleta. O registro não substitui testes autenticados. Conferir a nova linha v2; todos os registros históricos anteriores devem permanecer iguais.

### 5. Teste funcional autorizado

Usar ADMIN legítimo e unidade legítima de teste, em navegador/sessão de cada papel, com autorização para criar conteúdo de teste. Enviar mensagem pelo convidado, responder como ADMIN, recarregar os dois navegadores, verificar outra unidade, ler e conferir contadores. Criar recado particular e geral de teste, excluir e recarregar; conferir anúncio removido, tombstone/auditoria e jobs. Não testar excluindo conteúdo real. Testar login original e consentimentos sem trocar credenciais. SQL Editor postgres sozinho não prova RLS/autorização de usuários.

### 6. Contingência

Antes de COMMIT, qualquer erro aborta a atualização: não existe rollback parcial autorizado. Se a UI falhar depois de COMMIT, **não renomear os cores antigos de volta**, pois snapshots antigos poderiam reexibir mensagens excluídas.

Depois de autorização específica, `disable-new-actions.sql` confere o estado v2 exato e substitui apenas os wrappers públicos por variantes revisadas que bloqueiam reply/delete/novos schedules e retornam messaging_v2/notification_schedules false. **Mantém filtros de tombstone, leitura, envio legado, admissão final, dados, auditoria, recipients e identidade.** Não desliga policies nem remove tabelas. Esse circuito não se destina a interromper schedules já habilitados por uma futura implantação; tal cenário exige parar o worker/flag de forma revisada, fora desta etapa.

`enable-new-actions.sql` só restaura os corpos v2 originais quando os corpos desativados têm os hashes esperados e a causa foi resolvida. Não restaura mensagens excluídas. Depois, repetir pós-validação e testes autorizados. Se o estado não for exatamente conhecido, interromper em vez de executar essas variantes.

## Arquivos e validação

SQLs completos, sem placeholders, UUID de evento fictício, secret ou dependência de psql:

- Pré-validação: `scripts/messaging-prod/preflight-readonly.sql`.
- Atualização incremental compatível: `scripts/messaging-prod/install.sql`.
- Pós-validação: `scripts/messaging-prod/verify-readonly.sql`.
- Registro da extensão comprovadamente equivalente: `scripts/messaging-prod/register-equivalent.sql`.
- Contingência: `scripts/messaging-prod/disable-new-actions.sql` e `enable-new-actions.sql`.
- SHA256 do payload original integral: `scripts/messaging-prod/payload.sha256`.

`test-messaging-prod.sh` monta dois bancos **independentes**, até perfil008/senha009 e até nome/PIN, sem instalar a extensão original. O primeiro não contém name_pin_snapshot_core nem funções v7. Usa ledger com timestamps alternativos, aplica o instalador, verifica preservação dos cores/dados, login legado e nome/PIN (cada um no seu baseline), consentimento e a suíte completa de segurança da extensão. Testa instalação parcial, repetição, original sobreposta, registro idempotente, circuito de desativação e restauração sem ressuscitar tombstones.

Os testes E2E de concorrência agora usam o baseline perfil/senha e o instalador manual. O teste de navegador de persistência também pode executar com `MESSAGING_TEST_BASELINE=profile`: transporte/Auth controlado, **PostgreSQL/RPC/RLS reais**, identidade de unidade, resposta privada, outra unidade, geral, exclusão e reload. Não é produção nem Android/iOS físicos.

A suíte `npm run test:db` inclui esse harness no CI. O teste unitário de equivalência impede desvio silencioso entre os payloads da extensão original e do instalador. Scripts de produção nunca são executados por deploy de Pages; testes os executam apenas em PostgreSQL descartável.

Referência consultada: [Supabase — Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations), especialmente distinção entre execução e reparo de tracking. A exceção manual aqui segue a instrução explícita do usuário e inclui reconciliação da extensão instalada, sem reparo amplo do baseline.

### Advisors e limites da auditoria

A consulta somente de leitura aos Security Advisors retornou avisos existentes: RPCs SECURITY DEFINER disponíveis a authenticated, acesso de sessões anônimas condicionado às policies, tabelas privadas/internas com RLS sem policy e proteção de senha vazada do Auth desabilitada. As RPCs e sessões anônimas são parte deliberada do contrato atual; autorização exige event_role/unidade, não apenas authenticated. Tabelas sem policies citadas são internas ou privadas e não receberam novos grants. Não se desativou RLS, não se ampliou acesso e não se alterou configuração do Auth para eliminar avisos. A proteção de senha vazada e itens de outros schemas exigem revisão própria; não certificamos que todos os advisors do projeto estão verdes.

## Resultados desta execução

- Pré-validação final em PROD: passou em transação somente de leitura. Extensão v2 continua ausente; nenhuma alteração remota foi aplicada.
- **296 testes unitários** passaram (24 arquivos), incluindo equivalência integral do payload e sincronismo dos gates.
- **175 E2E completos** passaram. Adicionalmente, três cenários rodaram sobre o baseline perfil/senha sem name_pin_snapshot_core: matriz SQL, concorrência e persistência/reload pelo navegador. A concorrência final foi revalidada em dois cenários, incluindo dupla exclusão e disputa com admissão do worker. Esses testes adicionais repetem cenários da suíte; não se somam como novos casos únicos.
- Suíte PostgreSQL completa passou, com upgrades históricos, perfil, senha, nome/PIN, segurança, isolamento, concorrência e os dois upgrades independentes deste instalador. Grants de leitura/escrita padrão foram reproduzidos; leitura anon e escrita direta foram bloqueadas por RLS. Instalação parcial, reaplicação, policy ampliada e contingência foram verificadas.
- **59 testes de Edge** e verificação Deno passaram; nenhum arquivo de Edge foi modificado.
- Lint, TypeScript, build web e exportação passaram. Exportação confirmou manifest/worker/assets/offline/isolamento de cache e evento PWA nativo capturado antecipadamente (`defaultPrevented=true`). Aviso preexistente MODULE_TYPELESS_PACKAGE_JSON no build permanece; não representa falha do build.

Não foram executados testes funcionais de escrita em produção, restauração de um backup integral real, entrega por providers remotos ou testes em aparelhos físicos. A implantação remota e seus testes autorizados permanecem pendentes. Nenhum resultado local é apresentado como confirmação de Responder/Excluir já habilitados no PROD.

## Camada de confirmação cadastral

A evolução de primeiro acesso está em [profile-confirmation.md](profile-confirmation.md). O instalador de mensagens também reconhece essa camada opcional, verificando fontes e cores preservados; o payload v2 e sua prova de equivalência não mudam. O harness agora inclui um terceiro baseline com confirmação instalada antes de mensagens. Nenhuma atualização remota está implícita nessa compatibilidade.
