# Portal do Cerimonialista

## Recuperação e arquitetura

A implementação local interrompida foi recuperada em `main`, preservando o painel administrativo e os demais fluxos. O perfil `CEREMONIALIST`, login por Supabase Auth, tabela `user_roles`, QR individual, `checkins`, auditoria, fila e tela operacional já existiam. Faltavam o portal próprio, a projeção mínima de dados operacionais, as classificações reais de padrinhos, confirmação manual e integração segura de presença persistida entre dispositivos.

O portal reutiliza `/inicio`, `/informacoes`, `/como-chegar`, `/padrinhos`, `/dia-do-evento` e o botão PWA existente. `/checkin` permanece como acesso alternativo à mesma tela operacional. ADMIN continua em `/painel`; o convidado mantém seu início e surpresa dos padrinhos. O componente `WeddingOverview` compartilha a apresentação geral do casamento sem usar a unidade exclusiva de ninguém. Os três botões do portal são Ler convite, Ver informações e Lista de padrinhos, nessa ordem.

A lista de padrinhos usa somente promoções ativas reais, nome cadastral e dados operacionais; cartas, apelidos privados e controles de promoção permanecem nos fluxos existentes. A lista Dia do evento inicia em Confirmados e permite consultar os demais status sem autorizar entrada. Busca ignora caixa e acentos; ordenação usa português brasileiro. Observações gerais, alimentares e de RSVP preservam quebras de linha.

## Segurança e persistência

A migration incremental `ceremonial_portal` não cria tabelas paralelas. Preserva OIDs e assinaturas das RPCs públicas e isola suas implementações anteriores em `ceremonial_private`, sem acesso de cliente. O novo `app_snapshot` usa a role real do evento e projeta apenas campos necessários ao cerimonial. ADMIN recebe também a classificação operacional de padrinho; o snapshot GUEST permanece delegado à implementação anterior.

`app_mutate` preserva as ações anteriores e reforça CHECKIN_CREATE: auth.uid, role ADMIN/CEREMONIALIST no evento, unidade ativa/não arquivada, QR real não revogado, associação correta e RSVP CONFIRMED. Bloqueio da linha do convidado, ordem consistente de locks RSVP/credencial e índices únicos existentes evitam duas entradas em concorrência. Uma repetição retorna o registro original, sem nova auditoria ou contador. Nenhuma operação confirma RSVP automaticamente.

A única política RLS nova concede SELECT de `checkins` ao CEREMONIALIST do mesmo evento para sincronização. Não concede escrita direta nem amplia acesso bruto a contatos/convidados/RLS administrativa. A tabela existente é adicionada à publicação `supabase_realtime` somente se necessário. O cliente refaz o snapshot após evento Realtime; fallback operacional de cinco segundos apenas em página visível e online para sessão ADMIN/CEREMONIALIST, além da sincronização já existente.

A tag Presente e os contadores usam somente check-ins persistidos, nunca RSVP ou fila local. Registro manual exige confirmação explícita. Falha mantém o modal e conserva mutation ID para retry. Scanner usa `expo-camera`, QR existente `wedding://ticket/...`, SHA-256 e validação backend; não exige novos convites. Offline oferece consulta, sem declarar presença não confirmada pelo servidor. Consulte [operação offline](offline-checkin.md).

## Conta e primeiro acesso

Na consulta de produção de 22/10/2026 UTC não havia conta não excluída associada à role CEREMONIALIST. A role já existia; não foi criada conta compartilhada, senha fixa nem credencial em código. Naquela consulta não havia identificador de login existente para fornecer. A leitura na retomada de 23/10/2026 confirmou uma conta ativa associada a CEREMONIALIST; o e-mail deve ser consultado pelo administrador autorizado no Dashboard, sem divulgação de credenciais neste documento. O acesso e a recuperação seguem os passos abaixo, reutilizando essa conta.

Um operador confiável do projeto Supabase deve:

1. Obter o e-mail pessoal do profissional e verificar se já existe em **Authentication → Users**. Reutilizar a conta correta, sem duplicá-la. Para conta nova, usar **Add user → Create new user** no Dashboard com e-mail verificado pelo operador e senha aleatória forte temporária gerada fora do repositório; não distribuir essa senha. Confirmar o e-mail somente após conferir sua titularidade. O profissional definirá a própria senha por recuperação. Não usar signup público nem editar `user_metadata` para conceder papel.
2. Anotar o UUID real de Users e o UUID do evento que corresponde ao `EXPO_PUBLIC_EVENT_ID` da configuração canônica de produção. Conferir `events`, sem escolher arbitrariamente o primeiro evento.
3. Executar no SQL Editor confiável, substituindo os dois placeholders abaixo. A consulta não sobrescreve eventual papel ADMIN existente; exige confirmação humana do evento e da pessoa:

   ```sql
   begin;
   insert into public.user_roles(event_id,user_id,role)
   select e.id,u.id,'CEREMONIALIST'::public.app_role
   from public.events e cross join auth.users u
   where e.id='<UUID_DO_EVENTO>'::uuid
     and u.id='<UUID_DA_CONTA>'::uuid
     and u.deleted_at is null
   on conflict(event_id,user_id) do nothing;
   select r.event_id,u.email,r.role
   from public.user_roles r join auth.users u on u.id=r.user_id
   where r.event_id='<UUID_DO_EVENTO>'::uuid
     and r.user_id='<UUID_DA_CONTA>'::uuid;
   commit;
   ```

   Confirmar que há exatamente uma linha para a conta/evento e role CEREMONIALIST. Se aparecer ADMIN ou nenhuma linha, investigar; não substituir o papel automaticamente.

