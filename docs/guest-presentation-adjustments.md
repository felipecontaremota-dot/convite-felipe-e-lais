# Ajustes de apresentação do convidado

Implementação exclusivamente na `main`, sobre `26da71cb8894f4208baa78b618f8b3ad128f33fa`.

## Página pública e link exclusivo

Na raiz pública, somente o ícone junto a “Felipe & Laís” foi removido. O replay junto a “Um novo capítulo, juntos.” permanece. O controlador/player compartilhado não foi modificado: autoplay, delay de 1 segundo, transições de 850 ms, som, fechamento, replay e apresentação por sessão continuam existentes.

Em `/c/{codigo}`, o vídeo compartilhado já estava integrado na main e foi preservado. O componente `WeddingCountdown` foi inserido dentro do card, entre descrição e senha, utilizando `WEDDING_START` e o relógio compartilhado existentes. O botão agora se chama “Abrir convite”. Saudação dinâmica, PIN, sessão e handlers de autenticação permanecem iguais.

## RSVP

Título e complemento são compartilhados em `presenceContent.ts`. A mensagem fixa concatena os dois uma única vez, enquanto o modal apresenta o título no cabeçalho e o complemento centralizado no corpo.

| Estado    | Título                           | Complemento                                                                                                                                                       |
| --------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONFIRMED | Aeeee! 🎉                        | Agora sim, a festa tá ficando completa! Já estamos contando com você pra celebrar, se divertir e fazer parte desse dia inesquecível. Só não vale furar, hein?! ❤️ |
| DECLINED  | Ahhh, que pena! 🥹💔             | Queríamos muito você com a gente! Mas tudo bem... vamos tentar nos divertir mesmo com essa ausência ilustre! ❤️                                                   |
| PENDING   | Opa, temos um suspense no ar! 👀 | Mas não demora muito pra decidir, hein?! A gente tá torcendo pra você dizer SIM! ❤️🎉                                                                             |

FX, sequência dos modais, spring, fechamento e persistência não foram modificados. A label visível “Mensagem aos noivos” foi ocultada somente no modal de composição; o nome acessível permanece no campo. Placeholder, validação, envio e fila continuam existentes.

## Calendário, convites e presentes

Calendário: título centralizado e em negrito “🎉💍 A festa começa às 16h, hein, não atrasa! ⏰”; corpo centralizado “E pra terminar? Bom… essa parte a gente ainda não decidiu! 🥂”; ação “Adicionar à agenda”. URL, horários, timezone, endereço, descrição e abertura do Google Agenda foram preservados. Não foi criado download.

Convites: descrição introdutória removida para todas as unidades; emissão, QR, regeneração e permissões preservados.

Presentes: título “Sua presença é nosso maior presente!” e descrição “Mas fique a vontade para acessar nossas listas que preparamos com carinho. Ahhhh, e fica a vontade para escolher presentes fora da lista, não tem problema!”. Listas e links permanecem iguais.

## Dourado e acessibilidade

Token localizado `colors.countdownAccent = #795719`, em `src/theme/palette.ts`, aplicado exclusivamente aos quatro grupos numéricos do cronômetro compacto. Separadores e data permanecem azuis. Cronômetros grandes, fonte, tamanho, peso e relógio não mudaram.

Contraste WCAG: 6,22:1 sobre `#F5F9FD`, 6,58:1 sobre branco e 5,82:1 sobre `#EAF2FA`. Os três fundos são cobertos por testes AA (mínimo 4,5:1). Labels acessíveis, foco, teclado, fechamento e reduced-motion existentes foram preservados.

## Validação

- 255 testes unitários; lint e TypeScript aprovados.
- E2E: 138 cenários executados. A primeira execução aprovou 137; uma nova asserção conferia replay antes do fechamento do vídeo. A asserção foi corrigida para a fase correta, e os sete cenários de vídeo foram reexecutados e aprovados. Não houve alteração adicional no código do player.
- Build/export web aprovados; aviso preexistente de MODULE_TYPELESS_PACKAGE_JSON permanece.
- Validação da exportação: HTML/JS/manifest/SW/ícones, 404, link exclusivo, isolamento de cache privado, offline e viewport 390×844 aprovados.
- Chromium real, perfil normal: captura PWA registrada aos 43,7 ms; evento nativo aos 623,2 ms; `defaultPrevented: true`; zero erros de instalabilidade; worker controlador `/sw.js`.
- Inspeção visual local em Chromium nas larguras 320, 375, 390, 768 e 1280: raiz pública, perfil/cabeçalho, RSVP, composição, calendário, presentes, convites e acesso exclusivo. Mídia foi simulada para evitar download do vídeo nos testes. Não equivale a inspeção em aparelhos físicos ou Safari.
- A suíte E2E cobre navegação, login por nome/PIN, PIN legado, vídeo, mensagens, PWA, RSVP, agenda e layout mobile.

Nenhum backend, Supabase, migration, Edge Function, regra de negócio, autenticação, manifest, service worker ou controlador do vídeo foi alterado. A paleta azul permanece; a única adição cromática é o token localizado solicitado.

## Arquivos

- `src/components/AdminModal.tsx`
- `src/components/WeddingCountdown.tsx`
- `src/components/ui.tsx`
- `src/features/auth/PublicScreens.tsx`
- `src/features/gifts/GiftsScreen.tsx`
- `src/features/rsvp/CalendarAction.tsx`
- `src/features/rsvp/RsvpPresentation.tsx`
- `src/features/rsvp/presenceContent.ts`
- `src/features/tickets/TicketsScreen.tsx`
- `src/theme/palette.ts`
- `tests/e2e/access-stabilization.spec.ts`
- `tests/e2e/countdown-calendar.spec.ts`
- `tests/e2e/guest-premium.spec.ts`
- `tests/e2e/guest-presentation.ts`
- `tests/e2e/invitation-video.spec.ts`
- `tests/e2e/proposal-video.spec.ts`
- `tests/e2e/staff-and-pin.spec.ts`
- `tests/e2e/workflows.spec.ts`
- `tests/palette.test.ts`
- `tests/presence-content.test.ts`

Criado: `docs/guest-presentation-adjustments.md`. Nenhum outro arquivo criado no repositório.
