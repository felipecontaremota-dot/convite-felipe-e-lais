# Banco e migrations

Aplique `202610090001_foundation.sql`, `202610090002_operations.sql` e o seed, nesta ordem, em um projeto Supabase de desenvolvimento. `supabase db reset` usa essas fontes localmente. Não execute reset em produção. Seed é repetível e preserva edições existentes; o evento tem ID `00000000-0000-4000-8000-000000000001`, data absoluta `2026-12-15T19:00:00Z`, fuso `America/Sao_Paulo` e localização null.

| Domínio      | Tabelas                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| Evento       | events, event_settings                                                       |
| Identidade   | profiles, user_roles, invitation_sessions                                    |
| Famílias     | invitations, guests; invitation_members é view sobre guests                  |
| Contato/RSVP | guest_contacts, rsvps                                                        |
| Presentes    | gifts, gift_selections                                                       |
| Conversa     | message_threads, messages, message_recipients, announcements                 |
| Notificação  | device_push_tokens, notification_rules, notification_jobs, delivery_attempts |
| Entrada      | qr_credentials, checkins                                                     |
| Integrações  | sheet_sync_jobs                                                              |
| Operação     | audit_logs, mutation_receipts, invitation_rate_limits                        |

Entidades têm UUID, timestamps e event_id quando aplicável. FK compostas `(event_id,id)` impedem referências entre eventos. `user_roles` contém apenas ADMIN/CEREMONIALIST; GUEST é derivado de vínculo ativo. Não se pode inserir o próprio papel. O contato principal e acompanhante são verificados nas RPCs. A view de membros usa `security_invoker`, portanto herda RLS de guests.

Funções públicas permitidas a authenticated: `event_role`, `my_invitation`, `owns_guest`, `app_snapshot`, `app_mutate`, `admin_action`, `issue_ticket`. Todas fixam search_path. RPCs privilegiadas verificam `auth.uid()`; o cliente não decide o evento de autorização ou o convite. Associações de convite, claim de jobs e scheduler só são executáveis pelo service role. Revogue privilégios padrões de função ao criar futuras funções.

RLS está habilitada em todas as tabelas. Não há INSERT/UPDATE/DELETE de tabelas para anon/authenticated. ADMIN lê dados do seu evento. GUEST lê seu convite e integrantes, RSVP/contatos pertinentes, presentes ativos, avisos e mensagens do convite. CEREMONIALIST usa snapshot reduzido, sem leitura direta de conversas/contatos. A tabela events permite leitura pública dos dados não pessoais do evento.

`mutation_receipts` tem chave evento/usuário/UUID. `checkins` também possui UNIQUE evento/convidado e mutation_id; uma segunda tentativa retorna a entrada original com `duplicate=true`. RSVP negativo revoga QR. Código de convite é 192 bits em hexadecimal, armazenado como SHA-256; QR é 256 bits, hash armazenado. `version` evita edições concorrentes de famílias, convidados, presentes e regras. Auditoria usa actor/action/entity/id; não registra conteúdo, contato ou códigos.

Notifications usam status pending/processing/sent/failed/skipped, tentativas e leases de dez minutos. Sheets usa pending/processing/success/failed e contador de versão por entidade: uma alteração durante sincronização mantém o job pending. Falhas de provider não eliminam dados do app.

`npm run test:db` cria um PostgreSQL 17 temporário e executa migrations reais com uma tabela auth.users e auth.uid stub. Testa chamadas com SET ROLE authenticated/service_role e JWT subject simulado. Não acessa um projeto remoto. Antes do lançamento, valide também signup anônimo, OTP/SMTP, gateway e scheduler no projeto de homologação.
