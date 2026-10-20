# Inspeção visual — Padrinhos V2

Capturas reais do Chromium em 320, 768 e 1280 px, com altura de 900 px.
As animações nativas foram pausadas nos frames indicados para avaliar as camadas;
a sequência normal também foi executada nos testes de conclusão e replay.
As imagens usam dados fictícios do modo demo, sem dados de convidados de produção.

Cada painel contém: fechado → aba parcial → aba aberta → início da extração →
extração parcial → extração concluída → pico branco → carta branca → leitura
descendo → leitura subindo. A captura parcial da aba usa 25% do tempo da animação;
a curva de easing e a perspectiva continuam sendo as da implementação real.

- [320 px](sequencia-320.jpg)
- [768 px](sequencia-768.jpg)
- [1280 px](sequencia-1280.jpg)

A inspeção confirmou a carta oculta antes do clique, aba aberta antes da extração,
dobras frontais encobrindo a parte inferior da carta, branco cobrindo a viewport,
papel predominantemente branco com desgaste discreto, tipografia manuscrita e
rolagem sem corte horizontal. As asserções também verificam opacidade calculada,
geometria e revelação reversível; não dependem apenas de classes ou existência.

Reproduzir os frames completos (10 PNGs por largura, anexados ao resultado local
Playwright em `test-results/`):

```sh
npx playwright test tests/e2e/wedding-party.spec.ts -g 'Physical envelope frames'
```

Validação final: 340 unitários e 235 E2E passaram; os três testes de frames foram
reexecutados com o ângulo parcial mais distinto e passaram. Lint, TypeScript,
build/export, assets/PWA nativa e testes PostgreSQL/RLS passaram.
A inspeção autenticada do domínio publicado não foi possível: o proxy deste
ambiente bloqueia a conexão ao domínio personalizado antes da resposta do site.
