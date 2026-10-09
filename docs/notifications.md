# Notificações e entregas

Seed cria lembretes de 30, 20, 15, 10, 7, 5, 2, 1 e 0 dias antes das 16h de 15/12/2026 em São Paulo. Título, texto, ativo e canais são editáveis pelos noivos; data é calculada a partir do instante do evento. O banco não depende do fuso do aparelho. A hora escolhida para todos os lembretes é 16h local, documentada como default.

`dispatch-notifications` é worker protegido por WORKER_SECRET, chamado por POST com x-worker-secret por um scheduler confiável. Ele agenda regras devidas dentro da janela de 24 horas de cada lembrete (sem disparar todos os lembretes antigos no primeiro agendamento), obtém no máximo 50 jobs com SKIP LOCKED e lease, reconsulta consentimento e provider e registra o resultado. Configure uma execução periódica, por exemplo a cada cinco minutos, em homologação antes de habilitar em produção. Nenhum worker foi agendado remotamente nesta tarefa.

Mensagens ADMIN podem ter destinatário pessoa, convite ou todos. O histórico e destinatários ficam no banco; avisos gerais ficam destacados na Home. Conversas GUEST registram convite, identidade opcional do integrante, auth.uid e data. Cerimonial não recebe essas conversas. O código familiar concede leitura aos integrantes do convite; não promete privacidade entre membros da mesma família.

IN_APP é mensagem persistida, com ID derivado do job para evitar duplicação e destaque de regra único. Ausência de contato usa consentimento in_app=true; o usuário pode revogá-lo. Consentimentos de push, e-mail e WhatsApp são false por padrão. A autorização determina entregas proativas, não a leitura de mensagens e informações já disponibilizadas ao convite.

| Canal    | Provider       | Requisitos                                                                                                                    |
| -------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| IN_APP   | PostgreSQL     | Evento e usuários vinculados                                                                                                  |
| PUSH     | Expo Push      | projeto EAS, development/production build, token e consentimento; APNs/FCM                                                    |
| EMAIL    | Resend         | EMAIL_PROVIDER=resend, EMAIL_API_KEY, EMAIL_FROM verificado, contato autorizado                                               |
| WHATSAPP | Meta Cloud API | WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION válida, WHATSAPP_TEMPLATE_NAME aprovado e consentimento |

Canais não configurados retornam skipped com razão. Não se usa logger como prova de entrega. Push no navegador não é registrado; avisos in-app continuam funcionando. No nativo, o usuário concede consentimento e permissão do sistema; o Perfil registra Expo token. Revogação desativa tokens ativos.

Jobs: pending → processing → sent / failed / skipped. `delivery_attempts` registra provider, resultado, erro sanitizado e ID externo. `sent` externo significa aceitação pelo provider; receipts Expo/WhatsApp/Resend e confirmação de leitura exigem processamento futuro dos callbacks, não são simulados. Campos de conteúdo/contato/código não entram em logs técnicos.

Idempotency_key é UNIQUE no banco. Resend recebe a chave idempotente; IN_APP usa IDs fixos. APIs Expo e Meta não garantem idempotência ponta a ponta. Em erro/resultado incerto desses canais, o worker não reenvia automaticamente (marca failed com attempts=6) para evitar duplicação; o operador deve consultar o provider e revisar antes de rearmar. Outros erros têm backoff de cinco minutos, até seis tentativas. Reenvio após falha local de persistência também precisa de revisão para canais sem garantia externa.

Credenciais ficam em Supabase secrets. Domínios necessários aos workers: exp.host, api.resend.com, graph.facebook.com. WORKER_SECRET deve ser aleatório, diferente da service role; nunca incluir no app. Política de privacidade final deve documentar providers e consentimento. Não há envio real durante a demonstração.
