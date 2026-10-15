# Confirmação cadastral no primeiro acesso

## Estado da entrega

Implementação na main, com migration **preparada, não aplicada no Supabase PROD**. Não houve deploy de Edge, alteração de secret ou ajuste remoto de dados/permissões. O frontend só ativa a experiência quando o snapshot do backend entrega `profile_confirmation.supported=true`. Backend antigo continua navegável, sem loop nem tentativa de chamar uma operação inexistente.

## Auditoria e identidade

Os dois acessos passam por `repositories/api.invitationAccess` e `redeem-invitation`: nome/PIN usa `redeem_invitation_by_name`; link usa `redeem_invitation_link` (com compatibilidade de resposta legada). AppProvider termina o acesso carregando/validando snapshot, papel GUEST, evento e unidade antes de liberar as rotas. Não foi alterada essa autenticação.

`invitation_sessions` vincula o UID anônimo à unidade. **Nome digitado, primary_guest_id, primeiro membro da lista e a escolha local antiga do Perfil não constituem identidade individual autenticada.** Os dados são `guests.name` e `guest_contacts.email/whatsapp`. O Perfil usa CONTACT_UPDATE, máscara brasileira e revogação global com preservação de canais. Não havia marcador de confirmação inicial.

Agora:

- Se a unidade tem exatamente um membro autorizado, esse é o único alvo possível.
- Em unidade com vários membros, abre primeiro “Quem está usando este convite?”. Não mostra o formulário de contato antes da escolha. A seleção aceita somente membros da unidade e é persistida em `invitation_sessions.profile_guest_id` pela operação PROFILE_IDENTIFY.
- A escolha é uma **declaração dentro do acesso familiar autorizado**, não uma alegação de autenticação individual ou verificação de posse de e-mail/WhatsApp. Mantém a autorização familiar que o Perfil já possuía, com alvo explícito.
- A sessão guarda a escolha, mas a confirmação fica em `guests.profile_confirmed_at`. Outro UID/dispositivo da mesma pessoa consulta o mesmo marcador. Famílias em uma **nova sessão sem escolha** precisam se identificar novamente; escolher alguém já confirmado não reabre o formulário cadastral. Não é seguro presumir que todos os membros foram confirmados por uma única pessoa.
- Troca de unidade, arquivamento, movimentação ou exclusão não transfere identidade: o servidor revalida papel, evento, sessão, unidade ativa e vínculo atual. Um ponteiro que não corresponda à unidade atual é ignorado pelo snapshot. A FK composta limpa somente o ponteiro se o membro for excluído.

A tela Perfil usa a seleção do backend quando disponível. O cache local anterior permanece somente como compatibilidade para backend antigo e não é usado como identidade pela confirmação nova.

## Persistência e integração

Migration: `supabase/migrations/20261015033043_profile_confirmation.sql`, criada pela CLI Supabase. Não modifica migrations históricas nem cria cadastro/tabela independente. Acrescenta:

1. `guests.profile_confirmed_at timestamptz NULL` — todos os registros antigos continuam pendentes, independentemente de logins anteriores.
2. `invitation_sessions.profile_guest_id uuid NULL` e FK `(event_id,profile_guest_id) → guests(event_id,id) ON DELETE SET NULL (profile_guest_id)`.

As funções públicas **não são substituídas nem renomeadas**. A extensão ocorre nos OIDs existentes de `internal_mutation_core` e `internal_snapshot_core`. Cópias integrais e privadas das implementações antigas são preservadas em `profile_confirmation_mutation_core` e `profile_confirmation_snapshot_core`, com EXECUTE revogado de PUBLIC/anon/authenticated/service_role. O gate exige baseline de perfil/consentimento real, fontes revisadas, owner, search_path, retorno e ACL conhecidos.

