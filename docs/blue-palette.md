# Migração cromática para azul

Mudança exclusivamente visual sobre main. Sem alterações de autenticação, APIs, rotas, regras, backend ou dados. Nenhuma mudança em Supabase, SQL, migrations ou Edge Functions.

## Auditoria e centralização

O projeto usa React Native/React Native Web, StyleSheet e CSS embutido nos componentes web; não usa Tailwind nem variáveis CSS de tema. A fonte anterior era src/theme/tokens.ts, complementada por hardcodes em cronômetro, navegação, SVGs, seletores, vídeo, mensagens flutuantes e metadata PWA.

A fonte de cor passa a ser src/theme/palette.ts, consumida pelo theme existente e pelo exportador web. src/components/ThemeStyles.web.tsx centraliza estados web de hover/active/focus; o componente nativo correspondente não injeta HTML. Nenhuma dependência foi adicionada.

## Paleta completa

| Token semântico | Nome visual                    | HEX         | Função                               |
| --------------- | ------------------------------ | ----------- | ------------------------------------ |
| `paper`         | Azul quase branco              | `#F5F9FD`   | Fundo geral                          |
| `card`          | Branco                         | `#FFFFFF`   | Cards e campos                       |
| `wash`          | Azul bebê                      | `#EAF2FA`   | Superfícies secundárias e seleção    |
| `line`          | Azul claro                     | `#C6D9EC`   | Bordas decorativas e divisórias      |
| `inputBorder`   | Azul claro reforçado           | `#718FAE`   | Contorno acessível de campos         |
| `secondary`     | Azul médio                     | `#3E6B98`   | Links, ícones e ações secundárias    |
| `primary`       | Azul principal                 | `#245D91`   | CTA e ação primária                  |
| `primaryHover`  | Azul principal escurecido      | `#1D4E7C`   | Hover primário                       |
| `primaryActive` | Azul principal profundo        | `#163F66`   | Pressed/active primário              |
| `ink`           | Azul-marinho                   | `#18324F`   | Título, texto principal e cronômetro |
| `muted`         | Cinza suave                    | `#596675`   | Descrição, metadados e placeholder   |
| `focus`         | Azul principal                 | `#245D91`   | Indicador de foco                    |
| `disabled`      | Azul suave dessaturado         | `#CBD9E7`   | Fundo desabilitado                   |
| `disabledText`  | Cinza azulado                  | `#4C5D71`   | Texto desabilitado legível           |
| `error`         | Vermelho semântico preservado  | `#A03632`   | Erro                                 |
| `destructive`   | Vermelho destrutivo preservado | `#A2222C`   | Exclusão                             |
| `shadow`        | Neutro escuro                  | `#18212C`   | Sombras com baixa opacidade          |
| `overlay`       | Neutro escuro a 60%            | `#18212C99` | Backdrop modal                       |
| `overlaySoft`   | Neutro escuro a 40%            | `#18212C66` | Backdrop seletor                     |

Transparências do brilho e das sombras são derivadas dos tokens; não constituem novas cores independentes.

## Remoção da identidade anterior

Foram substituídos os fundos creme #FAF7F0 e #F4EDDD, verde #183F35/#0A3022, contornos #DDD7CB/#E6E0D5, dourados #8B6D39/#9A7835/#A88A54/#DEBE7D, realce #C6A85A22, creme #F8EBD2 e wash #EDF2EB, conforme a função de cada ocorrência. As sombras antigas tonalizadas de verde passaram a neutras. A busca final nos estilos não encontrou hardcodes antigos. Fotografias, conteúdo do vídeo, monograma raster original e favicon de alianças foram preservados como conteúdo visual, sem edição de arquivos de imagem.

## Estados e acessibilidade

Botões primários têm default/hover/active específicos; secundários usam superfície suave e texto azul médio; seleção mantém azul bebê com contorno azul médio. Disabled usa cores próprias com texto legível, sem opacidade global. Loading mantém o indicador e a lógica existentes, com cor do tema. Inputs têm borda mais forte que bordas decorativas para atingir contraste de componente; foco visível utiliza outline de 3px. Links e navegação usam azul médio, com título/seleção em marinho. Erro e ações destrutivas mantêm vermelho semântico.

Os testes verificam contraste WCAG AA >=4,5:1 nos pares de texto utilizados e >=3:1 para bordas de input e foco. Bordas decorativas de cards não substituem o contorno funcional de campos.

## Preservação funcional e validação

As alterações no player e no botão flutuante restringem-se aos estilos de cor: todos os timers, sequências, animações (incluindo 850ms do vídeo), sessões, áudio, replay, handlers e rotas permanecem iguais. O formulário por nome/PIN recebeu somente cor no link da equipe. Nenhuma funcionalidade existente foi removida.

Validação: lint sem avisos, typecheck, 222 testes unitários (12 verificações de contraste), 45 testes E2E selecionados (administração, vídeo, mensagens flutuantes, workflows e autenticação), build web e teste de exportação. Nenhum teste de banco foi necessário para esta mudança visual.

Inspeção visual local: Home desktop/mobile de 320px, vídeo aberto e replay, início após login, navegação, RSVP, presentes, mensagens, administração/noivos e cerimonial. O vídeo público não foi baixado; a inspeção de cores do player usa mídia sintética temporária externa ao Git, porque o proxy do ambiente bloqueia o host público do Storage.

## Arquivos

Alterados:

- `app/_layout.tsx`
- `public/manifest.webmanifest`
- `scripts/web-assets.mjs`
- `src/components/AdminModal.tsx`
- `src/components/FloatingMessages.web.tsx`
- `src/components/HomeProposalVideo.web.tsx`
- `src/components/WeddingCountdown.tsx`
- `src/components/adminUi.tsx`
- `src/components/ui.tsx`
- `src/features/auth/PublicScreens.tsx`
- `src/features/gifts/AdminGifts.tsx`
- `src/features/guests/AdminGuests.tsx`
- `src/features/guests/HomeScreen.tsx`
- `src/features/invitations/AdminFamilies.tsx`
- `src/theme/tokens.ts`
- `tests/e2e/administration.spec.ts`

Criados:

- `src/theme/palette.ts`
- `src/components/ThemeStyles.tsx`
- `src/components/ThemeStyles.web.tsx`
- `tests/palette.test.ts`
- `docs/blue-palette.md`
