# Unidades de acesso, gestão e localização

[Checklist dos 36 itens do pedido e evidências](refactor-qa.md).

## Modelo e implantação

A migration incremental `202610090004_access_units.sql` vem depois de `202610090003_access_families.sql`. Nenhuma migration anterior foi editada. `invitations.kind` diferencia FAMILY/INDIVIDUAL; registros existentes recebem FAMILY por default sem modificar dados. `archived_at` identifica acessos arquivados. `guests.invitation_id` continua obrigatório. Um constraint trigger diferido garante exatamente um convidado e responsável correspondente em cada INDIVIDUAL ativo. A criação e as transferências são atômicas, inclusive essa validação no commit.

Após o merge, um operador autorizado deve conferir backup e homologação, usar `supabase migration list` e `supabase db push --dry-run`, e aplicar somente as migrations pendentes com `supabase db push`. Nunca usar reset em produção. Publicar o frontend depois da migration: o frontend novo requer as novas ações. Redeploy de `redeem-invitation` atualiza somente o texto público “Código ou senha inválido.”, sem alterar assinatura/protocolo/regras de resgate. Não é necessário alterar Auth, SMTP, templates ou redirects do recovery. Não há credenciais novas nem nova Repository Variable. O Pages continua usando URL e Publishable key públicas; não adicionar chave privilegiada ao frontend.

`EXPO_PUBLIC_WEB_BASE_URL` continua necessário para links HTTPS compartilháveis, incluindo o base path. Não cadastrar senha na URL. Copiar link + senha gera duas linhas de texto; a URL contém somente código aleatório. As senhas de quatro dígitos continuam strings e podem começar com zero. São dados administrativos privados em `invitation_access`, gerenciados pelo backend; nunca entram nos snapshots de convidado/cerimonial, logs ou metadados de auditoria.

## Operações administrativas

`admin_action` verifica ADMIN e serializa operações administrativas por evento com advisory lock transacional. A função anterior foi renomeada para `admin_action_v3` e teve EXECUTE revogado para clientes. Operações de presentes/regras/check-in/mensagens continuam delegadas sem mudanças. As ações antigas de FAMILY_MERGE/FAMILY_SPLIT são rejeitadas. GUEST_SAVE/GUEST_REMOVE permanecem como compatibilidade de clientes antigos para FAMILY, sem permitir criar/mover convidados por esse caminho para INDIVIDUAL. A interface nova usa somente as novas ações de convidados.

- GUEST_CREATE: cria unidade INDIVIDUAL, convidado, RSVP PENDING, contato e observações. Gera código aleatório/hash e senha pelos últimos quatro dígitos de WhatsApp brasileiro válido, ou senha aleatória de quatro dígitos sem telefone. Os dados de compartilhamento ficam disponíveis ao ADMIN imediatamente.
- GUEST_UPDATE: exige id/version; atualiza somente nome, criança, vínculo, contato e observações. Novos writes definem is_adolescent=false, não utilizam companion_of e não podem mudar família pelo formulário. Um vínculo legado pode ser preservado, mas não há digitação livre de novos vínculos. RSVP e consentimentos não são sobrescritos; edição de telefone não redefine senha.
- FAMILY_ADD_MEMBERS/GUEST_ASSIGN_FAMILY: exige target_id/target_version e array `guests` com id/version/invitation_version de cada convidado. Exige acesso familiar pronto (senha configurada e link ativo), para nunca retirar o único meio de acesso do convidado. Exige confirmação adicional para transferir de outra FAMILY. Arquiva acessos INDIVIDUAL de origem e compartilha somente o acesso de destino.
- GUEST_REMOVE_FROM_FAMILY: exige as versões no array `guests`, preserva o convidado e cria uma unidade INDIVIDUAL com novo link/senha. Excluir convidado é outra operação.
- FAMILY_DELETE: exige id/version, arquiva a família e converte atomicamente todos os membros em INDIVIDUAL. Nenhum cadastro é excluído. A versão familiar sobe em alterações de membros/dados, protegendo a confirmação contra uma lista desatualizada.
- GUEST_DELETE/GUEST_DELETE_BATCH: exige o array de versões e exclui globalmente os convidados e dependências conforme os FKs existentes. INDIVIDUAL fica arquivado. Não apaga o histórico de auditoria.
- PIN_SAVE, CODE_ROTATE, CODE_BLOCK e ACCESS_REVOKE mantêm nomes internos e regras anteriores; na interface são senha, regenerar link, bloquear link e revogar dispositivos. Salvar senha não revoga sessões automaticamente.
- EVENT_SAVE: exige version; salva venue_name/address/gps_url em campos separados. GPS é HTTPS sem credenciais embutidas; coordenadas legadas são preservadas no banco e retiradas do formulário.

Lotes validam todas as versões antes da primeira alteração. Duplicatas e itens inexistentes/desatualizados abortam tudo. Transferências revogam sessões de origem e destino: um UID de sessão familiar não identifica um único membro, portanto preservar o UID permitiria acesso incorreto ao roster. QR ativo do convidado movido é revogado; se confirmado, ele pode gerar novo ingresso no acesso atual. Check-in e seu histórico não são reescritos. Auditoria registra ações e IDs, sem senha/código/contato/observações nos metadados.

## Interface e limitações

Convidados abre com lista PT-BR, busca e filtros de vínculo/RSVP. Cadastro e ficha são explícitos. Web desktop tem checkbox; mobile usa long press no nome ou a ação acessível na ficha para iniciar seleção. A seleção não fica presa ao filtro: o contador da barra informa todos os selecionados. Exclusão e transferência são confirmadas; excluir família preserva os membros. Cards fechados mostram somente status da senha. Ícones usam o SVG já disponível no projeto, sem dependência nova.

O local mostra nome/endereço e “Abrir localização”. Web oferece link GPS, Google Maps, Waze, Uber, copiar e compartilhar; Web Share API é usada quando disponível e clipboard é o fallback. Não se tenta enumerar aplicativos pelo navegador. Nativo usa `Linking.canOpenURL` com esquemas documentados de Google Maps, Waze e Uber, com as queries Android e schemes iOS necessárias. Sem app disponível, abre mapa no navegador ou o GPS. Para 99 e outros apps, utiliza compartilhamento/cópia do endereço, sem inventar integração URI de destino. O menu do sistema depende do dispositivo e dos apps instalados.

Referências: [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), [iOS URL scheme](https://developers.google.com/maps/documentation/urls/ios-urlscheme), [Android intents](https://developers.google.com/maps/documentation/urls/android-intents), [Waze](https://developers.google.com/waze/deeplinks), [Uber](https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction).

A demo usa transações locais simuladas para gestão. PostgreSQL descartável testa migrations, RLS, RPC, preservação de dados e revogação reais; os E2E usam demo ou HTTP simulado com o SDK Supabase. Não são testes de SMTP/produção. Os exports Android/iOS geram bundles Expo; não equivalem a APK/IPA nem execução em dispositivo. Homologar o menu de aplicativos em dispositivos antes da distribuição nativa.