O RPC continua sendo `app_mutate`. PROFILE_IDENTIFY e PROFILE_CONFIRM atravessam os wrappers existentes até a camada de Perfil. Toda outra operação delega ao código original: CONTACT_UPDATE, RSVP, mensagens, presentes, QR etc. A nova operação é necessária para gravar nome, contatos e confirmação **atomicamente**; CONTACT_UPDATE isolado não atualiza nome nem marca conclusão e duas chamadas separadas produziriam sucesso parcial.

PROFILE_CONFIRM usa o receipt canônico `(event_id,user_id,mutation_id)`, lock de evento da edição de convidados, sessão/membro/contato protegidos, versão do convidado e timestamp do contato capturados ao abrir o formulário. Atualiza apenas nome, email/WhatsApp e marcador; incrementa versões e mantém o nome da unidade INDIVIDUAL coerente com o mecanismo canônico. Não troca IDs, PIN, code_hash, sharing_code, vínculo, RSVP ou QR. Corrigir nome atualiza os aliases de login pelos triggers já existentes; o PIN não é recalculado a partir do telefone corrigido. Quando o índice nome/PIN existe, uma correção que criaria ambiguidade com outra unidade é rejeitada atomicamente, com orientação genérica para conferir os dados ou buscar ajuda. Não se revela o outro convidado.

Os cinco campos de consentimento e seu timestamp existente não são escritos pela confirmação. Um contato ausente usa os defaults já existentes (IN_APP efetivo true, canais externos false, revogação false); não há opt-in externo. Consentimentos enviados indevidamente no payload de confirmação são rejeitados. Jobs/providers e Auth email não são alterados. Os triggers canônicos de auditoria/Sheets continuam sendo usados; o audit específico registra somente ator/evento/ID/ação, não os dados digitados.

Retry mantém UUID em memória enquanto o payload é o mesmo. Resposta perdida depois do COMMIT é recuperável pelo receipt, sem duplicar gravação/auditoria. Uma confirmação já concluída não sobrescreve dados em tentativas tardias; em concorrência o primeiro COMMIT prevalece. Alteração concorrente antes da confirmação provoca conflito e exige recarregar, preservando o rascunho para conferência. Editar Perfil posteriormente não limpa o marcador.

## Fluxo e UX

O gate fica no layout acima das rotas, depois das superfícies flutuantes. Só monta após role GUEST e capability real, de qualquer rota/método de entrada. Não expõe contatos na página pública.

Modal existente `AdminModal`, com opções isoladas de largura 520, sem X e sem dismiss por Escape/backdrop. Abertura de 300 ms e fechamento de 200 ms na web, opacidade/escala/translação sutis; reduced motion remove animações. Paleta e estilos compartilhados intactos. Scroll interno, foco preso ao diálogo e safe areas do sistema de modais permanecem. Em telas estreitas ou com teclado pode ser necessário rolar o conteúdo para alcançar todas as ações.

Nome completo, WhatsApp e E-mail são pré-preenchidos. Nome é NFC, espaços normalizados, obrigatório, até 200 caracteres, sem contagem artificial de palavras. WhatsApp reutiliza máscara `(62) 9 9999-9999`, valida celular brasileiro com DDD (11 dígitos), aceita/preserva DDI 55 legado (13 dígitos) e persiste somente dígitos. E-mail é obrigatório, trim, até 320 caracteres, formato e limites local/domínio verificados no cliente/servidor. Não se faz verificação de posse por OTP.

Confirmar valida com erros associados aos campos, trava duplo envio e aguarda RPC **e snapshot recarregado** com status persistido. Não existe confirmação otimista nem mensagem genérica “Alteração salva”. Rascunhos e UUID de retry ficam somente em memória: sem conexão, mostra pendência e não confirma nem enfileira dados pessoais novos. Reload antes da confirmação recarrega os dados do servidor; rascunho não enviado não é prometido como salvo.

