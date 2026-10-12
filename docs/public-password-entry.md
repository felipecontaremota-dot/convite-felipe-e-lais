# Página pública e acesso pela senha

## Diagnóstico

A raiz usava `PublicHome` em `src/features/auth/PublicScreens.tsx`: código + senha, seguidos de `AppProvider.enter` → `api.redeem` → Edge `redeem-invitation` → RPCs `identify_invitation`/`redeem_invitation`. O banco guarda o hash do código em `invitations.code_hash` e a senha de quatro dígitos em `invitation_access.pin`, com leitura restrita ao ADM. A RPC tradicional verifica código + senha e vincula o usuário anônimo em `invitation_sessions`.

Não existia resolução somente pela senha. Tampouco existe constraint de unicidade por senha; geração pelo WhatsApp, fallback aleatório e edição manual podem produzir colisões. Não foi consultada nem alterada a lista real de produção.

## Implementação

A raiz tem cabeçalho existente, título “Um novo capítulo, juntos.”, o mesmo `WeddingCountdown` e apenas “Senha do convite”/“Abrir convite”. O alvo usa a constante central existente `2026-12-15T16:00:00-03:00`; não há segundo contador. O acesso dos noivos/cerimonial permanece como link discreto para `/login`. Demonstração continua restrita ao modo de desenvolvimento existente.

`AppProvider.enter(null, senha)` utiliza a mesma criação de usuário anônimo, invalidação de snapshot/cache e sessão atuais. A API envia `action=password`, sem código, à Function existente. Não baixa convites para comparar no browser.

A nova RPC `redeem_invitation_password(event,user,pin,bucket)` é SECURITY DEFINER com search_path explícito e EXECUTE somente para service_role. O cliente não pode chamá-la diretamente. A Function valida JWT, usuário anônimo, formato do evento/senha e faz a chamada usando o UID autenticado. O retorno público é somente `{"linked":true}` ou erro genérico, sem título, nome, IDs de convites, roster, PIN ou sharing_code.

No banco, somente unidades ativas, não arquivadas e com código ativo podem entrar. Senhas ambíguas são rejeitadas; nenhuma família é escolhida arbitrariamente. A sessão é vinculada ao convite único e o first_activated_at/audit de ativação seguem o contrato existente. Nenhum código, PIN, sharing_code ou code_hash é alterado. O snapshot seguinte contém somente os dados autorizados da unidade.

A migration incremental é `202610120009_password_entry.sql`, com uma função e seus grants/revokes. Não altera tabelas, RLS, migrations antigas ou dados existentes. Usa contratos de 003/004, sem depender da 008 de Perfil; a instalação limpa e um upgrade local somente de 001–007 + a nova migration foram exercitados. O nome/versionamento não reaproveita a migration cancelada de QR familiar.

## Limites e segurança

Senha inexistente, ambígua, convite inativo/bloqueado e limite de tentativas usam `invalid_password`/“Senha inválida.”. Falhas técnicas continuam distintas, sem serializar detalhes internos. Sessões de staff não são substituídas por acesso familiar.

O limite atômico existente é reutilizado: 15 tentativas por janela de 15 minutos por IP/usuário, além do limite global de 1000 por evento. A chave de código do acesso novo deriva do usuário, não de cada senha tentada; alterar a senha ou criar outro usuário não evita o limite por IP. O endereço é transformado em SHA-256 e a senha não vai para logs/chaves de rate limit. Os limites não são consultados ou modificados em produção nesta tarefa.

**Mudança de segurança:** retirar o código longo deixa uma credencial de apenas 10 mil combinações como único fator. Os limites mitigam tentativas, mas não tornam quatro dígitos equivalentes ao acesso anterior nem impedem ataques distribuídos. Antes da publicação, avaliar esse risco e a configuração antiabuso do signup anônimo já existente. Não aumentamos senhas, habilitamos CAPTCHA, mudamos regras de criação ou contratamos serviços automaticamente.

É necessário conferir se `x-real-ip` é fornecido/normalizado por um gateway confiável na implantação. Ausência do header agrupa solicitações no bucket `unknown`, limitando-as conjuntamente. IPs compartilhados/NAT também compartilham quota. Nenhuma consulta às configurações de produção foi feita. Unicidade real das senhas deve ser auditada por leitura autorizada; esta implementação não promete que os registros existentes sejam únicos.

## Links exclusivos e implantação futura

`/c/<code>`, a identificação prévia da família e o campo “Senha de acesso” continuam usando o fluxo anterior. Colisões de PIN não impedem entrar pelo link exclusivo. Não foram regenerados ou enviados convites.

Para ativar após revisão: primeiro aplicar a nova RPC por operação autorizada e compatível com o estado/histórico verificado, depois publicar somente a atualização de `redeem-invitation`, preservando autenticação/secrets, e por último publicar o frontend. A Function nova é compatível com os links/código existentes. Não usar db push indiscriminado para aplicar a 008 ou reparar timestamps como efeito colateral; a divergência histórica requer tratamento separado. Esta tarefa não executa nenhuma dessas operações.

Até a RPC/Function serem implantadas, a nova raiz não poderá autenticar somente pela senha. Não alterar DNS ou Pages para tentar compensar ausência da RPC. O fluxo de links exclusivos permanece disponível.

## Validação

Testes cobrem formato/entrada vazia antes de autenticação, protocolo mínimo da Function, booleans/ACLs das RPCs reais, usuário anônimo e staff, sessão correta, isolamento, inativo/bloqueado, colisões, link exclusivo com colisão, quota por IP mesmo mudando usuário/PIN, credenciais preservadas, reload, interface desktop/mobile, relógio e login administrativo. PostgreSQL e bridge da Function são locais/descartáveis; não acessam Supabase real. Build/export testa domínio raiz, rotas e PWA com chamadas externas interceptadas.
