# Captura antecipada de instalação PWA

## Causa e correção

O listener anterior era registrado no useEffect do InstallProvider. A investigação reproduziu um evento nativo aos 337ms, anterior ao listener React aos 412ms. Um listener posterior não recupera esse evento.

scripts/web-assets.mjs agora insere o bootstrap como primeiro script do head, antes do manifest e do bundle Expo. A implementação canônica fica em src/features/install/installBootstrap.ts: o build Node remove os tipos e serializa essa função autocontida; desenvolvimento usa a mesma função por meio do bridge. O inicializador é idempotente, com um único conjunto de listeners por documento.

O objeto beforeinstallprompt fica somente em uma closure em memória. A propriedade não enumerável window.__weddingPwaInstall disponibiliza métodos de integração; os componentes usam src/features/install/installBridge.ts. Não existe persistência nem serialização do evento. Reload cria outro documento e outro estado.

O provider usa useSyncExternalStore, reconhece o snapshot inicial e observa mudanças posteriores. Inscrição, leitura e remount não consomem o evento. Somente o clique consome a referência e chama prompt(), sem await ou timer anterior. Um bloqueio no store impede duas chamadas simultâneas e WeakSet impede reutilização da mesma instância do evento. Um novo evento do navegador permite uma tentativa nova.

## Estados e diagnóstico

Estados: pending, unsupported, ready, prompting, accepted, dismissed, error, installed. A presença da API não garante que o navegador disponibilizará um evento. Eventos genuínos posteriores prevalecem mesmo quando o suporte inicial foi desconhecido.

O snapshot diferencia captura antecipada/apos conexão do React, disponibilidade, consumo, resultado e motivo do fallback. Somente enums, contadores, timestamps e flags técnicas são registrados em memória; nenhum nome, PIN, telefone, dado de RSVP, erro com URL sensível ou log de console de produção é gravado. getSnapshot não revela o objeto do evento.

Standalone e appinstalled ocultam a ação. Fallback iOS/iPadOS e orientação pelo menu dos outros navegadores foram preservados. Recusa libera uma nova tentativa quando o navegador enviar outro evento. Erro de prompt é registrado separadamente de evento ausente.

## Validação

- tests/install-bootstrap.test.ts valida o script serializado, evento anterior ao React, evento posterior, inicialização idempotente, remount, consumo único, recusa/aceitação/erro, eventos concorrentes, appinstalled, standalone e documento novo.
- tests/e2e/pwa-install.spec.ts preserva os testes anteriores e inclui evento emitido no HTML entre o bootstrap real e o bundle React, seguido de login, navegação e clique.
- scripts/test-installability.mjs usa Chromium completo, perfil temporário não anônimo, Page.getAppManifest, Page.getInstallabilityErrors e evento nativo isTrusted. Não injeta evento artificial, não força critérios via flags e não acessa backend remoto. Verifica captura anterior ao evento, defaultPrevented=true e evento disponível após conexão do React, com consumed=0.
- O teste nativo integra npm run test:export e pode ser executado isoladamente por npm run test:pwa após build:web. PLAYWRIGHT_CHROMIUM_PATH pode apontar para o Chromium do ambiente; sem ele, o teste usa o Chromium completo instalado pelo Playwright.

O teste não exige um tempo absoluto nem exige que o navegador sempre emita antes do React: exige que a captura esteja registrada antes do evento. Navegadores podem avaliar elegibilidade em momentos diferentes.

Medição local da exportação atual com evento nativo, perfil não anônimo e CPU a 4x: registro 126,8ms; evento 1481,4ms; conexão do React 1798,5ms; capturePhase=early; defaultPrevented=true; isTrusted=true; zero erros de instalabilidade. O teste normal também passou (registro 47,4ms, React 401,2ms, evento 440ms).

## Integridade e limites

Nenhuma alteração de manifest, id, ícones, código/política do service worker, cache, autenticação, backend, Supabase, paleta, vídeo, mensagens, rotas ou navegação. O hash do worker gerado varia normalmente conforme o HTML de cada build; isso não representa uma mudança na política de cache.

Navegador sem suporte, modo anônimo, aplicativo já instalado, política de promoção ou ausência de elegibilidade continuam podendo impedir o prompt nativo. Essa correção elimina a perda por montagem tardia do React; não fabrica elegibilidade nem garante suporte no Android de qualquer navegador.
