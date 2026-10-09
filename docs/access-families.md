# Acessos, famílias e convidados

## Implantação após o merge

Esta fase não altera o projeto Supabase hospedado automaticamente. O deploy do Pages continua consumindo somente URL e Publishable key públicas pelas Repository Variables. Não acrescente Service Role ou outra chave privilegiada ao GitHub.

1. Faça backup do projeto hospedado e valide a migration em homologação. Em um terminal de operação autenticado na Supabase CLI, vincule o projeto correto e confira migrations pendentes:

   ```sh
   supabase link --project-ref '<PROJECT_REF>'
   supabase migration list
   supabase db push --dry-run
   supabase db push
   supabase functions deploy redeem-invitation --no-verify-jwt
   ```

   A migration de autenticação é `202610090003_access_families.sql`; a evolução de unidades de acesso usa `202610090004_access_units.sql` (veja [unidades de acesso](access-units.md)). Não execute `db reset` no projeto hospedado nem reaplique migrations antigas. A assinatura antiga de redeem somente por código é removida: durante o intervalo entre migration e deploy da Edge, a ativação falha de forma segura. Publique a Edge atualizada antes de distribuir novos convites. `--no-verify-jwt` desabilita apenas a checagem legada do gateway (incompatível com algumas chaves atuais); o handler **sempre** valida o token com `auth.getUser` e exige `is_anonymous=true`. Nenhuma operação anônima sem sessão é aceita.

2. Mantenha Anonymous Sign-ins habilitado e a proteção antiabuso do Auth/gateway. Mantenha o provider Email/password e o SMTP Resend atuais. Desative cadastro público de usuários com e-mail se somente contas previamente autorizadas devem existir; signup anônimo continua habilitado. Não remova templates ou credenciais SMTP.
3. Em Auth → URL Configuration, configure Site URL e redirect permitido com o base path atual: `https://felipecontaremota-dot.github.io/convite-felipe-e-lais/recuperar-senha`. Homologação deve ter seu próprio endereço. Para recuperação nativa, autorize também `felipeelais://recuperar-senha` e mantenha o esquema do aplicativo. O botão atual envia para a URL web pública, que permite a recuperação pelo navegador em qualquer dispositivo.
4. Em Auth → Email Templates → **Reset Password**, o template padrão pode usar a sessão implícita no fragmento de `/recuperar-senha`. Como alternativa, use o token de recuperação de uso único na rota explícita (não mude o template de OTP para login normal):

   ```html
   <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery"
     >Definir nova senha</a
   >
   ```

   O app aceita os dois formatos oficiais nesta rota: `?token_hash=...&type=recovery` por `verifyOtp({type:'recovery'})`, ou `#access_token=...&refresh_token=...&type=recovery` por `setSession()`, sem repetir `verifyOtp`. Os dois formatos são capturados temporariamente em memória e removidos com `history.replaceState` antes de inicializar o Router ou fazer chamadas de rede, impedindo que a navegação restaure tokens na URL. Somente o Supabase gerencia a persistência da sessão. Fragmentos com erros são rejeitados sem exibir conteúdo recebido do provider. Uma sessão autenticada existente pode ser reutilizada para alterar a própria senha após validar ADMIN/CEREMONIALIST, inclusive ao recarregar a URL já limpa. Falha técnica na consulta do papel preserva a sessão e permite nova tentativa sem outro e-mail; ausência real de papel provoca logout. Links são de uso único e expiram conforme a configuração do Auth. Teste o SMTP e a recuperação em homologação.

5. Confirme os UUIDs de Felipe, Laís e cerimonial em `auth.users` e os papéis existentes de `user_roles` para o evento correto. Papel é concedido por operador confiável; nunca pelo formulário de login. ADMIN abre `/painel`; CEREMONIALIST abre `/checkin`; uma conta sem esses papéis é desconectada.
6. Para cada família já existente, salve uma senha na área Famílias. A migration de upgrade mantém as senhas e códigos existentes. Unidades individuais novas recebem senha própria. Vínculos anteriores sem senha permanecem no banco, mas precisam ser reativados uma vez para receber `pin_verified_at`. Novas ativações exigem código + senha. Não distribua o novo fluxo antes de configurar as senhas.
7. Verifique em homologação código/senha, persistência, logout, revogação e isolamento. Depois confira o deploy do Pages que acompanha o merge. Nenhum convite real é enviado por esta fase.

## Primeira senha de Felipe e demais usuários antigos de OTP

Se Felipe ainda tem uma sessão autenticada válida com papel ADMIN, pode abrir `/conta` (ou “Minha conta”) e definir a própria senha. A senha anterior não é solicitada ou exibida. Uma conta existente sem senha e sem sessão deve informar seu e-mail em `/login` e usar **Esqueci minha senha**, depois que o template e as URLs acima estiverem configurados. O link seguro permite definir a primeira senha via `auth.updateUser({password})`; depois o login normal é e-mail + senha. Um operador também pode iniciar a recuperação pelo painel Auth do Supabase, usando o mesmo template. Não compartilhe uma senha administrativa nem copie tokens para documentação/logs.

A UI exige ao menos oito caracteres e confirmação; o Supabase aplica sua política de senha adicional. Uma sessão antiga pode exigir reautenticação conforme as políticas de segurança do Auth. Senhas administrativas pertencem exclusivamente ao Supabase Auth, não ao banco público, caches ou logs da aplicação.

## senha e sessões familiares

