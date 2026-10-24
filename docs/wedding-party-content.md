# Conteúdos do Espaço dos Padrinhos

As opções dia, traje, cerimonia e recado mantêm a rota /padrinhos?pagina= existente. Convite e Rever a surpresa preservam suas ações e a experiência não recebe novas mutações de aceite ou RSVP.

O grande dia utiliza o mesmo componente VenueLogo, recurso JPG, link Instagram e event.address da tela Local. Nenhuma informação de endereço foi duplicada. As outras orientações são o texto aprovado, com parágrafos e destaques em negrito. O recado é texto literal (incluindo quebras de linha), sem HTML executável.

## Persistência e privacidade

Migration incremental 20261024215704_wedding_party_couples_note.sql: coluna opcional couples_note na tabela privada wedding_party_private.promotions, limitada a 12.000 caracteres. Não há backfill, alteração de ciclos, datas, mensagens anteriores ou remoção de registros. RLS e grants da tabela permanecem intactos.

wedding_party_state continua resolvendo exclusivamente wedding_party_private.actor(event_id), sem aceitar guest_id do cliente. O recado aparece na promoção desse integrante confirmado. Compartilhar uma unidade familiar não autoriza ler os recados de seus outros integrantes. A tabela continua inacessível diretamente aos clientes.

O modal administrativo existente usa wedding_party_admin_save_content para salvar atomicamente apelido, trecho da carta e recado. A RPC exige ADMIN no evento, mantém o lock administrativo já existente e compara os valores esperados, inclusive o recado, para evitar sobrescrita de editores desatualizados. Reutiliza a RPC de edição anterior e preserva seus contratos. A auditoria registra operador/ação, sem copiar o conteúdo privado.

Promoções anteriores têm recado NULL e exibem uma mensagem discreta de conteúdo ainda não disponível. Editar ou acrescentar recado não reinicia a surpresa nem solicita novo aceite. Um campo vazio limpa somente o recado; os demais campos continuam com suas regras anteriores.

## Instalação e verificações

Aplicar somente a nova migration pelo mecanismo gerenciado antes de publicar o frontend. A instalação limita espera por locks a 3s, execução a 15s e transação a 30s em PostgreSQL 17+. Não alterar migrations históricas nem reparar divergências anteriores.

A instalação modifica apenas a estrutura privada e os retornos de leitura de duas RPCs, acrescentando uma RPC administrativa. Não escreve em registros reais de convidados, famílias, RSVPs, credenciais ou check-ins. Confirmar por hashes agregados que registros e políticas permaneceram inalterados.

Testes em PostgreSQL descartável cobrem upgrade de promoção já aceita/concluída, autorização, isolamento familiar/evento, persistência entre sessões, textos literais, concorrência lógica por versão, rollback de edição desatualizada e privacidade da auditoria. E2E cobre telas, navegação, preenchimento/edição do modal e regressões da surpresa em várias larguras. O CI também executa a suíte em WebKit real e publica capturas party-webkit-evidence. Isso não equivale a validação em iPhone físico.

Aplicada no projeto de produção pelo mecanismo gerenciado, versão 20261024215704. SHA-256 do SQL: ff70a0920a2cac4af62c682eb2af0510d4c92898a39fee084001ec4b5b0ac0b4. O timestamp local foi alinhado à versão oficial, sem alteração do conteúdo SQL. Hashes de dados existentes (incluindo promoções), políticas e funções não alteradas permaneceram idênticos; as duas promoções existentes ficaram com recado NULL. As permissões das RPCs de leitura permaneceram idênticas. A RPC nova permite EXECUTE a authenticated, mas exige ADMIN na implementação; anon e service_role não possuem EXECUTE.

Uma reversão do frontend pode manter a coluna e a RPC aditivas: os clientes anteriores continuam compatíveis. Não remover registros, mensagens ou colunas para reverter a publicação.

O advisor 0029 identifica a nova RPC SECURITY DEFINER executável por authenticated. Esse endpoint administrativo é intencional: a função exige ADMIN no evento e os testes negam GUEST, CEREMONIALIST e usuários sem papel; anon não possui EXECUTE. Não ampliar acessos nem remover verificações para silenciar esse aviso. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Ajustes de localização e concordância

O endereço da área especial mantém sua aparência e passa a ser um link acessível. O destino prioritário é o GPS HTTPS já cadastrado na tela Local. Sem ele, utiliza somente coordenadas válidas existentes ou o endereço cadastrado, com Apple Maps no iOS e Google Maps como alternativa web. Em execução nativa, reutiliza a delegação ao sistema operacional e oferece HTTPS se não houver handler. Não consulta aplicativos instalados nem solicita geolocalização; a escolha/handoff depende do sistema operacional.

A redação de Organização da cerimônia utiliza exclusivamente o papel PADRINHO/MADRINHA recebido na promoção, com texto neutro quando ele está ausente ou inválido. Não infere gênero por nome. O placeholder administrativo foi corrigido para “Digite um recado carinhoso e personalizado”, sem outra alteração no modal.

## Refinamento editorial

A frase “Em um primeiro momento parece ser sem motivo” foi corrigida na fonte compartilhada letterContent.ts. Nenhum outro trecho da história foi revisado. O endereço aprovado é formatado somente na apresentação de O grande dia, reconhecendo a redação anterior do Villarejo; outros endereços futuros passam intactos. O objeto do evento, a tela Local e o destino GPS não são alterados.

A carta conserva Dancing Script (PartyHand), tamanho, papel, margens e animações. Os corpos usam text-align:justify, text-align-last:start, word-break:normal e hifenização automática em pt-BR. Não há espaços manuais ou text-align-last:justify. Títulos e controles não recebem esses estilos. O recado conserva o texto literal e as quebras de parágrafo.

A inspeção identificou lacunas excessivas com a fonte manuscrita em leitura estreita. A carta utiliza alinhamento natural até 430 px; os outros corpos fazem o mesmo até 350 px. Acima desses limites, permanecem justificados. A fonte não foi reduzida e as margens originais foram preservadas. A regra text-wrap:pretty foi descartada após a comparação visual, pois deslocava palavras para a última linha e aumentava os vazios. Overflow-wrap:break-word funciona apenas como proteção para tokens excepcionalmente longos, sem word-break:break-all.

A suíte editorial cobre padrinho/madrinha em 320, 390, 768 e 1280 px, mensagens curtas/longas, vários parágrafos e tokens extensos. As capturas finais usam party-content-type-*.png e são publicadas no artefato party-webkit-evidence pelo workflow existente. Capturas locais anteriores foram preservadas em /tmp/party-typography-before para comparação. Não há migration ou alteração de dados, aceites, destinatários ou permissões.

A centralização do endereço foi aplicada também ao contêiner HTML do link: apenas text-align no elemento interno não centralizava efetivamente as linhas. A suíte mede o centro dos caracteres visíveis de cada linha (sem espaços pendentes) em relação ao link, além de conferir o estilo, o texto aprovado e o GPS preservado.