Uma alteração CONTACT_UPDATE da mesma pessoa que já esteja na fila antiga deve sincronizar antes da confirmação para não sobrescrever dados fora de ordem. O modal oferece sincronização e recarga. Fila alheia não é descartada silenciosamente. Sair com pendências exige confirmação de descarte; sem pendências, encerra a sessão e remove os caches pelo fluxo existente. O epoch cancela respostas antigas após logout. Ajuda inline orienta falar com os noivos pelo contato do convite; não inventa telefone ou e-mail. Essas saídas não marcam confirmação.

## Compatibilidade com mensagens e demais migrations

O suporte é um objeto próprio `profile_confirmation` no snapshot, para não disputar o objeto `capabilities` que mensagens v2 substitui. As duas ordens de instalação são suportadas:

- mensagens antes da confirmação: sequência normal da main;
- confirmação antes de mensagens: instalador manual de mensagens preserva os novos cores.

Foram adaptados **somente os gates** de `scripts/messaging-prod/{preflight-readonly,install}.sql`: reconhecem as fontes exatas dos wrappers de confirmação e conferem as implementações originais preservadas e privadas. O payload de mensagens continua byte a byte idêntico à migration original, com o mesmo SHA256. O harness de compatibilidade ganhou um terceiro baseline para provar isso. Não basta achar os nomes das funções; fonte desconhecida continua causando STOP.

Não executar db push remoto: os timestamps históricos de PROD ainda requerem reconciliação própria. Esta atualização não marca versões históricas como aplicadas.

## Procedimento manual posterior

1. Confirmar projeto PROD `nwgyxmwaqckpghznbfzm`, main/SHA aprovado, backup e restauração em cópia isolada. Não usar develop, seed ou dados de teste.
2. Executar **somente leitura** `scripts/profile-confirmation-preflight.sql` imediatamente antes da janela. Ele confere o mesmo gate de baseline da migration, mais RLS/policies/roles e mostra ledger/hashes. STOP se já houver coluna/core/versão parcial, baseline sem perfil/consentimento, fonte/ACL/owner desconhecido ou escrita direta permitida por policy.
3. Executar **integralmente**, no SQL Editor postgres e com autorização, `supabase/migrations/20261015033043_profile_confirmation.sql`. É uma transação com lock_timeout 5 s. Não aplicar nomes/PIN/perfil antigos de novo. Locks podem bloquear gravações por pouco tempo; em timeout ou erro, a transação deve ser totalmente revertida e a causa investigada.
4. Executar `scripts/profile-confirmation-postflight.sql` (READ ONLY). Conferir colunas, FK, fontes exatas, owner/search_path, cores privados e RLS.
5. Depois de comprovar a instalação desse arquivo, executar `scripts/profile-confirmation-register.sql`, que repete o postflight e registra **somente esta versão recém-instalada** com checksum. Não é um reparo retroativo do ledger divergente. Se já houver versão com nome diferente, interromper. Não aplicar a migration de novo por cima.
6. Testar com ADMIN e unidade legítima de teste autorizada: ambos os acessos, identificação familiar, confirmação, reload, outro dispositivo, Perfil e consentimentos, além de tentativa de outra unidade. SQL Editor postgres não é prova de autorização de usuários reais. Não testar alterando dados de convidados reais sem autorização.

Nenhum desses passos remotos foi executado nesta tarefa. Publicar frontend não autoriza aplicar o SQL. Antes da migration, o gate fica inativo.

### Contingência

Falha antes do COMMIT: não deixar DDL parcial nem repetir fragmentos. Após instalação, preferir correção incremental ou pausa revisada da experiência, preservando os dados/status/receipts/auditoria. **Não apagar colunas, reverter timestamps de confirmação, restaurar dados antigos nem voltar o snapshot público inteiro a uma versão anterior**, pois isso também poderia perder filtros de mensagens ou consentimento. Se for preciso pausar, uma alteração específica e autorizada deve fazer o suporte retornar false e bloquear apenas as duas operações novas, delegando as demais aos cores preservados; nenhuma pausa remota está autorizada por esta entrega.

## Testes e limites

