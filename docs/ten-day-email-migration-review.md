# Revisão da migration — lembrete de 10 dias

Arquivo: `supabase/migrations/20261126124205_ten_day_email_reminder.sql`

SHA-256: `36ce5c5e80d5cffa064949c2e9767058667438b29c8f0277981bd0c884c3b17f`

Tamanho: 21.742 bytes.

## Objetos afetados

- Novas tabelas privadas `notification_private.ten_day_campaigns` e `ten_day_context`,
  com RLS e sem acesso direto de PUBLIC/anon/authenticated/service_role.
- Nova coluna nullable `public.notification_jobs.ten_day_campaign_id`, com FK
  composta que exige o mesmo evento e índice único por campanha/convidado.
- Novas funções `notification_private.ten_day_valid`, `public.ten_day_email_admin`,
  `public.ten_day_email_work` e `public.ten_day_email_config`.
- Acréscimo de um predicado em `notification_private.claim_visible`, exclusivamente
  para não reivindicar trabalho de campanha desativada/bloqueada.
- Acréscimo de um predicado em `notification_private.invoke_worker`, para despertar
  o MESMO worker quando a campanha exclusiva vencer. O restante das definições,
  OIDs, owners, ACLs e o Cron/Vault são preservados.
- Configuração inicial desativada por evento. Não cria jobs ou destinatários na instalação.

## Segurança e riscos residuais

Instalação transacional; lock_timeout 3s e statement_timeout 30s. Sem DROP, DELETE,
reclassificação, alteração de RSVP, nova credencial, modificação de regra existente,
ativação de canal geral ou alteração do histórico de migrations.

Os UPDATE/INSERT nos corpos das funções são operações FUTURAS de configuração,
admissão, fila e auditoria; não são executados na instalação, exceto a criação da
configuração desativada. As revogações atingem somente novos objetos.

A modificação das duas funções privadas compartilhadas é guardada por correspondência
exata/única do trecho esperado: divergência aborta toda a transação. O índice único
incide apenas em novas linhas com campanha preenchida; linhas anteriores ficam NULL.

A entrega depende de Resend e da rede. Um resultado indeterminado não autoriza novo
POST automático. A garantia persistente local complementa a janela de 24h do Resend.
Aceito pelo provedor não equivale a entregue. Não há webhook de entrega instalado.

A campanha usa a categoria transacional do convite, preservando a revogação expressa
`communications_revoked`. Não modifica os opt-ins ou as flags de notificações gerais.
A ativação desta campanha é independente e permanece uma escolha explícita do ADMIN.

## Validação realizada

- 541 testes unitários; 90 de funções Deno.
- Suíte SQL completa e teste dedicado de upgrade/rollback, isolamento, RLS/ACL,
  RSVP dinâmico, ausência de imagem, retomada, e-mails compartilhados, concorrência,
  resultado indeterminado, contexto imutável e idempotência.
- 21 E2E de configuração/prévia e regressão de notificações/histórico.
- Lint, TypeScript, Deno check, build e exportação/PWA aprovados.
- Inspeção da prévia em 390/1280px. Arte real ainda ausente; validação definitiva
  depende do upload manual e de um teste recebido/conferido pelo administrador.

## Estado em produção

Aplicada pelo mecanismo gerenciado em 26/11/2026, após autorização expressa do
administrador para o SHA-256 acima. Arquivo aprovado originalmente como
`20261125215940_ten_day_email_reminder.sql`; o Supabase atribuiu a versão oficial
`20261126124205`. O arquivo local foi alinhado à versão gerenciada, sem alteração
de conteúdo, tamanho ou SHA-256. Nenhuma migration histórica foi reparada/alterada.

As verificações pós-aplicação confirmaram: hashes de dados preservados, 14 funções
públicas intactas, políticas e histórico prévio intactos, Cron e worker inalterados,
E-mail/Push gerais desativados. Nas duas funções privadas, somente os predicados
aprovados foram alterados, com OIDs/ACLs/owners preservados.

A campanha permanece desativada, `started_at` nulo, sem jobs ou contexto de entrega.
Nenhum e-mail foi enviado e nenhuma imagem foi enviada ou modificada.
A campanha transacional pode ser ativada independentemente das flags gerais,
sem habilitar publicações de E-mail/Push existentes.
