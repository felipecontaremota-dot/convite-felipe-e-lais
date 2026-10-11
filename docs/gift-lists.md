# Listas externas de presentes

Presentes agora oferece listas externas com título livre e URL HTTPS. O ADM usa o botão `+`, preenche os dois campos e salva. Edição usa o lápis; exclusão usa a lixeira e o modal de confirmação existente. O convidado acessa o título clicável; no Web/PWA abre outra aba com `noopener noreferrer`, e no app nativo utiliza a abertura externa existente.

## Armazenamento e compatibilidade

Não há mudança de banco. São reutilizados `gifts.title`, `gifts.external_url`, `GIFT_SAVE`, `GIFT_DELETE` e o snapshot existente. `description = external-gift-list:v1` identifica os novos registros; não é descrição de produto e não aparece na interface. A identificação impede que produtos antigos sejam apresentados acidentalmente como listas. Os demais campos do contrato são enviados com valores neutros: imagem nula, preço vazio, reserva desativada, ativo verdadeiro. Versão e ordenação existentes são preservadas na edição.

Os produtos anteriores, `gift_selections`, contratos `GIFT_SELECT`, sincronização de operações antigas e SQL permanecem intactos. Nenhum dado antigo é convertido ou excluído automaticamente. As telas deixam de apresentar produto, preço, imagem, escolha de integrante, interesse ou reserva. A limpeza do contrato e do banco fica para uma etapa futura.

O banco existente exige HTTPS em `external_url`, e `safeHttps`/`openExternal` também exigem HTTPS sem credenciais embutidas. HTTP não é aceito nesta implementação: suportá-lo exigiria mudança de schema e do contrato de segurança. Não há requisição à loja durante cadastro ou validação. Não foi adicionado limite de quantidade de listas.

## Primeira lista e publicação

Após revisão, merge e publicação do frontend, entrar como ADM > Presentes > `+`. Quando ainda não houver listas, os campos serão sugeridos com:

- Título: `Lista de Presentes - Havan`
- Link: `https://lista.havan.com.br/Convidado/ItensListaPresente/966559?aba=presentes`

Revisar e clicar em `Salvar lista`. Esse é um cadastro administrativo normal, usando a RPC existente. Não há inserção automática ao abrir a tela, seed de produção, migration, SQL manual ou deploy de Function. Antes desse cadastro, o convidado vê a mensagem de lista em preparação. Nas listas seguintes, os campos começam vazios; título e loja são livres.

Uma lista apagada deixa de aparecer; se todas forem apagadas, a primeira sugestão volta a ser Havan. Produtos antigos permanecem armazenados, mas não são editáveis pela nova tela.

## Validação

Testes cobrem formato da URL, registros antigos preservados, cadastro/edição/exclusão, persistência após reload, RPCs reais em PostgreSQL descartável, múltiplas listas, abertura por teclado, URL completa, outra aba sem opener e layout desktop/mobile 390×844. A loja externa é interceptada com uma resposta local nos testes; nenhum acesso real à loja é necessário. A apresentação Web é a mesma em PWA standalone; testes de export verificam manifesto e Service Worker, sem alterar sua estratégia. Instalação e abertura no sistema operacional de cada dispositivo permanecem verificações manuais de publicação.

Dispositivos que ainda executam uma versão antiga em cache podem apresentar a experiência anterior até atualizarem o frontend. Nenhuma alteração de cache ou Service Worker foi feita; os contratos antigos continuam disponíveis para compatibilidade com essas sessões.
