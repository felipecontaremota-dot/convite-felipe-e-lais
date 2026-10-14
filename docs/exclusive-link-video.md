# Vídeo no acesso por link exclusivo

A página pública é `PublicHome`; `/c/{codigo}` exporta `InvitationAccess`, ambas
em `src/features/auth/PublicScreens.tsx`. O player é `HomeProposalVideo.web.tsx`.
O cabeçalho e o posicionamento em fluxo pertencem a `Screen`, em `ui.tsx`.

`InvitationAccess` reutiliza o mesmo controlador automático da Home, com
`origin="header"`, e fornece seus slots ao Screen. O Screen não cria outro
player quando recebe esses slots. A área fica depois do cabeçalho e antes de
“Seu convite”. Não se acrescenta “Um novo capítulo, juntos.” nem se modifica
o conteúdo do card.

O centro do ícone é medido nos dois eixos em relação à área do vídeo, na abertura
e no recolhimento. Variáveis CSS estabelecem o `transform-origin` desse ponto.
A transição localizada de escala/opacidade acompanha os mesmos 850 ms e easing
`cubic-bezier(.22,.8,.2,1)` da expansão compartilhada. O grid aumenta/reduz
altura real; título, card e rodapé acompanham o fluxo, sem overlay no formulário.
A Home e os controles manuais internos mantêm sua apresentação padrão.

Comportamentos compartilhados:

- Primeira apresentação automática após 1 segundo, com autoplay muted e playsInline.
- “Ativar som” altera o áudio sem reiniciar o tempo de reprodução.
- Término aguarda os mesmos 500 ms existentes e recolhe em 850 ms.
- Fechamento, watchdog de carregamento e rejeição de autoplay preservados.
- Replay explícito reinicia em zero, silencioso, mesmo após apresentação anterior.
- A mesma chave `wedding:proposal-intro:v1` e fallback em memória controlam Home
  e link exclusivo; não foi criado storage paralelo. Se a sessão já viu a intro,
  o link permanece recolhido e o ícone permite reprodução manual.
- Movimento reduzido remove as transições, preservando vídeo e acesso.
- O foco retorna ao ícone somente quando estava nos controles do player;
  digitação no PIN não provoca deslocamento de foco para o vídeo.
- Ao autenticar/navegar, o controle de foco da rota cancela timers, pausa o
  player e, na variante do link, remove o src e chama load para liberar a mídia.

A URL pública existente do vídeo, progressive loading e configuração de
produção foram mantidos. Nenhum arquivo de filme foi copiado.

## Preservação do acesso

A alteração em `InvitationAccess` se limita ao hook de foco e ao wrapper/slots
visuais. `identify(code)`, saudação, PIN, validações, handlers de Abrir/Voltar,
erros, resume e redirecionamentos permanecem os mesmos. Nenhum backend,
Supabase remoto, autenticação, rate limit, migration, Edge Function, regra,
PWA, manifest, service worker ou paleta foi modificado.

## Arquivos

Modificados:

- `src/features/auth/PublicScreens.tsx`
- `src/components/HomeProposalVideo.web.tsx`
- `src/components/HomeProposalVideo.tsx` (somente tipagem da opção)
- `src/components/ui.tsx`

Criados:

- `tests/e2e/invitation-video.spec.ts`
- `docs/exclusive-link-video.md`

## Validação

A nova cobertura verifica estrutura, ícone, ausência do título da Home, delay,
duração CSS, origem medida, deslocamento real em fluxo, autoplay, som sem reset,
término, replay, sessão compartilhada, foco/texto do PIN, acesso legado enquanto
reproduz, limpeza do player, Voltar, erros, movimento reduzido e larguras
320/390/768/1280. A suíte existente verifica regressões da Home e acesso real
por link/PIN usando o banco local descartável.

Foram inspecionadas capturas do navegador local em desktop, tablet, 320 px e
emulações de Pixel/iPhone. A mídia é simulada nos testes e capturas, evitando
baixar o filme de 44 MB; não foi realizada inspeção em aparelhos físicos ou
Safari real. A interface permanece responsiva nessas emulações.

Resultados locais: **252 unitários**, **138 E2E na suíte completa** e **8 casos
específicos reexecutados na árvore final**, todos aprovados. Lint, TypeScript,
build/export e validação de assets/PWA aprovados. A exportação em Chromium real
retornou zero erros de instalabilidade, evento nativo com `defaultPrevented=true`
e service worker controlador `/sw.js`.
