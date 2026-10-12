# Domínio próprio — Felipe & Laís

Destino canônico: **https://felipeelais2026.com.br/**. Esta alteração prepara o código e os builds; não configura DNS, GitHub Pages, Supabase ou produção.

## Diagnóstico e arquivos

O projeto usa **Expo/React Native Web e Expo Router**, não Vite/React Router. `app.config.ts` utiliza `experiments.baseUrl`, compartilhando a normalização com `config/web-paths.cjs`. `/` significa raiz. O workflow de deploy agora usa `EXPO_PUBLIC_WEB_BASE_PATH=/` e `EXPO_PUBLIC_WEB_BASE_URL=https://felipeelais2026.com.br`, preservando Event ID, demo desativado e Repository Variables públicas do Supabase/Maps.

`npm run build:web` limpa o cache do Metro antes do export: variáveis públicas são incorporadas ao JS, e reusar bundles de outro ambiente pode preservar uma base antiga. Essa limpeza é de build, não altera a estratégia de cache do PWA.

`scripts/web-assets.mjs` gera manifest, registro do SW, cache versionado, assets e `404.html` conforme a base. `public/CNAME` acompanha o export. Para publicação por **Actions**, o domínio também precisa ser definido em **Settings → Pages → Custom domain**: CNAME no artefato não substitui essa configuração. A definição no repositório será preservada entre deploys; não é necessário alterá-la a cada publicação.

A consulta somente leitura ao GitHub nesta preparação retornou `build_type=workflow`, `cname=null`, `https_enforced=true` e a URL antiga do projeto. Logo, o domínio personalizado ainda não estava configurado nessa consulta. Não foi efetuada escrita nas configurações.

### Inventário das referências ao caminho/nome antigo

- `.github/workflows/deploy-pages.yml`: referência de publicação substituída pela raiz/domínio novo.
- `.github/workflows/ci.yml`: mantém deliberadamente o teste do subdiretório legado e acrescenta build/export do domínio novo na raiz.
- `.env.example`: comentário atualizado para diferenciar domínio raiz e build legado; valores de base permanecem vazios, com padrão raiz.
- `scripts/web-assets.mjs`, `scripts/test-export.mjs`: prefixo antigo restrito à compatibilidade/testes, não ao caminho de assets de produção.
- `playwright.config.ts`, `tests/e2e/workflows.spec.ts`, `tests/recovery.test.ts`, `tests/access.test.ts`, `supabase/functions/send-invitations/handler.test.ts`: URLs fictícias/exemplos com prefixo, necessárias para testar compatibilidade. Não determinam o domínio de produção.
- `scripts/rebuild-pr21/clear-browser-data.js`, `tests/e2e/rebuild-clients.spec.ts`: ferramenta histórica para limpar apenas dados do ambiente antigo; não executar como parte da troca de domínio.
- `docs/access-families.md`, `docs/stabilization-deliveries.md`, `docs/profile-migration-audit.md`: documentação histórica de implantação/auditoria, não configuração executável.
- `README.md`: publicação e reprodução atualizadas; referências remanescentes explicam compatibilidade legada.
- `app.config.ts`, `package.json`/lock: nome/slug do projeto, não base de rota; permanecem iguais.
- `src/features/rsvp/calendar.ts`, `tests/countdown-calendar.test.ts`: domínio lógico do UID ICS, não URL navegável. Preservado para não trocar a identidade dos eventos já importados.

Não há domínio antigo hardcoded no Router, no manifesto fonte ou no SW fonte. URLs HTTPS externas, como Storage Supabase da imagem do convite e lojas, permanecem externas e não devem ser reescritas.

## Configurações externas — somente depois da aprovação

