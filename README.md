# Felipe & Laís — convite digital inteligente

Uma aplicação compartilhada para convidados, noivos e cerimonial, em Web, Android e iOS. A antiga animação foi removida; seu histórico permanece no Git. Celebração: **15/12/2026 às 16h, America/Sao_Paulo**. Local e coordenadas permanecem vazios até configuração pelos noivos.

## Executar

Node 24 LTS e npm. Python não é mais necessário. Expo SDK 57, React 19, React Native 0.86 e Expo Router usam versões compatíveis do SDK, fixadas pelo lockfile.

```sh
npm ci
cp .env.example .env
# Para demonstrar sem serviços externos, altere EXPO_PUBLIC_DEMO_MODE=true em .env.
npm run web
# ou
npm run start
npm run android
npm run ios
```

O modo demo é permitido **somente quando `__DEV__` é verdadeiro**, com opt-in explícito. A tela inicial oferece três papéis de demonstração. Também aceita `/c/DemoConviteExclusivoFelipeLais2026`. Usa exclusivamente dados fictícios e armazenamento local; não autentica administradores no Supabase nem envia mensagens externas. Expo export/EAS em produção não habilitam esse acesso, mesmo que a variável esteja `true`.

Na máquina de nuvem, se o diretório pessoal não permitir escrita, use `npm_config_cache=/tmp/wedding-npm EXPO_NO_TELEMETRY=1 EXPO_NO_CACHE=1` antes dos comandos. O Chromium do sistema pode ser usado com `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium`.

## Experiência

- **Convidado:** acesso por convite familiar, sessão persistente, identificação opcional do usuário do aparelho, contatos e consentimentos separados, RSVP por pessoa, ingresso por confirmado, presentes/interesses, mensagens privadas à família/noivos, avisos e localização.
- **ADMIN:** indicadores; gestão de famílias, integrantes, acompanhantes e contato principal; movimentação, junção/divisão; códigos de alta entropia, rotação/bloqueio; presentes, mensagens privadas/familiares/gerais, regras de notificações e local; dia do evento.
- **CEREMONIALIST:** scanner e alternativa acessível/manual, confirmados, conferência antes de registrar, últimas entradas, cache e sincronização offline. Sem contatos, restrições alimentares, conversas privadas ou CRUD administrativo no payload do backend.

Cada convite é uma capacidade compartilhada pela família: todos os aparelhos vinculados podem responder pelos integrantes desse convite. A identificação de quem usa o aparelho é voluntária, não autenticação pessoal. RSVP e check-in são entidades distintas.

## Backend Supabase

Configure as variáveis públicas de URL, chave anon/publicável e ID do evento. Nunca inclua service role ou credenciais de providers no app. Para desenvolvimento local, com Supabase CLI e Docker:

```sh
npx supabase start
npx supabase db reset
npx supabase functions serve
```

`supabase/migrations/` cria o banco, RLS, RPCs transacionais, audit log, deduplicação e outboxes. `supabase/seed.sql` cadastra apenas o evento e nove regras editáveis. Não cria convidados reais ou ADMIN. Crie os usuários autorizados no Supabase Auth e atribua papéis em `user_roles` por um operador confiável, conforme [segurança](docs/security.md). Ative Anonymous Auth para convidados; configure o template de OTP de e-mail e SMTP para login dos noivos/cerimonial. Configure proteção antiabuso/CAPTCHA de Auth e gateway antes de produção.

`redeem-invitation` valida o JWT no servidor e associa seu usuário ao convite pelo hash do código. A RPC de associação não pode ser executada diretamente por clientes. As demais RPCs verificam evento, papel e vínculo; as tabelas não concedem mutações diretas aos clientes. Rotacionar/bloquear códigos encerra vínculos existentes desse convite.

Para um projeto hospedado, revise migrations/seed antes de `supabase db push` e faça deploy das três Edge Functions. Nenhuma implantação hospedada é executada por este projeto. Workers requerem `WORKER_SECRET`, devem ser agendados por um scheduler seguro e não são acionados pelo app. Configuração detalhada: [banco](docs/database.md), [notificações](docs/notifications.md), [Sheets](docs/google-sheets-integration.md).