O link usa código aleatório de 192 bits. A Edge recebe `{event_id,code,pin}` e valida sessão anônima, evento, convite ativo/não bloqueado, senha de quatro dígitos e rate limit antes de vincular o UID. O modo `{action:'identify',event_id,code}` retorna **somente nome da família e se este UID já está ativado para este código**. Não revela integrantes ou concede acesso. Um código diferente/inválido nunca reutiliza o vínculo de outra família para autorizar aquela URL.

A senha é uma string (`0047` é válido). Escolha proporcional: `invitation_access` armazena senha e, para links novos, código de compartilhamento em texto, com SELECT sob RLS exclusivo ADMIN e nenhuma mutação direta por clientes. Esses campos não estão em `invitations` e não entram em snapshots de convidados/cerimonial. Isso permite que administradores autorizados copiem link + senha sem outro sistema de criptografia/chaves. O hash do código continua sendo usado na validação. QR continua armazenado somente por hash; esta decisão não altera ingressos.

Códigos anteriores não são reversíveis a partir do hash. É possível copiá-los no dispositivo que os gerou, se o cache antigo estiver presente; para disponibilizá-los aos demais administradores, regenere explicitamente. Regenerar invalida o link anterior e os vínculos; não ocorre automaticamente ao copiar.

- **Salvar senha:** muda a senha de próximas ativações; preserva os dispositivos já autorizados.
- **Revogar dispositivos:** remove os vínculos, preserva link e senha. O mesmo UID precisa ativar novamente.
- **Regenerar link:** novo código aleatório, invalida link e vínculos anteriores, preserva a senha.
- **Bloquear link/desativar família:** encerra vínculos e impede ativação.

Auth mantém `persistSession:true` e `autoRefreshToken:true`; não guarda a senha no armazenamento do convidado. Sair, limpar dados ou usar outro dispositivo exige nova ativação. O backend reconhece o vínculo, não um booleano local.

São permitidas até 15 tentativas de ativação por usuário/endereço/código em 15 minutos, além do teto de 1000 por evento. Identificação tem contadores separados de 60, para não consumir tentativas de senha. Contadores e tentativas malsucedidas permanecem gravados; código/senha incorreto e bloqueio usam a mesma mensagem pública: `Código ou senha inválido.`. O endereço deve vir de gateway confiável (`x-real-ip`), nunca de um header arbitrário do cliente. Limites por código e evento também continuam operando quando se muda UID/endereço. CAPTCHA/WAF do Auth complementam os limites; a senha curto e a sugestão de telefone priorizam simplicidade, não identidade individual forte.

Revogação vale imediatamente no servidor. Ao atualizar online, o dispositivo recebe snapshot vazio e limpa fila/ingressos. Offline, o aparelho conserva a última autorização conhecida até reconectar; não existe revogação instantânea sem rede. Preserve esse limite operacional para o check-in.

## Cadastro e comunicação

Família pode ser criada somente com nome e senha opcional. Convidados são cadastrados separadamente, inicialmente com acesso INDIVIDUAL, RSVP PENDING, link e senha próprios. O responsável de uma FAMILY só pode ser um de seus membros. WhatsApp do responsável permite sugerir os quatro últimos dígitos; mudar telefone ou responsável nunca altera a senha automaticamente. Gerar senha produz quatro dígitos, inclusive zeros iniciais.

O cadastro usa nome, criança (até 10 anos), vínculo predefinido opcional, WhatsApp, e-mail e observações. Valores legados de vínculo são preservados na edição. Adolescente e acompanhante deixam de participar da UX e dos novos payloads. Contatos continuam em `guest_contacts`, normalizados para dígitos brasileiros sem +55, com máscara somente na interface. Observações ficam em `guest_admin_details`, sob RLS ADMIN; a lista mostra somente o indicador de observação. Edição administrativa preserva consentimentos e `consent_changed_at`.

Associação, remoção de membros e exclusão de família ocorrem em RPC transacional, com versões esperadas. Mover para FAMILY arquiva o acesso individual antigo; remover ou excluir FAMILY cria acesso individual por membro. RSVP, contatos e histórico sobrevivem. Dispositivos de origem/destino são revogados para não expor convidados através de vínculos antigos, e QR dos convidados movidos é revogado. Excluir convidado é uma ação global diferente, confirmada explicitamente. Juntar/dividir famílias deixa de existir na UI e é rejeitado no RPC público.

Envio é independente de RSVP. `sent_at` e `sent_channel` ficam preparados para comunicações futuras. `first_activated_at` registra a primeira ativação e permanece histórico após revogar. `delivery_status` é derivado: OPENED após ativação, SENT quando existe envio, NOT_SENT nos demais casos. O painel conta “não enviados” por `sent_at`, de forma que uma família ativada manualmente pode continuar não enviada. `device_count` considera apenas vínculos com senha verificada. Nenhuma ação nesta fase registra envio fictício ou dispara e-mail de convite.

Auditoria registra senha alterado, responsável, família, links, ativação/erro, revogação e CRUD/movimentação de convidados, sem senha, código, senha, notas ou contato nos metadados.

## Validação

`npm test` cobre regras de senha, contatos, Auth por senha/papéis, troca de senha e persistência com o cliente oficial Supabase e HTTP simulado. `npm run test:functions` inclui o handler de acesso e providers sem envio externo. `npm run test:db` executa migrations/RLS/RPCs reais em PostgreSQL 17 descartável, com stub de Auth; inclui `access-database.sql`, `access-units.sql` e comparação do estado antes/depois da migration incremental. Playwright executa dois servidores: demo para regressões existentes e configuração Supabase fictícia para exercitar protocolo de login/senha, sessão e revogação no navegador. Não usa contas/credenciais de produção. SMTP, gateway e Auth hospedado devem ser validados manualmente em homologação; testes locais não afirmam um deploy remoto.
