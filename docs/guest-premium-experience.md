# Experiência do convidado: UX, FX e microinterações

## RSVP e sequência visual

O fluxo continua usando `RSVP_UPDATE`, `rsvpSchema`, a fila existente e os
estados canônicos `CONFIRMED`, `DECLINED` e `PENDING`. O botão de salvar
permanece necessário; selecionar o radio não persiste nem comemora sozinho.
Somente o retorno confirmado `Sincronizado com sucesso.` pode iniciar FX.
Esse texto redundante deixa de aparecer no formulário de Presença. Avisos
pendentes, offline e erros permanecem.

A apresentação é acionada pela interação concluída, e não por efeito que
observa o snapshot: FX → mensagem personalizada → X → recado opcional.
Os textos de `presenceContent.ts` foram preservados integralmente e ficam
centralizados também na página. Uma resposta já persistida não reapresenta
modais por refresh, navegação, sincronização ou reenvio do mesmo status.
Uma mudança efetiva de status é uma nova apresentação.

Há bloqueio da operação por ref e estado visual. Outros controles de RSVP e
calendário ficam bloqueados durante a sequência, evitando dois modais ao mesmo
tempo. Cada sequência termina ao fechar ou enviar o recado. O foco da rota e
um contador de geração cancelam apresentações pendentes na navegação e impedem
que uma conclusão antiga reabra o fluxo. Nenhuma operação persistida é desfeita.

## FX e modais

`RsvpFx` web usa CSS, portal e partículas limitadas: 20 elementos para a
celebração (🎉, 🎈, confetes azuis), 12 💔 para ausência e 12 🤔 para indecisão.
Há diferenças de origem, altura, duração, atraso, deriva, escala e rotação.
As trajetórias desaceleram e perdem opacidade. Os elementos são decorativos,
não interceptam cliques e saem do documento após 2 segundos.

A versão nativa usa Animated, driver nativo e uma camada temporária de 12
partículas, sem loop permanente. O botão Voltar pode encerrar a apresentação.
Movimento reduzido elimina partículas e expansão; mensagens e operações
continuam disponíveis.

`GuestModal` reutiliza o modal existente, incluindo foco preso, Escape,
restauração de foco e página inerte. A variante premium é opt-in: expansão
horizontal com overshoot suave de 780 ms no web, mola amortecida no nativo,
conteúdo progressivo e saída de 180 ms. O X possui alvo mínimo de 44 px,
sem fundo sólido/borda na variante premium. Os modais administrativos mantêm
sua apresentação padrão. O modal de status tem somente esse controle visual.
A variante premium respeita safe areas e ajusta o teclado no iOS; no web,
limita a altura e mantém rolagem, incluindo viewport reduzido.

## Recado opcional

O modal mantém título, placeholder solicitado, campo de até 4.000 caracteres,
Enviar e Fechar. `messageReady` exige pelo menos cinco caracteres significativos:
trim e espaços artificiais não habilitam o envio. Fechar não cria mensagem,
não gera erro por campo vazio e não desfaz o RSVP.

O envio usa exclusivamente `MESSAGE_SEND`. A autoria reutiliza a identificação
local existente no Perfil, validada contra os convidados acessíveis, ou `null`
(família/não identificado), como no mecanismo atual. Não se atribui a mensagem
a quem teve o RSVP respondido automaticamente.

Falha preserva texto e permite tentativa. A tentativa reconhece o ID da operação
nova na fila; se pendente, reutiliza sua sincronização em vez de enfileirar outro
recado. Operações ambíguas ou já removidas não recebem confirmação presumida:
o usuário é orientado a conferir o histórico. O resultado offline permanece
como pendência; sucesso só fecha o modal e avisa após confirmação do contrato.

## Google Agenda

O mecanismo existente é URL `calendar/render?action=TEMPLATE`, não API/OAuth.
O modal exibe:

> 🎉💍 **A festa começa às 16h, hein, não atrasa!** ⏰
>
> E pra terminar? Bom… essa parte a gente ainda não decidiu! 🥂

Controles de ação: Google Agenda e Fechar. O botão de download de calendário
foi removido da interface; as funções legadas não foram apagadas.

O início usa o instante canônico persistido do casamento, 15/12/2026 às 16h;
o término aprovado é 16/12/2026 às 01h. Google recebe
`20261215T190000Z/20261216T040000Z`, com `ctz=America/Sao_Paulo`.
O endereço/local continua vindo do evento. Não há dependência do fuso do
aparelho nem alteração de dados/coordenadas.

A descrição é enviada em texto simples, preservando emojis e parágrafos:

> 💍✨ O grande dia está chegando!
>
> Agora é oficial: temos um encontro marcado para celebrar o nosso amor! ❤️🥂
>
> 💙 Prepare o look, capriche na animação e venha viver esse momento tão especial com a gente!
>
> Com carinho, Felipe & Laís! 💍💕

**Lembretes efetivamente configurados pela implementação: nenhum.** O link não
oferece garantia de cinco lembretes; o usuário confirma o salvamento no Google,
que aplica suas preferências. Não foram inventados parâmetros nem adicionados
OAuth ou backend.

A alternativa com Calendar API exigiria autorização Google e escopos próprios.
Mesmo nela, o schema oficial limita overrides a cinco e a antecedência a
40.320 minutos (28 dias), portanto o lembrete de **30 dias** não cabe nesse
campo. Os de 10 dias, 1 dia, 5 horas e 1 hora cabem; uma solução completa
precisaria também de um mecanismo separado autorizado para 30 dias. Entrega
push depende das permissões e configurações do Google/aparelho.