A matriz SQL cobre valores inválidos, normalização, DDI, versão/timestamp concorrentes, recibos, papéis, isolamento familiar, status por convidado, consentimentos, PIN/código, RSVP, alteração posterior do Perfil e sessão diferente. Upgrade isolado começa com convidado e login existentes: nenhum é marcado automaticamente; OIDs/corpos públicos e funções de autenticação permanecem iguais. Os testes de navegador usam Auth/transporte controlados e **RPCs/PostgreSQL/RLS reais**.

A suíte nova cobre cinco larguras, entrada por nome/PIN e por link, reload antes/depois, correção no Perfil, outro navegador/UID, logout/login, standalone simulado, campos inválidos, erro backend, offline, duplo clique, resposta perdida, seleção familiar e concorrência em duas conexões. Os testes antigos de login/CRUD usam explicitamente o backend anterior à confirmação para validar compatibilidade durante rollout; a suíte nova usa a main completa. Fixtures não marcam todos os convidados como confirmados para ocultar o gate.

Não houve teste em aparelho físico/iOS/Safari nem confirmação funcional em PROD. Standalone é simulado no Chromium; a exportação verifica separadamente assets/worker e a instalabilidade nativa. Não se promete entrega de canais externos apenas pela confirmação cadastral.

## Resultado de validação desta entrega

- 316 testes unitários aprovados (25 arquivos).
- Matriz PostgreSQL completa e upgrade isolado aprovados; instalação manual de mensagens aprovada nos três baselines (perfil, nome/PIN, confirmação).
- Suíte E2E completa: 187/189 passaram na execução final ampla; os dois cenários restantes passaram em reexecução direcionada. O caso novo de fila exigiu corrigir a fixture: o login já limpa a fila por comportamento anterior, portanto a pendência deve ser criada após o login e recuperada por reload. O atalho administrativo passou sem alteração de produto.
- Os 14 cenários novos passaram juntos na execução final direcionada (1,3 min), incluindo fila pendente, concorrência e resposta perdida.
- Lint, TypeScript, build e exportação web aprovados. Exportação com Chromium não anônimo: captura PWA registrada em 42,5 ms, evento nativo em 825,9 ms, React conectado em 1119 ms, defaultPrevented=true e nenhum erro de instalabilidade.
- Inspeção visual das capturas finais em 320, 375, 390, 768 e 1280 px; sem teste de aparelho físico.
- Nenhuma migration, escrita remota de banco ou implantação manual de Edge Functions em PROD.

## Inventário de arquivos desta entrega

- `docs/profile-confirmation.md`
- `scripts/profile-confirmation-postflight.sql`
- `scripts/profile-confirmation-preflight.sql`
- `scripts/profile-confirmation-register.sql`
- `scripts/test-profile-confirmation.ts`
- `src/features/guests/ProfileConfirmationGate.tsx`
- `src/features/guests/profileConfirmation.ts`
- `supabase/migrations/20261015033043_profile_confirmation.sql`
- `tests/e2e/profile-confirmation.spec.ts`
- `tests/profile-confirmation-upgrade-verify.sql`
- `tests/profile-confirmation-upgrade.sql`
- `tests/profile-confirmation.sql`
- `tests/profile-confirmation.test.ts`
- `app/_layout.tsx`
- `docs/messaging-production-compatibility.md`
- `playwright.config.ts`
- `scripts/messaging-prod/install.sql`
- `scripts/messaging-prod/preflight-readonly.sql`
- `scripts/test-db.sh`
- `scripts/test-messaging-prod.sh`
- `src/components/AdminModal.tsx`
- `src/features/guests/ProfileScreen.tsx`
- `src/lib/AppProvider.tsx`
- `src/lib/errors.ts`
- `src/repositories/api.ts`
- `src/types/domain.ts`
- `tests/e2e/access-stabilization.spec.ts`
- `tests/e2e/database-admin.spec.ts`
- `tests/support/postgres.ts`
