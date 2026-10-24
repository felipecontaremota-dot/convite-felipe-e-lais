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