4. Conferir em **Authentication → URL Configuration** que a Site URL é o domínio de produção e que `https://felipeelais2026.com.br/recuperar-senha` está na lista permitida. Autorizar o equivalente `www` somente se usado na configuração canônica. Manter o template seguro de recuperação existente e o SMTP já aprovado.
5. Orientar o profissional a abrir **https://felipeelais2026.com.br/login** (o endereço www do site pode redirecionar para o domínio canônico), informar seu e-mail e usar **Esqueci minha senha**. Receberá link individual de uso único pelo Supabase Auth/SMTP existente. Na tela de recuperação definirá e confirmará uma senha própria; não encaminhar o link nem copiar tokens para logs. O login normal é e-mail + senha, não nome + PIN de convidado.
6. Após login, a role é validada no backend e a conta entra em `/inicio`. A própria senha também pode ser alterada em `/conta`, com sessão válida. Para redefinir depois, repetir Esqueci minha senha. Conta sem role autorizada não ganha acesso por conhecer a URL.
7. Usar **Baixar app** na navegação. Quando o navegador disponibiliza a instalação nativa, o fluxo existente solicita o prompt; nos demais casos mostra instruções. O PWA instalado usa a mesma origem e autenticação. Não há APK ou loja.
8. Em Dia do evento → Ler QR Code, permitir câmera no navegador e no sistema operacional. HTTPS é obrigatório fora de localhost. Em caso de recusa/indisponibilidade, liberar nas configurações ou usar a busca e confirmação manual. Android/Chromium e Safari/iOS dependem das permissões e APIs do aparelho; testar o dispositivo que será levado ao evento antes da operação real.

Nenhuma senha, link de recuperação, chave privilegiada ou credencial real deve ser registrada em relatório/commit.

## Validação reproduzível

- `npm test`: seletores, isolamento, classificação real e regressões unitárias.
- `npm run test:db`: migrations em banco descartável, RLS, projeção mínima, papéis negativos, QR revogado/inválido/outro evento, RSVP não confirmado, unidade inativa/arquivada, auditoria única e concorrência QR+manual por dois operadores.
- `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`: navegação/login, manual cancelar/falhar/retry, presença entre contextos staff/admin, listas/320px/desktop e regressões. O teste de câmera gera uma imagem QR real em vídeo Y4M, fornece stream de câmera simulada ao Chromium e usa o decodificador real do SDK. Somente o transporte Supabase é direcionado ao PostgreSQL descartável, nunca a produção.
- `npm run lint`, `npm run typecheck`, `npm run build:web`, `npm run test:export`: verificações estáticas e exportação/PWA.

Câmera simulada não substitui validação física Android/iOS ou PWA instalado. Nenhum registro real de RSVP/check-in pode ser usado para teste destrutivo em produção. A verificação remota deve ser somente leitura. Manifest, service worker, vídeo, mensagens e a paleta não requerem alterações nesta entrega.

## Inventário da entrega

- `app/(guest)/inicio.tsx`
- `app/(guest)/padrinhos.tsx`
- `docs/access-families.md`
- `docs/ceremonial-portal.md`
- `docs/offline-checkin.md`
- `playwright.config.ts`
- `scripts/test-ceremonial.ts`
- `scripts/test-db.sh`
- `src/components/ui.tsx`
- `src/features/ceremonial/HomeScreen.tsx`
- `src/features/ceremonial/OperationalGuests.tsx`
- `src/features/ceremonial/PartyListScreen.tsx`
- `src/features/ceremonial/domain.ts`
- `src/features/admin/HomeScreen.tsx`
- `src/features/checkin/CheckinScreen.tsx`
- `src/features/guests/AdminGuests.tsx`
- `src/features/guests/HomeScreen.tsx`
- `src/features/guests/InfoScreen.tsx`
- `src/features/location/LocationScreen.tsx`
- `src/lib/AppProvider.tsx`
- `src/repositories/api.ts`
- `src/repositories/demo.ts`
- `src/types/domain.ts`
- `src/utils/security.ts`
- `supabase/migrations/20261023001246_ceremonial_portal.sql`
- `tests/access.test.ts`
- `tests/ceremonial.sql`
- `tests/ceremonial.test.ts`
- `tests/e2e/ceremonial-portal.spec.ts`
- `tests/e2e/staff-and-pin.spec.ts`
- `tests/e2e/workflows.spec.ts`
- `tests/support/qr-video.mjs`

