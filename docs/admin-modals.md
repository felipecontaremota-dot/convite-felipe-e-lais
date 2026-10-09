# Gestão administrativa e modais

Este PR parte da main após o PR #19. Os erros anteriores de exclusão foram causados pela publicação do frontend antes da migration 004. A 004 e redeem-invitation v3 já foram aplicados em produção: este PR não os altera nem reaplica. FAMILY_DELETE, GUEST_REMOVE_FROM_FAMILY e GUEST_DELETE continuam usando os RPCs existentes.

## Interação

AdminModal usa Modal do React Native, overlay, card responsivo e scroll interno. No Web há diálogo nomeado, foco contido e retorno ao elemento anterior; Escape fecha quando permitido. O conteúdo atrás fica inacessível. ConfirmModal diferencia a ação destrutiva, impede clique fora e bloqueia fechamento/cancelamento enquanto a operação está em andamento. Erros mantêm a confirmação aberta para nova tentativa.

Cadastro, ficha e edição de convidado, criação/edição de família e edição de Local usam modal. Confirmações de excluir família/convidado/lote, remover membro e associar lote também usam modal. Não há confirmação inline. A exclusão direta usa deleteGuestId separado da seleção; a seleção de outros convidados permanece intacta. Os payloads continuam capturando versões no momento da confirmação.

O badge vermelho ! aparece somente para observação não vazia após trim, possui label acessível e tooltip no Web, e não revela o texto na listagem. Seleções múltiplas têm chips removíveis e Limpar seleção. Após mutations, app.admin aguarda o snapshot atualizado; os testes de navegador verificam a atualização sem reload.

## Mensagens e migration 005

`202610090005_message_recipients.sql` reutiliza message_recipients; não cria tabela. Pessoa seleciona convidados ativos diretamente, em ordem PT-BR, inclusive acessos individuais e famílias diferentes. Família continua uma seleção independente; Todos não exige seletor.

O novo payload recipient_guest_ids aceita entre 1 e 500 itens, deduplica IDs e valida evento/acesso ativo. A mesma transação registra mensagem, destinatários, recibo de idempotência e outbox. IDs inválidos abortam o conjunto. Não se cria announcement para mensagem direcionada. Não há implementação de novo provider/envio externo.

RLS e app_snapshot passam a usar os destinatários reais para recados administrativos, corrigindo a leitura anterior baseada somente em invitation_id/null. ADMIN recebe IDs de destinatários; convidado não recebe IDs dos demais. A identidade de acesso continua familiar: uma sessão FAMILY pode ler recados dos membros que ela possui; INDIVIDUAL lê somente seu próprio acesso. Não foi criada autenticação individual dentro de uma sessão compartilhada. CEREMONIALIST continua sem acesso às conversas. Mensagens dos convidados para os noivos e os demais tipos de mutation são preservados.

## Local e Maps

O card exibe os dados salvos e Editar local abre formulário em modal. gps_url continua sendo respeitado. Maps URLs usa api=1; integrações Waze/Uber e share sheet 99/outros são preservadas. Nativo usa o card e os aplicativos disponíveis, sem WebView.

Web/PWA suporta a Repository Variable pública opcional EXPO_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY, consumida pelo job build de deploy-pages.yml. Quando presente, iframe oficial /maps/embed/v1/place usa nome/endereço salvos. Sem chave ou local definido, mostra fallback com ícone e Abrir no Google Maps, sem mapa quebrado. Não há avaliações, fotos, logotipo ou conteúdo inventado. O iframe depende de rede; não é um mapa offline.

No Google Cloud, habilitar Maps Embed API e restringir a chave a essa API e aos HTTP referrers dos domínios autorizados, inclusive o GitHub Pages. Nenhuma chave real foi commitada. Reprodução local, substituindo apenas no ambiente:

```bash
EXPO_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY='<chave pública restrita>' npm run build:web
```

## Após merge

1. Conferir o histórico de migrations de produção: a 004 já deve constar aplicada. NÃO editar ou reaplicar a 004.
2. Homologar e aplicar somente a nova 005 antes de publicar o frontend. Conferir migrations pendentes e dry-run; preservar backup. Não usar db reset em produção.
3. Opcionalmente configurar a Repository Variable de Maps e suas restrições no Google Cloud antes do build Pages. Sem isso, o fallback funciona.
4. Não é necessário redeploy de Edge Functions, mudança em Auth, SMTP ou nova credencial Supabase. Não disparar convites ou mensagens de teste em produção.

## Conferência do pedido

| Itens | Evidência                                                                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2   | AdminModal/ConfirmModal e texto exato de exclusão familiar, Cancelar/Excluir, sem card fantasma.                                                                                             |
| 3     | E2E de navegador executa GUEST_REMOVE_FROM_FAMILY real em PostgreSQL e confere RSVP, contato, observação, INDIVIDUAL, senha/link.                                                            |
| 4     | Lixeira usa estado separado, não seleciona pessoa; E2E cobre cancelamento, exclusão e preservação de outra seleção.                                                                          |
| 5     | Badge trim/vermelho/label/tooltip e E2E para vazio, espaços e nota preenchida.                                                                                                               |
| 6–10  | Cadastro, ficha e todos os lápis de família/convidado abrem modais. E2E preserva os formulários e ações existentes.                                                                          |
| 11–14 | Chips removíveis/limpar, seleção direta de pessoas, destinatários reais e alvo família independente. SQL e E2E com PostgreSQL.                                                               |
| 15–18 | Card salvo, iframe oficial opcional/fallback, GPS e modal de edição; teste real verifica refresh do card/iframe e URL.                                                                       |
| 19–21 | CRUD 004 intacto, erros traduzidos sem SQL e snapshots atualizados após mutations.                                                                                                           |
| 22–24 | Unitários, SQL, E2E demo/Auth/PostgreSQL, Functions, export Web/Pages e bundles Android/iOS. Auth do E2E é simulado; RPC/SQL são reais e descartáveis. Sem teste em aparelho físico/APK/IPA. |
| 25–26 | Nenhum novo envio externo, arte, cronômetro, redesign geral, Sheets ou notificações. Um PR sem merge automático.                                                                             |
