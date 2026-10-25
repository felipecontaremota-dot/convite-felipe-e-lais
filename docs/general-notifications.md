# Notificações gerais: publicação e entregas independentes

A `main` acrescenta notificações gerais, nunca campanhas segmentadas. O módulo de conversas privadas continua independente e preservado. As migrations incrementais são `20261025135720_general_notifications.sql` e `20261025135750_notification_scheduler.sql`; nenhuma migration histórica deve ser reaplicada, reparada ou enviada por `db push --include-all`.

## Publicação

`admin_action(NOTIFICATION_PUBLISH)` valida ADMIN/evento e usa o UUID estável da solicitação. Um lock transacional por evento serializa publicação, edição e cancelamento. A mensagem, `published_at`, autor, origem, destinatários e jobs externos são gravados na mesma transação. Repetir o UUID devolve a publicação original, sem novos jobs. Limite: 20 publicações manuais por hora/evento.

Publicações são gerais e independem de RSVP. Destinatários externos são pessoas de convites ativos e não arquivados. Uma família não duplica a publicação; cada integrante só recebe canais para os quais possui contato/consentimento/subscription. Os canais aceitos em novas comunicações são IN_APP, PUSH e EMAIL; enum, contatos e histórico WhatsApp permanecem. Jobs WhatsApp pendentes não admitidos são explicitamente ignorados pelo worker, sem apagar tentativas.

A publicação permanece disponível na unidade autorizada mesmo se canais externos falharem ou forem revogados, até uma exclusão lógica explícita por ADMIN. Os consentimentos controlam entregas proativas. `notification_feed` retorna páginas de 20 registros e a leitura reaproveita `message_reads` por unidade familiar. Não há promessa de sigilo individual entre integrantes. A Home preserva anúncios históricos não associados. Apenas anúncios gerais com vínculo explícito a mensagens preservadas recebem metadados de publicação usando sua data original; não são criados novos jobs para eles. Destaques já associados deixam de aparecer duas vezes.

## Agendamento e lembretes

Agendamentos usam a tabela existente e só podem ser criados/editados se `notification_scheduling_enabled` estiver ativo. Edição usa versão; replay idêntico de criação é idempotente. Publicação materializada não pode ser cancelada nem excluída pela API de mensagens; a ação específica NOTIFICATION_DELETE permite exclusão lógica administrativa de notificações gerais. Datas são interpretadas em America/Sao_Paulo; a interface mostra previsão de processamento, não promessa de entrega pontual.

O worker não chama o antigo core automático, que ignorava a flag. Regras automáticas usam a mesma publicação/outbox, com índice único por regra/evento. Regras atrasadas há mais de uma hora são registradas em `notification_private.rule_expirations` e na auditoria, sem campanha de recuperação. Agendamentos manuais atrasados são processados após retomada; continuam editáveis/canceláveis até a materialização. Regras/agenda com canal legado são ignoradas/canceladas explicitamente. Falta de destinatários cancela o agendamento com auditoria.

## Web Push

O service worker mantém instalação/cache e acrescenta push/notificationclick. O clique abre `/inicio` dentro do scope, sem tokens e sem confiar em URL arbitrária do payload. O app pede permissão somente após ação explícita. iOS/iPadOS exige uma versão compatível e, quando necessário, instalação na Tela de Início. WebKit de CI não substitui aparelho físico nem comprova entrega pelo serviço Apple.

Subscriptions ficam em `web_push_subscriptions`, sem leitura/escrita direta de anon/authenticated. A RPC exige sessão GUEST elegível e vínculo real com a unidade. O endpoint tem allowlist HTTPS de provedores conhecidos para impedir SSRF. No máximo cinco subscriptions ativas por integrante. Uma subscription não pode ser transferida a outra sessão/evento silenciosamente. Revogação do integrante desativa Web Push e tokens Expo; o opt-out global continua sendo verificado no gate existente.

`web-push@3.6.7` implementa criptografia e VAPID no servidor. Configurar VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT nos secrets da Edge; apenas a chave pública correspondente pode ser copiada para events.notification_vapid_public. Não colocar a chave privada no app, logs ou repositório. Não rotacionar chaves sem plano de renovação de subscriptions. O adapter registra admissão por dispositivo, invalida 404/410 e não repete resultados incertos. Provider aceitou não significa notificação exibida ou lida.

## E-mail

Resend existente, com HTML escapado, texto integral/parágrafos e link canônico configurável por WEB_BASE_URL. Notificações recorrentes têm consentimento próprio; não herdam autorização do convite inicial. A Minha conta permite autorizar/revogar por integrante, respeitando opt-out global e contato válido. O link de gerenciamento exige autenticação normal. O envio inicial de convites e seu template não mudam.

