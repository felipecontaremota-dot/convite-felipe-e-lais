# Confirmações no Painel dos noivos

## Fonte de verdade e recuperação

A migration `20261125191841_guest_activity_history.sql` reutiliza `public.audit_logs`. Não cria outra tabela de auditoria. A recuperação congela no mesmo audit store os fatos antigos comprovados, referenciando o UUID de origem e preservando seu timestamp. Um índice único por evento/origem garante idempotência. A view privada mantém o ID original na apresentação e deduplica as cópias. Nenhum registro original é alterado. Isso impede que uma nova resposta ou exclusão faça desaparecer um status histórico recuperável hoje. Nomes disponíveis no cadastro são marcados internamente como nomes atuais no momento da recuperação, sem afirmar que sejam necessariamente a grafia usada na data antiga.

- `rsvps/UPDATE`: atualização histórica real. Status desconhecido continua desconhecido. O último estado APP só pode completar um registro se `responded_at` coincidir exatamente com o timestamp original da auditoria.
- `GUEST_RSVP_SET`: status anterior/novo e origem administrativa registrados explicitamente. Um par com a auditoria genérica é consolidado somente quando há correspondência inequívoca de evento, pessoa, timestamp e cardinalidade.
- `ACTIVATION`: acesso/ativação efetivamente registrado, sem inferir modalidade ou identidade individual que não tenha sido gravada. O nome da unidade, quando disponível, é contexto atual, não comprovação de quem utilizou o convite.
- Usuário/RSVP excluído sem nome histórico: registro preservado, identificado como desconhecido, sem editor inválido.
- Autenticação anônima não equivale à entrada no convite. `auth.sessions` contém contexto de uma conexão, não IP/dispositivo de cada atividade; não é utilizado para completar acontecimentos antigos. `auth.audit_log_entries` estava vazio na investigação.
- `sheet_sync_jobs` mantém estado de sincronização por convidado; `mutation_receipts` mantém recibos de idempotência. Nenhum dos dois conserva uma sequência de estados RSVP. Não são usados para inventar alterações.
- Não havia registro durável de navegação ou saída voluntária. Não é possível recuperá-los retroativamente.

## Novos acontecimentos

O trigger RSVP mantém o evento genérico original, acrescentando somente metadados mínimos aos novos registros. Apenas mudanças efetivas de estado entram na lista. `PENDING` com `responded_at` continua significando resposta de dúvida, como no modelo existente; nenhuma enumeração/regra RSVP é alterada. A gravação ocorre na mesma transação, nunca a partir de um toast ou estado otimista. Pessoa afetada e operador identificado são distintos; editar outro integrante não se torna uma confirmação feita por ele.

`redeem_invitation_tracked`, restrita ao serviço, delega integralmente às funções atuais de link/PIN e nome/PIN. Não substitui sua autorização, isolamento, rate limit, sessão ou vinculação do responsável. A modalidade só é escrita após validação bem-sucedida e acompanha a sessão. Uma prévia sem sessão previamente validada não gera login. Reabertura de link já validado é registrada com idempotência por visita. A ativação original continua intacta, mas é apresentada uma única vez mediante referência explícita ao seu ID.

O observador único de navegação registra somente `/presentes`, `/ingressos`, `/como-chegar` e `/informacoes`, depois da identificação individual. Renders, snapshots, ticks, effects duplicados e PWA visibility/focus não são navegação. UUIDs de requisição são transitórios e não são identificadores de aparelho. Falha/offline não cria um evento posterior com horário falso. Saída é registrada somente no fluxo voluntário de logout, com espera limitada; fechamento de aba, suspensão e expiração não são tratados como saída.

## IP e dispositivo

Não existe serviço externo de IP, fingerprint ou coleta de Client Hints de alta entropia. O User-Agent observado no backend é reduzido a uma indicação de plataforma (iPhone/iPad/Android/Windows/macOS/Linux); modelos específicos não são inferidos. Essa indicação é descritiva, não prova de identidade; agentes genéricos ou modo desktop podem ocultar a plataforma real.

IP é opcional. No Edge, é aceito somente pela configuração de gateway já existente `TRUST_GATEWAY_IP=true` e após validação IPv4/IPv6. Esta implementação NÃO ativa essa configuração e não presume que um cabeçalho encaminhado seja confiável. `x-forwarded-for` e `x-real-ip` fornecidos ao RPC por um cliente não são aceitos como prova. A navegação e o RSVP direto não têm fonte de IP confiável demonstrada nesta arquitetura e omitem IP. Não usar IP de `auth.sessions` para atividades posteriores. Na ausência de evidência confiável, omitir é obrigatório.

## Consulta e acesso

A RPC de consulta exige ADMIN do mesmo evento. A view/schema privados não são acessíveis a anon, convidados, CEREMONIALIST ou serviço diretamente. A RLS existente de `audit_logs` permanece inalterada. Registro público aceita apenas tipo permitido e UUID de requisição; identidade, convidado, modalidade e horário são derivados no servidor. O mesmo UUID não cria outro registro; um limite de 120 eventos em cinco minutos por usuário/evento limita abuso sem bloquear funções principais.

O cursor é `(created_at, id)` descendente, com 20 itens e desempate estável. React Query controla páginas e deduplicação. Uma única subscription ADMIN ao audit store invalida a consulta com debounce; fallback visível de 30 segundos cobre desconexões. Eventos de outros módulos não provocam refetch do histórico. O editor é o próprio `GuestForm` de ADMIN > Convidados, aberto pelo ID, sem navegação para outra página. Nenhum IP ou histórico é colocado no cache offline de snapshots.

## Privacidade e operação

O Perfil atual trata de contatos/consentimentos de comunicação; isso não substitui um aviso específico para este histórico, finalidade, acesso administrativo, plataforma e eventual IP. Os administradores devem revisar o aviso de privacidade e decidir uma política de retenção aplicável. Nenhum texto foi alterado e nenhum prazo definitivo ou descarte automático foi estabelecido nesta tarefa. Os consentimentos existentes permanecem intactos.

A instalação é transacional, com lock timeout de 3 segundos e statement timeout de 30 segundos. Não há DROP, DELETE, UPDATE de dados históricos, alteração das migrations divergentes ou reescrita das RPCs existentes. A instalação insere somente cópias de evidências históricas em audit_logs, sem novos acontecimentos fictícios ou backfill/reclassificação de convidados. As demais escritas presentes nos corpos das funções são operações futuras autorizadas. A implantação segue: teste descartável → migration gerenciada → verificações somente leitura → deploy do redeem-invitation → frontend. Nunca testar com atividades fictícias de convidados reais.

## Validação

- `npm test`, `npm run test:functions`, `npm run check:functions`, lint e typecheck.
- `npx tsx scripts/test-guest-activity.ts`: upgrade, rollback, preservação de auditoria, histórico, autorização/RLS, identidade familiar, idempotência, concorrência e paginação em PostgreSQL descartável.
- `npm run test:db`: regressões SQL do projeto, incluindo o novo teste.
- Playwright `guest-activity.spec.ts`: paginação real, editor, atualização automática, navegação, saída, erros, homônimos e inspeção em 320/390/768/1280.
- Exportação web e regressões do Painel/convidados, sem testes destrutivos em produção.