## Offline e QR

Cache e fila centralizada por usuário/evento. Mutações têm UUID e só saem da fila após confirmação do backend. Sem conexão, a UI informa “Salvo neste dispositivo”. Dados administrativos exigem conexão; versões evitam sobrescrita de famílias/convidados/presentes/regras concorrentes. Sair com pendências requer optar explicitamente por descartá-las.

Ingressos contêm tokens aleatórios de 256 bits; o servidor armazena somente SHA-256. A cópia utilizável fica no dispositivo que a emitiu. Em outro dispositivo, **regenerar revoga a versão anterior**. Uma resposta negativa revoga o ingresso. Abra os ingressos conectado antes do evento para cachear.

O cerimonial sincroniza hashes válidos e confirmados. Offline, valida o hash e enfileira o check-in; o backend limita a uma entrada por convidado. Dois aparelhos offline não compartilham instantaneamente entradas e revogações: [limitações e operação](docs/offline-checkin.md).

Web: manifest e service worker no export, cache da aplicação e shell, sem cache de respostas Supabase. Use hosting com fallback SPA para `/c/*` e HTTPS. Não publique em uma pasta GitHub Pages sem adaptar caminhos e fallback. No primeiro uso sem conexão não existe cache; estados de erro são explícitos. PWA requer que a página seja aberta online antes do uso offline.

## Integrações

IN_APP é persistido no banco. Push nativo tem consentimento, permissão e armazenamento de Expo tokens; precisa de projeto EAS e credenciais APNs/FCM. E-mail (Resend) e WhatsApp (Meta, template aprovado) têm adapters reais, mas permanecem desativados sem configuração. `sent` externo significa aceitação pelo provider, não leitura pelo usuário. Outbox possui status, tentativas, erros e chave idempotente.

Google Sheets é uma projeção do PostgreSQL, nunca o banco principal. O adapter procura `Convidado ID` e preserva colunas não mapeadas. Não modifica cabeçalhos nem apaga linhas. A planilha real **não foi acessada ou alterada**. O script de importação gera relatório privado, valida e sinaliza possíveis duplicados; nunca aplica dados silenciosamente:

```sh
npm run import:report -- entrada-normalizada.json /tmp/relatorio-importacao.json
```

## Verificação

```sh
npm run lint
npm run typecheck
npm test
npm run check:functions
npm run test:functions # providers com HTTP simulado; nenhum envio externo
npm run test:db       # Docker, PostgreSQL 17 descartável e Auth stub; não acessa produção
npm run test:e2e      # Chromium, Expo dev e dados demo isolados
npm run build:web
npm run serve:web    # export com fallback SPA para /c/*
# Em outro terminal, sem configuração externa:
npm run test:export  # produção/PWA offline e demo bloqueado
```

Os testes de banco executam as migrations reais, RLS e RPCs sobre PostgreSQL. O Auth stub representa `auth.uid()`; não substitui teste de OTP/gateway de um projeto Supabase configurado. Tests de navegador cobrem papéis, link, RSVP individual, ingressos, presentes, mensagens, check-in QR/manual/offline e larguras de celular/tablet/desktop.

## Arquitetura e próximo deploy

`app/` contém as rotas por papel; `src/features/` telas e domínio; `src/repositories/` Supabase e demo; `src/storage/` cache/fila; `src/components/` componentes acessíveis; `src/theme/` tokens. TanStack Query sincroniza snapshots; Zod valida entradas; SQL mantém a autorização definitiva.

- [Arquitetura](docs/architecture.md)
- [Banco](docs/database.md)
- [Segurança e privacidade](docs/security.md)
- [Google Sheets](docs/google-sheets-integration.md)
- [Notificações](docs/notifications.md)
- [Offline do cerimonial](docs/offline-checkin.md)
- [Publicação nas lojas](docs/store-publishing.md)

`eas.json` prepara development/preview/production; bundle/package IDs e domínio são configuráveis. EAS, associação do domínio, builds nativos assinados, contas de lojas, política final e credenciais de push devem ser configurados antes da distribuição. Nenhuma publicação, cobrança ou pagamento foi implementado nesta fase.
