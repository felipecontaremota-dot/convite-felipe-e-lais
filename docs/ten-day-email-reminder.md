# Lembrete — Faltam 10 dias

## Operação

ADMIN > Notificações contém a configuração exclusiva de e-mail, estimativa dinâmica,
assunto/mensagem, prévia fictícia, verificação da arte, teste e resultados individuais.
Salvar a mensagem antes de testar: o teste usa a versão salva, a prévia usa o rascunho.
Preservar `{{nome}}`, `{{link}}`, `{{senha}}`. Outros placeholders são rejeitados;
HTML digitado é escapado. `**texto**` produz negrito. Após iniciar o disparo,
assunto/corpo ficam imutáveis. Nenhum PIN/link é persistido no contexto de envio.

A campanha é instalada DESATIVADA e não habilita o canal geral de e-mail nem Push.
É um lembrete transacional do convite, com as credenciais existentes, não uma
publicação geral/mensagem de marketing. Respeita `communications_revoked` e unidades
inativas/arquivadas, além de exigir RSVP `CONFIRMED`, e-mail válido e dados reais
necessários. Não altera os consentimentos. Os campos de opt-in das publicações
gerais e suas regras permanecem intactos, assim como o template de 20 dias.
Cada pessoa é independente, inclusive quando compartilha e-mail ou unidade familiar.

O vencimento deriva exclusivamente de `events.starts_at - interval '240 hours'`,
a mesma data-alvo do cronômetro. Hoje: **05/12/2026 às 16h de Brasília**, UTC
`2026-12-05T19:00:00Z`. Alterações no evento antes do disparo acompanham o agendamento.
O Cron existente `wedding-notifications` continua `*/5 * * * *` e seu worker usa o
segredo existente no Vault. O início pode ocorrer no tick seguinte/latência operacional;
a aceitação ou entrega pelo Resend não acontece necessariamente nesse instante.

A janela automática de recuperação é uma hora após o horário. Arte ausente ou
janela ultrapassada bloqueia o processamento. Depois de regularizar e verificar a
arte, ADMIN pode **Retomar processamento por uma hora**, sempre antes do casamento.
Não existe disparo retroativo indefinido. Após início, novos destinatários não são
acrescentados automaticamente; RSVP/dados são novamente validados por entrega.

## Infraestrutura reutilizada e segurança

Reutiliza `dispatch-notifications`, provider Resend, `notification_jobs`,
`delivery_attempts`, `audit_logs`, leases, marcadores de admissão e Cron/Vault.
A migration acrescenta configuração e contexto privados, não outra fila/provedor.
Os dados de configuração pertencem ao evento; somente a RPC ADMIN os consulta/edita.
Convidados/CEREMONIALIST/anon não podem ler ou escrever configuração/destinatários.
As funções operacionais e o acesso à configuração do teste são service-only e o
Edge exige autenticação ADMIN antes de processar ações administrativas.

Um índice único `(ten_day_campaign_id, guest_id)` e a chave persistente
`ten-day:<campanha>:<convidado>` protegem concorrência e reinicializações. A
admissão final é atômica e revalida RSVP, e-mail, nome, unidade e fingerprint das
credenciais. O hash do payload Resend é fixado antes do POST. Mudança de conteúdo,
remetente ou personalização não permite reutilizar a chave com outro payload.

Falhas definitivas podem ser reprocessadas com os mesmos dados e chave. Timeout,
resultado indeterminado ou processo encerrado após admissão não são automaticamente
reenviados. A retenção de idempotência do Resend não é tratada como garantia eterna;
o marcador persistente local continua protegendo resultados indeterminados.
Referência: https://resend.com/changelog/idempotency-keys (retenção de 24 horas e
payload idêntico para reutilização da chave).
Uma confirmação do Resend significa **aceito pelo provedor**, não entregue. Não
há webhook de entrega configurado neste projeto; a interface não inventa entregas.
Consultar o Resend para investigação manual de resultados indeterminados.

O teste usa nome/link/PIN fictícios, destino informado pelo ADMIN, reserva
persistente por UUID e limite de cinco solicitações por evento/hora. Não reserva
convidados nem altera campanha, RSVP ou agendamento. Se um teste ficar indeterminado,
conferir no provedor antes de solicitar outro. Não há logs de PIN/link/token.

## INSTRUÇÕES PARA UPLOAD MANUAL DA IMAGEM

1. Acessar o Supabase Dashboard do projeto de produção **nwgyxmwaqckpghznbfzm**.
2. Abrir **Storage > Files > convites-assets**.
3. Fazer upload MANUAL na raiz desse bucket, sem criar pasta.
4. Nome exato: **Template-Faltam 10 dias-horizontal.png**.
5. Caminho: `convites-assets/Template-Faltam 10 dias-horizontal.png`.
6. O bucket já é público, como no convite original. Não alterar políticas/permissões.
7. URL esperada:

   https://nwgyxmwaqckpghznbfzm.supabase.co/storage/v1/object/public/convites-assets/Template-Faltam%2010%20dias-horizontal.png

8. Abrir essa URL em uma janela sem autenticação: deve exibir a arte aprovada,
   responder HTTP 200 com `Content-Type: image/png` e manter proporções originais.
9. Em ADMIN > Notificações, clicar **Verificar imagem do lembrete**. O servidor
   confere HTTP, MIME e o cabeçalho/dimensões PNG; falhas não são tratadas como sucesso.
10. Salvar a mensagem, pré-visualizar e enviar um teste para um endereço controlado.
    Conferir Gmail/Outlook/Apple Mail, imagem, texto, botão e espaçamento. Os dados
    do teste são fictícios; não testar credenciais de convidados reais.
11. Somente após conferir o teste, ativar e salvar o envio automático.
12. Se o horário já tiver passado e houver bloqueio, verificar a imagem e utilizar
    a retomada explícita; ela abre uma janela de uma hora.

**Não é necessário novo deploy após o upload.** O caminho é resolvido no runtime.
O Códex não cria, modifica, substitui ou envia a arte. Enquanto o arquivo não
existir e o teste recebido não tiver sido conferido, a validação visual definitiva
permanece pendente. Não confundir os testes automatizados de PNG com a arte real.

## Validação

- Unitários: texto aprovado, placeholders, escaping, data-alvo, layout HTML e
  preservação do convite original.
- Deno: disponibilidade PNG, bloqueio, admissão, resultado definitivo/incerto,
  autorização ADMIN e teste sem credenciais reais.
- PostgreSQL descartável: upgrade/rollback, RLS/ACL, datas relativas, RSVP dinâmico,
  e-mail compartilhado, concorrência, idempotência, contexto/receipts e retomada tardia.
- Playwright: configuração ADMIN, placeholders, persistência e prévia em mobile/desktop.
- Suítes completas do projeto, lint, tipos, build e exportação web.