## Resultado da validação e instalação

A migration `20261023001246_ceremonial_portal.sql` foi aplicada em produção após as validações. As contagens antes/depois permaneceram 69 convidados, 89 unidades de acesso, 69 RSVPs, 0 check-ins e 19 credenciais QR. Nenhum registro operacional real foi criado ou alterado para testar. Os helpers privados ficaram sem EXECUTE para clientes; a nova política é SELECT por role/evento e a publicação de checkins foi confirmada. Os advisories de segurança foram comparados com a base anterior, sem aumento de ocorrências.

Validação local: 351 unitários, 59 testes de Functions e suas verificações de tipos, suíte SQL completa com RLS e concorrência, lint, TypeScript e build/export aprovados. A rodada completa de 259 E2E aprovou 258 e revelou uma mensagem inadequada para câmera ausente; o SDK consolida esse caso com recusa de permissão. A mensagem foi corrigida e os 15 testes finais de portal/painel passaram, incluindo todos os cenários de câmera e sincronização afetados. A exportação final também preservou a emissão nativa de beforeinstallprompt, com captura antecipada e defaultPrevented verdadeiro.

## Ajuste operacional: scanner e reversão de entrada

**A migration de reversão foi aplicada manualmente pelo responsável em produção e seu registro oficial foi confirmado por leitura. O arquivo aprovado permanece intacto; esta retomada não executou SQL de escrita.** Veja a [auditoria da migration](checkin-reversal-migration-audit.md).

No cerimonial, o menu e o título da rota operacional são **Lista de convidados**; ADMIN mantém **Dia do evento**. Ler convite navega à mesma rota e solicita a abertura do mesmo `CameraScanner` usado por Ler QR Code. A navegação não executa check-in: somente uma leitura validada ou a confirmação manual pode registrar entrada.

A prévia anterior colapsava: o vídeo foi medido em 296 × 0 px no Chromium, dentro do wrapper `flex: 1` do expo-camera. O scanner agora usa modal acessível existente, com altura explícita de 280 px e flex não expansível, estados de preparação, permissão e erro recuperável. O fechamento desmonta CameraView e libera o stream. Essa reprodução demonstra um defeito de layout web; não prova a causa específica no telefone não inspecionado. Câmera física Android/iOS e PWA instalado ainda exigem validação no aparelho.

A migration incremental `20261023115359_checkin_reversal_history.sql` preserva a tabela de check-ins ativos e seus índices únicos. A reversão passa por `app_mutate(CHECKIN_REVERT)`, autorizada no servidor somente para ADMIN/CEREMONIALIST do evento. Não foi concedido novo privilégio de DELETE; a RLS permanece habilitada, com políticas somente de leitura e sem política de exclusão direta. O ID exato da entrada e um mutation ID estável protegem retries e evitam que uma remoção antiga apague uma nova entrada. Registro e reversão bloqueiam a mesma linha do convidado, serializando operações concorrentes.

A auditoria existente recebe cópia do check-in e nome cadastral, operador e horário da operação. O snapshot operacional projeta entradas originais e remoções; não concede leitura geral de audit_logs. Últimas entradas mantém os mesmos Cards, estilos, espaçamentos e organização, acrescentando somente textos de operação e identificação do operador pelo UUID Auth. Check-ins ativos determinam contadores e tag Presente; histórico não é contador. O QR original e o RSVP não são alterados. Após remoção, uma nova operação QR ou manual cria nova entrada auditada.

Uma entrada ativa anterior à migration continua visível e é integralmente capturada ao ser removida. Exclusões antigas sem metadados não permitem reconstruir a identidade com segurança. Na verificação pré-migration de produção havia uma entrada ativa e nenhuma exclusão histórica sem detalhes; nenhuma operação real foi usada em testes. Outros operadores recebem atualização Realtime, complementada por consulta a cada cinco segundos quando a página operacional está visível e online, inclusive em listas administrativas e de padrinhos.

Validação final desta retomada: 351 unitários, 59 testes de Functions, suíte SQL/RLS completa (incluindo upgrade, autorização, concorrência e auditoria), 260 E2E, lint, TypeScript, build e exportação aprovados. Inspeção visual em 320/1280 px e prévia de câmera simulada aprovadas. O proxy do ambiente bloqueia o acesso ao domínio publicado com CONNECT 403; não foram utilizadas credenciais reais nem executadas reversões em produção.
