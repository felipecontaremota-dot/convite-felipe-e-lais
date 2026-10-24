# QR Code em diferentes dispositivos

## Diagnóstico e decisão

O QR continua sendo renderizado por react-native-qrcode-svg, em SVG de 190 px. O problema reproduzido é a ausência do token original no cache do novo navegador: o servidor guarda somente seu hash SHA-256. Não é possível recuperar esse token a partir do hash.

A solução preserva essa proteção e oferece substituição explícita, com aviso de que o código anterior será invalidado. Não introduz armazenamento reversível, chaves criptográficas novas ou tokens em texto aberto no banco. Não há rotação automática ao abrir outro dispositivo. Tokens existentes permanecem válidos até uma substituição confirmada.

## Autorização e concorrência

A RPC replace_ticket exige sessão autenticada e ADMIN ou owns_guest no evento. Mantém exatamente a autorização familiar existente. Bloqueia a linha do convidado e compara a credencial ativa com o ID capturado ao abrir a confirmação. Uma tentativa concorrente com ID antigo falha com ticket_changed, sem revogar o código vencedor. O índice único de credencial ativa continua sendo utilizado.

A emissão existente revalida RSVP confirmado, revoga o hash anterior, cria o novo hash e mantém a auditoria, na mesma transação. Falha no INSERT desfaz também a revogação. Leitor, conteúdo wedding://ticket/, autenticação e RLS não mudam.

## Implantação e compatibilidade

Migration incremental: 20261024052358_replace_ticket_compare_and_swap.sql.
SHA-256: e9d66fc83a979ee55825c6c72fdc5c0bf21a4eae774f2856335dd1ba743f899b.

Aplicada pelo mecanismo gerenciado antes da publicação do frontend. O timestamp do arquivo corresponde à versão atribuída pelo Supabase, sem alteração do SQL. A instalação somente cria uma função e suas permissões, sem alterar registros. Limites de instalação: lock_timeout 3s, statement_timeout 15s e transaction_timeout 30s em PostgreSQL 17+. A função também limita a espera por locks a 3s.

Nenhum backfill é necessário. Não se alteram migrations anteriores nem as divergências históricas. O emissor antigo continua disponível para compatibilidade. Reversão da publicação pode usar o frontend anterior sem remover a função ou tocar nas credenciais; códigos já substituídos permanecem corretamente revogados.

## Validação

Testes unitários de cache, ausência do token e conflitos; SQL/RLS com atualização sobre dados existentes, permissões, rollback, concorrência em conexões independentes, isolamento, auditoria e check-in; testes de navegador em 320, 390 e 1280 px com dois contextos, confirmação/cancelamento, recarga e leitura efetiva da imagem SVG com ZXing. Todos os dados de teste são descartáveis e locais.

O ambiente local bloqueia o download do WebKit e não possui suas dependências. Um job dedicado do GitHub Actions executa os testes com WebKit real e publica capturas fictícias como qr-webkit-evidence. Verificar seu resultado na execução do commit; não confundir Chromium com Safari. Não houve validação em iPhone físico ou PWA instalada no iOS.

As verificações de produção são somente de leitura fora da aplicação da migration. Não emitir ou substituir credenciais reais para testar a publicação.
