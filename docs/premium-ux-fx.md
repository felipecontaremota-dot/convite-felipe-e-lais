# Microinterações compartilhadas

Implementação frontend sobre `main`, preservando APIs, autenticação, PWA,
vídeo, mensagens flutuantes e a paleta central `src/theme/palette.ts`.

## Arquitetura

`ActionFeedbackButton` concentra os estados idle/loading/success/info/leaving,
o bloqueio de cliques, consumo da promessa, confirmação por botão e limpeza
na desmontagem. Usa React Native Animated já presente: entrada de 200 ms,
leitura de 1.400 ms e saída de 180 ms, com opacidade e escala discreta.
Movimento reduzido mantém o feedback e elimina o movimento.

`FxToastProvider` concentra os avisos transitórios e a preferência de movimento.
A implementação web usa portal no documento para permanecer no canto superior
direito durante scroll. Não intercepta cliques. Cada confirmação permanece
visível por **1.000 ms completos**, além de 200 ms de entrada e 200 ms de saída.
Uma nova confirmação substitui a anterior e cancela seus timers. Há versão nativa
com safe areas. Falhas continuam nos componentes existentes de erro, sem esse
autofechamento. Nenhum dado pessoal é registrado pelo sistema de efeitos.

`feedback.ts` define somente cores semânticas adicionais; `Tag` mantém estrutura
única e recebe tom derivado do RSVP canônico. Confirmado: verde suave;
recusado: vermelho suave; pendente: azul neutro; criança: laranja suave.
Os textos possuem contraste mínimo AA contra os fundos respectivos.

## Convidados e presentes

A cópia aguarda o resultado efetivo do clipboard antes de mostrar “Link copiado”.
No navegador, usa `navigator.clipboard.writeText`; quando essa API não existe,
o caminho legado verifica o resultado de `execCommand`, remove seu campo
auxiliar e devolve o foco. Falhas permitem nova tentativa sem confirmação falsa.
Os mesmos efeitos são usados nos presentes; nenhuma linha muda de largura.

O e-mail usa o contrato existente `InvitationSendResult`. “E-mail enviado” e o
check aparecem somente com operação completa, `sent > 0`, sem pendência,
falha ou destinatário ignorado. `sent` confirma aceite pelo provedor; **não é
comprovação de entrega na caixa de entrada**. Simulação/ignorado mostram
“Envio não realizado”; pendência mostra “Envio pendente”, mantendo os detalhes
existentes. Falhas conservam o tratamento existente. IDs de operação,
confirmação de reenvio e regras de idempotência não foram modificados.

Hover, foco dentro da linha e seleção têm o mesmo fundo `wash` a 60%, com
transição de 180 ms. A seleção continua usando os controles existentes.

## Local

Convidado e administrador usam o mesmo `LocationCard`, imagem, endereço,
mapa quando configurado e seletor de destinos. O link GPS configurado continua
acessível. Somente ADMIN conserva o botão “Editar local”, o modal e o fluxo
existente de validação, versão e salvamento. “Local salvo” aparece somente após
sucesso dessa operação; “Endereço copiado” somente após sucesso do clipboard.

## Verificação

A cobertura específica exercita sucesso/falha de cópia, confirmação posterior
à resolução, prevenção de duplicação, isolamento entre botões, tentativa por
teclado, seleção/hover, tags canônicas, e-mail confirmado/falho/pendente/demo,
e o Local compartilhado em 320 px. A suíte de regressão também verifica login,
PWA, vídeo, mensagens, RSVP, presentes e navegação.

Foram inspecionadas capturas reais do navegador local: convidados selecionados,
cópia e tags no desktop; presentes; Local administrativo desktop/mobile e Local
do convidado em 320 px. Nenhuma publicação ou operação de Supabase é necessária
para esses efeitos; somente a publicação normal do frontend da main.

Resultados locais: **240 testes unitários**, **113 testes E2E da suíte completa**
e **7 testes focados finais** (incluindo dois cenários adicionados posteriormente)
aprovados, totalizando **115 cenários E2E distintos**. Lint, TypeScript,
build e validação de exportação aprovados. Na exportação final, Chromium real
registrou a captura PWA aos 57,7 ms e emitiu o evento nativo aos 512,2 ms,
com `defaultPrevented: true`, `isTrusted: true`, sem erros de instalabilidade
e service worker controlador `/sw.js`.

Nenhum arquivo de backend, migration, Edge Function, contrato de API,
autenticação, manifest, service worker ou paleta geral foi alterado.
Nenhuma operação remota no Supabase foi realizada. Os testes que exercitam
RPCs utilizam exclusivamente PostgreSQL local descartável.