Fonte consultada: [schema oficial de descoberta do Google Calendar](https://github.com/googleapis/discovery-artifact-manager/blob/master/discoveries/calendar.v3.json).
O acesso direto à página developers.google.com foi bloqueado pelo proxy, mas
o schema oficial e o cliente oficial do Google foram consultados com sucesso.

## Outras telas e limite de identidade

Presentes recebeu exatamente o texto solicitado. Perfil remove somente as
explicações especificadas, renomeia “Ativar push” para “Ativar notificações” e
encurta a identificação. Consentimentos, revogação, contatos, registro de push,
permissões e avisos de pendência/erro permanecem.

**Convites: limitação preservada.** O contrato atual vincula a sessão à unidade
familiar, sem identidade individual autenticada no snapshot. `primary_guest_id`
é o responsável da unidade, não comprovação de quem está usando o navegador.
O nome selecionado no Perfil é identificação local para autoria, sem esse
valor de autenticação. Por isso, a descrição permanece em sessões familiares
sem prova de identidade; não se inventou uma regra que a ocultasse como se a
pessoa fosse membro ou responsável comprovado. QR, emissão, regeneração e
check-in não foram alterados. Resolver essa distinção de forma autenticada
exigiria etapa própria autorizada além deste frontend.

## Cabeçalho, relógio e vídeo

`CompactCountdown` usa `countdownParts` e o mesmo relógio compartilhado com a
contagem grande. Há um único interval de 1 segundo, retomada por foco/visibilidade
ou AppState e limpeza ao último subscriber sair. O componente isolado evita
rerender de telas/cabeçalho inteiro. Não anuncia segundos continuamente.

O conjunto compacto/data usa a mesma tipografia e quebra responsiva. Só aparece
nas telas internas do convidado em foco, exceto `/inicio`. A contagem grande
continua onde já estava.

O cabeçalho usa o mesmo `HomeProposalVideo`, URL e controles. A modalidade
manual abre apenas no clique; páginas sem foco pausam e retiram o player.
Há autoplay muted após o clique, playsInline, som, fechamento e replay.
Na Home pública, os slots reutilizam a mesma instância, preservando abertura
após 1 segundo, animação de 850 ms, término, erros e controle por sessão.
Nenhum segundo player independente foi implementado.

## Arquivos

Modificados:

- `src/components/AdminModal.tsx`
- `src/components/HomeProposalVideo.tsx`
- `src/components/HomeProposalVideo.web.tsx`
- `src/components/ThemeStyles.web.tsx`
- `src/components/WeddingCountdown.tsx`
- `src/components/ui.tsx`
- `src/features/auth/PublicScreens.tsx`
- `src/features/gifts/GiftsScreen.tsx`
- `src/features/guests/ProfileScreen.tsx`
- `src/features/rsvp/CalendarAction.tsx`
- `src/features/rsvp/RsvpScreen.tsx`
- `src/features/rsvp/calendar.ts`
- `tests/countdown-calendar.test.ts`
- `tests/e2e/countdown-calendar.spec.ts`
- `tests/e2e/presence.spec.ts`
- `tests/e2e/proposal-video.spec.ts`
- `tests/e2e/workflows.spec.ts`

Criados:

- `src/components/GuestModal.tsx`
- `src/features/countdown/clock.ts`
- `src/features/messages/messageDraft.ts`
- `src/features/rsvp/RsvpFx.tsx`
- `src/features/rsvp/RsvpFx.web.tsx`
- `src/features/rsvp/RsvpPresentation.tsx`
- `tests/e2e/guest-premium.spec.ts`
- `tests/e2e/guest-presentation.ts`
- `tests/message-draft.test.ts`
- `docs/guest-premium-experience.md`

## Validação e integridade

Inspeção real de capturas no Chromium local: partículas, mensagem de status,
composição nas larguras 320/375/390/768/1280, viewport de altura 420 para os
controles, calendário e cabeçalho. Os testes de vídeo usam mídia simulada para
não baixar o filme remoto. Não houve inspeção em Android físico ou teste real
do teclado virtual de aparelho; a validação mobile é no navegador em viewports
móveis e altura reduzida.

Backend, Supabase remoto, migrations, Edge Functions, RPCs, autenticação,
PINs, links, identificadores, regras de autorização, dados, consentimentos,
manifest, service worker e instalação PWA não foram alterados. Testes com banco
usam exclusivamente PostgreSQL local descartável. Nenhuma dependência nova.

Resultados finais:

- 252 testes unitários aprovados (22 arquivos).
- 130 testes E2E aprovados na execução integral.
- 29 testes focados de RSVP/calendário/vídeo aprovados; após o ajuste de safe
  areas, 17 testes de experiência do convidado/modais também aprovados.
- Lint sem erros/avisos, TypeScript e build/export web aprovados.
- Validação final de assets, rotas, cache privado e shell offline aprovada.
- Chromium real em perfil normal: captura registrada aos 25,7 ms, evento nativo
  `beforeinstallprompt` aos 321,1 ms, React aos 477,4 ms. Captura antecipada,
  `defaultPrevented=true`, `isTrusted=true`, sem erros de instalabilidade e
  service worker controlador `/sw.js`.

Pendências delimitadas: distinguir membro/responsável por identidade autenticada
e configurar lembretes personalizados exige outra etapa autorizada. Não há
migration, função remota ou operação de Supabase a aplicar para esta entrega.