1. Verificar a propriedade do domínio no GitHub (Settings da conta → Pages → Verified domains). Copiar o registro TXT e valor exatos fornecidos pelo GitHub. Não inventar o token de verificação.
2. Em Settings do repositório → Pages, manter fonte **GitHub Actions** e configurar `felipeelais2026.com.br` como Custom domain.
3. Configurar DNS conforme abaixo e aguardar propagação/check do GitHub. Remover somente registros conflitantes de hospedagem para `@`/`www`; preservar MX, SPF, DKIM e outros registros de e-mail.
4. Aguardar certificado e habilitar **Enforce HTTPS** para o domínio novo quando disponível.
5. Ajustar manualmente as configurações externas de Auth, Function e Maps descritas abaixo, coordenando com a publicação do build raiz.
6. Após revisão/merge, publicar pelo workflow existente. Merge em main dispara deploy automaticamente: não fazer merge antes de preparar e aprovar a janela de ativação.
7. Verificar o domínio real, links antigos, recuperação de senha e instalação PWA. Não há como validar o redirecionamento real do GitHub ou o certificado antes da ativação.

**Janela de ativação:** coordenar a propagação DNS, a configuração do domínio no Pages e a publicação do artefato raiz. Ativar o redirecionamento antes de o DNS responder, ou publicar o build raiz ainda no subdiretório antigo, pode gerar indisponibilidade temporária. Não é uma troca automaticamente atômica; verificar propriedade, preparar os registros e o build antes de iniciar a mudança.

## DNS recomendado

No domínio raiz (`@`), usar os quatro A oficiais do GitHub Pages:

| Tipo  | Nome | Valor                           |
| ----- | ---- | ------------------------------- |
| A     | @    | 185.199.108.153                 |
| A     | @    | 185.199.109.153                 |
| A     | @    | 185.199.110.153                 |
| A     | @    | 185.199.111.153                 |
| CNAME | www  | felipecontaremota-dot.github.io |

IPv6 opcional: quatro AAAA em `@`: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.

O CNAME de `www` não contém protocolo ou `/convite-felipe-e-lais`. O canônico escolhido é o domínio sem www; conferir o redirecionamento de www após configurar ambos. Não usar wildcard DNS. Durante a troca, TTL de 300–600 segundos pode facilitar a transição, se o provedor permitir.

Referência: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

## Supabase, autenticação e e-mails

Nenhuma configuração do Supabase foi lida ou alterada nesta tarefa. As definições remotas abaixo precisam ser verificadas e ajustadas por operação autorizada separada:

- Auth → URL Configuration: Site URL `https://felipeelais2026.com.br/`.
- Redirect URLs: autorizar o callback exato `https://felipeelais2026.com.br/recuperar-senha`, e somente outros callbacks realmente utilizados. Manter os URLs antigos de recuperação durante a transição, inclusive o caminho antigo que possa resultar do redirecionamento. Não substituir tudo por wildcard global.
- `resetPasswordForEmail` deriva `redirectTo` de `EXPO_PUBLIC_WEB_BASE_URL`; o build novo passa a pedir o callback no domínio novo. O fluxo de token_hash/hash e suas proteções não foram alterados.
- Login por senha e sessões anônimas continuam utilizando o mesmo Supabase. LocalStorage/sessões são isolados por origem: no domínio novo, o convidado pode precisar abrir novamente o link e informar a senha. Não há transferência de tokens entre domínios.
- `send-invitations` utiliza o secret/configuração **PUBLIC_WEB_BASE_URL**. Ele precisa ser atualizado futuramente para `https://felipeelais2026.com.br` em uma operação expressamente autorizada. Não alterar senhas/sharing_code, SMTP, API keys ou From do Resend.
- **Envios pending:** trocar a base muda HTML/texto e o hash do payload. A proteção existente pode impedir retry da operação antiga por conteúdo divergente. Não reprocessei nem alterei deliveries. Rever essas operações antes de trocar a base; confirmar resultado ou usar o fluxo consciente já existente, sem criar novos envios automaticamente.
- A configuração versionada de CORS nas Functions é `Access-Control-Allow-Origin: *`, com Authorization/apikey e checagem de usuário/papel. Não há allowlist de domínio a alterar no código; a versão realmente implantada deve ser conferida separadamente. Nenhuma regra foi ampliada nesta tarefa.
- Google Maps: se a chave de embed tiver restrição de referrer, adicionar `https://felipeelais2026.com.br/*` (e www, se necessário), mantendo a restrição de API. Não alterar o valor da chave.