Antes de ativar EMAIL: conferir EMAIL_PROVIDER=resend, EMAIL_API_KEY, EMAIL_FROM, domínio/DNS, quota diária/mensal e destinatários de teste autorizados. `sent` significa aceitação pelo Resend. Não há alegação de entrega confirmada: webhooks de entrega/rejeição não foram simulados. A interface distingue ignorado, falha e resultado incerto.

## Cron e ativação

Migration operacional Supabase: pg_cron, pg_net e Vault. Cria segredo aleatório no Vault, guardando apenas ID/hash na configuração privada. RPC de validação é restrita a service_role; não oferece acesso ao segredo. A Edge aceita tanto o WORKER_SECRET existente quanto autenticação Vault-backed. Nunca imprimir secrets ou headers de chamadas pg_net.

O job `wedding-notifications` é criado **inativo**, frequência `*/5 * * * *`. Até 8.640 verificações SQL por 30 dias, com zero invocações Edge quando não houver trabalho. Cada chamada processa no máximo 50 jobs; campanhas maiores precisam de múltiplos ciclos. No plano Free observado, verificar o uso real de Functions antes de ativar; a frequência de cinco minutos reduz custo e não é SLA de entrega. Jobs têm leases, SKIP LOCKED, até seis tentativas, espera de cinco minutos e admissão final de consentimento. Resultado externo incerto exige revisão.

Configurar endpoint canônico na linha única de notification_private.worker_config; manter enabled=false e cron.job.active=false até testes controlados. Configurar flags externas somente após VAPID/Resend verificados. Os defaults de instalação para notification_email_enabled e notification_push_enabled são false; nenhum consentimento é fabricado. notification_scheduling_enabled permanece inalterado (false na auditoria). Não ativar regras se houver risco de lembretes indevidos. Não usar convidados reais em testes.

Rollback operacional: desativar Cron/configuração e a flag de agendamento; preservar publicações, destinatários, tentativas, consentimentos e auditoria. Não desfazer metadados nem restaurar wrappers antigos que reintroduzam envios ou exposição de conteúdo.

## Validação

Unitários de datas, estados e permissão Push; Edge tests com providers simulados (HTML, SSRF, subscription expirada, falha, incerteza); SQL/RLS com upgrade/rollback, autorização, replay, consentimentos, concorrência, paginação e regras expiradas. O contrato SQL do Cron/Vault/HTTP usa stubs locais: não equivale a uma entrega real. Produção deve ser verificada por catálogo e job inativo antes da ativação. E2E cobre revisão, ausência de destinatários segmentados/WhatsApp, publicação por EMAIL sem IN_APP, leitura persistida, mobile, agenda e regressão de conversas.

## Exclusão lógica de notificações gerais

`20261025201300_notification_soft_delete.sql` reutiliza deleted_at/deleted_by e adiciona NOTIFICATION_DELETE ao wrapper administrativo, sem alterar assinaturas públicas, RLS ou flags de ativação. A ação valida ADMIN por evento e exige publicação geral com origem identificada; mensagens privadas são recusadas. Repetição conserva a primeira data/operador e não duplica auditoria. Não há restauração. O histórico administrativo conserva conteúdo, publicação, exclusão, destinatários, jobs e tentativas.

A exclusão serializa por evento e bloqueia convidados em ordem antes da mensagem e dos jobs, como a admissão do worker. Pendências e leases ainda não admitidas viram skipped. Chamadas já admitidas podem concluir: seus recibos não são falsamente cancelados. Claims ignoram tombstones e não recuperam envios excluídos; resultados incertos continuam sem repetição automática. Regras automáticas conservam sua publicação única mesmo após exclusão, impedindo republicação da regra.

Convidados não leem tombstones por feed, snapshot, leitura direta ou outras sessões. A revisão do feed (contagem monotônica de publicações excluídas, sem restauração) invalida páginas já carregadas quando o snapshot é atualizado, incluindo respostas de paginação em voo. O indicador de leitura passa a Lido, sem alterar o receipt familiar. A atualização existente do aplicativo continua sendo utilizada.

Testes: upgrade/rollback, ADMIN versus GUEST/CEREMONIALIST, eventos, exclusão idempotente, preservação de auditoria/tentativas/mensagens privadas, paginação, admissão antes/depois da exclusão, claims concorrentes, regra automática sem republicação, confirmação/cancelamento, mobile/desktop e persistência entre dispositivos. Nenhuma notificação real é excluída por testes ou pela instalação da migration.
