# Informações do convidado

Alteração restrita à apresentação de `src/features/guests/InfoScreen.tsx`, sobre a main sincronizada após `565d952`. O título principal passa a ser “Informações”; “O nosso dia” permanece e a data apresentada é “15 de dezembro de 2026, às 16h”. Nenhum dado do evento é atualizado.

O card branco existente reúne introdução, seis tópicos e assinatura. Reutiliza `Screen`, `Card`, os estilos compartilhados e tokens da paleta azul. O texto tem largura máxima de leitura de 780 px, alinhamento à esquerda, altura de linha de 27 px e divisórias suaves. Os títulos numerados têm 18 px e peso 700; o título dos recados mantém a hierarquia de heading existente. Negritos e itálicos são `Text` aninhados, sem biblioteca Markdown; textos, emojis, pontuação e destaques aprovados são preservados.

Links nas referências “Local”, “Presença”, “Convites” e “Perfil” utilizam o `Link` do Expo Router e as rotas existentes `/como-chegar`, `/presenca`, `/ingressos`, `/perfil`. A elegibilidade utiliza `canAccess` existente; a proteção de cada tela permanece intacta. O endereço exibido `www.felipeelais2026.com.br` aponta para `https://felipeelais2026.com.br`, sem abrir loja ou aplicativo externo. Links têm sublinhado, negrito e foco visível; transição de cor de 180 ms é desativada sob movimento reduzido.

## Ajuste posterior solicitado

Por instrução expressa posterior, o controle “Privacidade e seus dados” e seus dois parágrafos foram removidos integralmente desta tela. Esse ajuste altera apenas apresentação: Perfil, consentimentos, revogação, proteções, logout e rodapé permanecem intactos. Não foi criada política substitutiva nem modificada outra tela.

Cabeçalho, ícone/player de vídeo, cronômetro compacto, navegação, botão Baixar app, logout, rodapé e todas as demais telas reutilizam os componentes anteriores sem alterações de código.

## Validação

`tests/e2e/information.spec.ts` confere o texto integral aprovado, emojis, seis tópicos, negritos/itálicos, links, foco, ausência do bloco removido, logout, bloqueio sem sessão, vídeo e contador compacto. Captura screenshots em 320, 375, 390, 768 e 1280 px e verifica ausência de overflow. A navegação externa é interceptada no teste, sem acessar contas ou dados de produção. Testes existentes de Perfil, PWA e autenticação são usados como regressão.

Validação mobile em Chromium com viewports simulados; não equivale a testes em Android/iPhone físicos ou Safari real. Não foram alterados backend, Supabase, migrations, Edge Functions, autenticação, RSVP, QR, mensagens, rotas ou regras de negócio. Não há dependências de banco/deploy de Edge para esta entrega.

Resultados locais: 285 testes unitários passaram; 21 cenários E2E relevantes foram aprovados (8 novos da tela, 2 de acesso/PIN/legado, 2 de Perfil e 9 de instalação PWA). Lint, TypeScript, build/export web e validação dos assets/worker/PWA em Chromium passaram. Capturas visuais inspecionadas em mobile, tablet e desktop. Apenas esta tela, seu teste e esta documentação foram modificados/criados.