As Repository Variables Supabase existentes e o projeto `nwgyxmwaqckpghznbfzm` permanecem iguais. Nenhuma credencial foi acrescentada ao repositório.

## Links antigos e rotas

Os códigos permanecem os mesmos. Um novo link pode ser `https://felipeelais2026.com.br/c/<sharing_code>` sem regenerar ou invalidar o convite. O frontend administrativo deriva a base do build, não modifica o code_hash.

GitHub Pages normalmente redireciona o endereço padrão para o domínio personalizado quando configurado. Como o prefixo do projeto pode permanecer no destino, o HTML raiz reconhece exclusivamente `/convite-felipe-e-lais` e seus subcaminhos e remove esse prefixo antes do Router. Mantém código, query e hash nesse primeiro passo; a sanitização existente continua removendo queries desconhecidas e capturando/limpando tokens de recuperação. Não há redirecionamento para host arbitrário.

Isso cobre links tanto com `/c/<code>` quanto com `/convite-felipe-e-lais/c/<code>` no domínio novo. Não garante sozinho que GitHub/DNS redirecionará URLs do host antigo: conferir links reais após ativação. Não é necessário rotacionar ou reenviar todos os convites.

Rotas diretas usam o fallback `404.html` do Pages, com status HTTP 404 e aplicação funcional, preservando o caminho. Esta limitação de hospedagem já existia. Foram acrescentadas verificações de acesso direto/reload para login, início, painel, presentes, convites, perfil, presença e local, mantendo proteção de acesso. A suíte E2E também exercita navegação autenticada.

## PWA e apps nativos

No export raiz: `start_url=/`, `scope=/`, SW `/sw.js`, ícones `/icon-192.png` e `/icon-512.png`, assets locais. Nome, standalone e estratégia de cache permanecem iguais. A versão do cache continua sendo calculada pelo conteúdo do build; não há cache de respostas privadas ou URLs de convites.

O PWA antigo pertence a outra origem. Seu ícone instalado, sessão, cache, filas offline e permissões de push não podem ser migrados automaticamente por este build. Sincronizar alterações pendentes no app antigo enquanto ele ainda funcionar, instalar o app no domínio novo, autenticar-se e solicitar permissões novamente quando necessário. Não limpar dados antigos antes de sincronizar. A remoção do ícone antigo é decisão do usuário. Atualizações do PWA novo continuam pelo SW existente, sem limpeza global de caches.

Android/iOS: scheme `felipeelais://`, IDs e regras de negócio não mudam. `app.config.ts` deriva os hosts de app links/associatedDomains de EXPO_PUBLIC_WEB_BASE_URL; novos builds com o domínio novo terão esse host. Apps instalados anteriormente não recebem novo entitlement por um deploy Web. Para links HTTPS verificados abrirem diretamente no app, ainda é necessário hospedar `/.well-known/assetlinks.json` e `apple-app-site-association` com fingerprints/Team ID reais e validar a assinatura. Não foram criados arquivos fictícios. Sem isso, os links HTTPS continuam utilizáveis pelo navegador; o scheme nativo existente permanece.

## Reproduzir sem produção

```sh
EXPO_NO_TELEMETRY=1 EXPO_NO_CACHE=1 EXPO_PUBLIC_WEB_BASE_PATH=/ EXPO_PUBLIC_WEB_BASE_URL=https://felipeelais2026.com.br npm run build:web
EXPO_PUBLIC_WEB_BASE_PATH=/ npm run test:export
npm run test:e2e
EXPO_PUBLIC_WEB_BASE_URL=https://felipeelais2026.com.br npx expo export --platform android --clear
EXPO_PUBLIC_WEB_BASE_URL=https://felipeelais2026.com.br npx expo export --platform ios --clear
```

Testes de export interceptam chamadas externas; não criam usuários, não enviam convites nem acessam Supabase real. Testes locais não comprovam DNS/TLS, instalação física do PWA ou app links assinados. A suíte mantém também o build legado no subdiretório para detectar regressões.
