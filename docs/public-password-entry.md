# Acesso pela senha — reconstrução local da 009

## Contratos preservados

A raiz mantém “Um novo capítulo, juntos.”, contador compartilhado, campo de senha, botão e acesso discreto de staff. `AppProvider.enter(null, senha)` usa o usuário anônimo existente e a Edge `redeem-invitation` com `action=password`. A resposta pública é apenas `{"linked":true}` ou erro genérico. UID vem da autenticação, nunca do payload. O browser não consulta a disponibilidade de senhas.

O fluxo `/c/<code>` continua passando por `identify_invitation`/`redeem_invitation`, com código longo e senha. Nenhuma credencial emitida, link, sessão, RSVP ou QR é rotacionado pela instalação. Migrations 001–008 permanecem intactas. A 009 funciona também sobre 001–007, sem depender da 008.

## Registry privado e elegibilidade

`password_entry_private.resolution` guarda somente evento, UUID do convite e fingerprint HMAC-SHA256. A PRIMARY KEY `password_entry_unique(event_id,fingerprint)` é a autoridade de unicidade, inclusive entre transações concorrentes. Há UNIQUE por convite e FK composta para convite/evento. Não há escolha arbitrária de um convite nem tolerância de ambiguidade.

`eligible_source` centraliza a definição usada pelos triggers, backfill e resgate: convite ativo, não arquivado, `code_hash` hexadecimal minúsculo de 64 caracteres, `invitation_access` associado ao mesmo convite/evento e senha ASCII de quatro dígitos. O preflight também consulta esse helper; qualquer DDL privado provisório e chave criada na transação são desfeitos se a instalação abortar. Não transforma credenciais inativas em elegíveis.

Triggers cobrem INSERT/UPDATE/DELETE e TRUNCATE das duas fontes. Barreiras `FOR NO KEY UPDATE` no convite impedem que alterações do acesso confirmem enquanto um resgate valida a sessão. O resgate não bloqueia a linha de acesso, evitando inversão com seu escritor. Reassociações bloqueiam pais em ordem determinística e removem o vínculo antigo que perdeu elegibilidade antes de inserir o novo; a constraint permanece ativa. Transações rejeitadas desfazem fonte e registry juntas.

## Derivação, ACLs e limitações

O fingerprint usa `HMAC(event_uuid + ':' + senha, chave aleatória de 32 bytes, SHA256)`. A chave fica em tabela privada separada do registry. Um vazamento isolado do registry não permite testar os 10 mil PINs sem a chave. Isso não protege um backup completo que contenha chave e os PINs legados, já presentes em `invitation_access`.

Schema, tabelas e funções privadas não têm acesso para PUBLIC, anon, authenticated ou service_role. Tabelas privadas têm RLS sem policies. OWNER é postgres. Funções internas são INVOKER; o trigger e as duas entradas autorizadas são DEFINER, com `search_path=pg_catalog` e referências qualificadas. `create_individual_access` permanece interno, sem EXECUTE para os papéis da API. Apenas service_role recebe EXECUTE de `redeem_invitation_password`; esse privilégio não concede leitura do registry. RPCs não relacionadas conservam definição, OWNER e ACLs.

Não há rotação automática da chave. Uma futura rotação exige operação administrativa separada, transacional, com recomposição integral dos fingerprints e validação da unicidade; nunca sobrescrever a chave isoladamente. Esta tarefa não a executa.

## Alteração autorizada no gerador de credenciais

Somente a definição de `create_individual_access` é evoluída pela 009. Antes, o helper usava os últimos quatro dígitos do WhatsApp ou um sorteio que podia colidir. Agora, em NOVAS credenciais automáticas, prefere o sufixo do WhatsApp; se ocupado, percorre candidatos disponíveis do mesmo evento. Sem WhatsApp, começa em posição aleatória.

A pré-consulta é uma otimização. A inserção e o trigger enfrentam a UNIQUE real. Apenas o erro controlado `invitation password conflict` é capturado em subtransação para tentar outro candidato. Outros erros são propagados. Nenhum PIN existente é atualizado por esse helper. Senha explicitamente escolhida não passa pelo helper e continua sendo rejeitada em caso de colisão.

O domínio é `0000`–`9999`: 10 mil credenciais simultaneamente elegíveis por evento. A busca tem no máximo uma preferência e 10 mil candidatos, sem loop infinito. Cada candidato da varredura aparece uma vez; a preferência pode aparecer novamente nela. Ocupação elevada aumenta o custo; com domínio cheio há falha controlada e rollback integral. Um lote precisa de capacidade suficiente durante sua transação, inclusive para acessos antigos ainda elegíveis. O formato não foi ampliado. Mesma senha em eventos diferentes é permitida.

## Preflight, backfill e antiabuso

Instalação bloqueia temporariamente alterações das fontes, verifica dependências e integridade, rejeita reinstalação/divergência e aborta diante de colisões existentes. O diagnóstico contém apenas grupos de colisão e eventos afetados. Não corrige dados nem imprime senha, hash, nomes ou códigos. Backfill insere exatamente os elegíveis e compara diferenças nos dois sentidos.

O acesso pela raiz tem budgets próprios, atômicos e cumulativos: usuário 15/15 min; origem 30/15 min; evento 60/15 min e 200/24 h. São janelas contadas desde a primeira tentativa, não cronograma de relógio. Tentativas rejeitadas contam; sucesso também conta. `x-real-ip` é sinal NÃO confiável e não é a defesa exclusiva: UID validado e limites do evento continuam obrigatórios. Origem é derivada sem guardar endereço bruto. O fluxo antigo não consome esses budgets.

Senha desconhecida/inativa/bloqueada ou rate limit retorna a mesma falha pública. Falha técnica retorna código técnico sanitizado. Limites não eliminam ataques distribuídos, criação abusiva de usuários anônimos ou DoS por esgotamento da quota do evento. Quatro dígitos continuam sendo um fator de baixa entropia; não são equivalentes ao código longo. Nenhum segredo ou configuração de produção foi alterado.

## Publicação futura

Somente após revisão e autorização: auditar colisões reais em leitura; aplicar especificamente a 009 conforme histórico/schema comprovado; publicar `redeem-invitation` preservando autenticação e secrets; publicar frontend. Não usar db push indiscriminado nem migration repair para resolver divergências históricas. Esta implementação permanece exclusivamente local, sem push, PR, merge ou deploy.
