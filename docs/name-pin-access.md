# Login por nome do convidado + senha da unidade

O fluxo público usa `name_pin`; `/c/{codigo}` continua usando código + PIN. O antigo
`action: password` é rejeitado pela Function e a RPC correspondente perde o grant de
`service_role`. Não existe consulta pública de nomes nem retorno de candidatos.

## Resolução e normalização

`guests` continua sendo a fonte canônica. Qualquer membro atual identifica sua
`invitation_id` usando a senha DA UNIDADE, não necessariamente o sufixo do seu próprio
telefone. `primary_guest_id` e as invariantes de criação individual permanecem iguais.
A criação, os movimentos e a edição continuam pelas ações administrativas existentes.

A migration `20261013204105_name_pin_access.sql` cria `name_pin_private` e um índice
privado de HMACs de evento, nome normalizado e PIN. Chave aleatória de 32 bytes,
separação de finalidade e ACL/RLS impedem leitura pelas funções/roles públicas.
O índice deduplica aliases equivalentes da mesma unidade. Combinações que apontam
para mais de uma unidade ficam bloqueadas para todos os envolvidos, preservando
link/PIN legado. O snapshot ADMIN informa `name_login_conflict`; a administração
pode corrigir a combinação com a ação PIN_SAVE existente. Não há vencedor automático.

A normalização v1 é NFKC, política explícita de espaços Unicode, trim e redução de
espaços, `unaccent` com dictionary qualificado e uppercase ICU root (`und`).
Controles, formatos invisíveis definidos e variation selectors são rejeitados.
Não há fuzzy matching, nomes parciais ou alteração de `guests.name`.
A caixa alta no input é somente apresentação; a RPC refaz a normalização.
Atualizar ICU/dicionário ou a regra exige reconstrução controlada dos aliases.

## Credenciais e concorrência

PINs existentes não são alterados. Novos acessos preferem o sufixo de telefone;
sem telefone válido recebem PIN numérico aleatório. O PIN pode se repetir entre
nomes diferentes. Um homônimo com o mesmo PIN precisa de senha alternativa.
Editar telefone não altera silenciosamente uma credencial já comunicada.

Os triggers sincronizam nomes, membros, credenciais e elegibilidade. A RPC compartilha
o advisory lock por evento de admin_action, revalida a fonte antes de vincular e
serializa trocas de unidade. Escritas privilegiadas diretas podem ter deadlocks
transacionais; nunca devem ignorar erros ou desativar triggers. Use ações canônicas.

O backfill indexa fontes elegíveis sem reescrever dados funcionais. O teste de upgrade
compara todas as linhas públicas antes/depois e verifica o índice e permissões.
A migration aceita o baseline 001–007/008 e o baseline 001–009: as estruturas da
modalidade abandonada são retiradas somente se existirem. Ambos os upgrades são testados.
Não editar nem marcar migrations históricas como aplicadas sem verificar equivalência.

Rate limit atômico: 15 por UID e nome / 15 minutos, 30 por origem confiável / 15 minutos,
200 por evento / 15 minutos e 1000 por evento / dia. Tentativas rejeitadas também contam.
Sem origem confiável, permanecem os limites por UID, nome e evento; não se confia num
cabeçalho fornecido pelo cliente. O PIN e nomes conhecidos continuam previsíveis:
esses limites reduzem brute force, mas não transformam quatro dígitos em credencial forte.
Proteção adicional contra bots/CAPTCHA deve ser configurada na infraestrutura de Auth/borda.
Nenhum log da implementação registra corpo, nome, PIN, telefone, código ou JWT.

## Conclusão do login

As duas modalidades retornam `{ linked: true, invitation_id }` apenas após validação.
O identificador autorizado permite verificar o alvo do snapshot e detectar uma troca
concorrente da mesma sessão. Nenhuma credencial/código de compartilhamento é retornada.

O AppProvider impede novas sincronizações, espera a operação em andamento, limpa fila,
caches/tickets/identidade anteriores e carrega o snapshot autoritativo. Exige evento,
role GUEST e unidade iguais ao alvo retornado. O frontend navega explicitamente para
/inicio; não usa “Alteração salva.”. Falha após vínculo oferece nova tentativa somente
de carregamento; snapshots incompatíveis não liberam a tela do convidado.

## Compatibilidade durante a atualização

A Function já implantada pode retornar somente `{ linked: true }`, e seu snapshot
não conter `current_invitation_id`. Somente o fluxo /c/{codigo} aceita esse contrato:
exige snapshot GUEST de uma unidade, confirma novamente `identify_invitation` com o
código já fornecido, ativação da mesma sessão e nome da unidade. Esse caminho é
coberto por teste E2E com o contrato antigo. O login por nome nunca usa esse fallback;
ele exige o identificador exato retornado pelo novo backend. Telas públicas ocultas
não podem disparar redirecionamentos de outra rota.

## Aplicação futura em produção — NÃO executada nesta tarefa

1. Inspecionar o histórico real e comparar o baseline. Se a 009 ainda estiver pendente,
   ela foi substituída funcionalmente por esta entrega: não executar automaticamente
   `db push` que a instale antes/depois da nova migration. Preparar aplicação controlada
   da nova migration e conciliação do histórico sem declarar SQL não executado como aplicado.
2. Configurar `APP_EVENT_ID` no backend com o mesmo evento de `EXPO_PUBLIC_EVENT_ID`
   já fornecido pelo workflow canônico. Não há UUID de fallback no cliente/Function.
3. Aplicar a migration incremental em operação de banco separadamente autorizada.
4. Implantar a versão atualizada de `redeem-invitation`, após disponibilizar as RPCs.
5. Habilitar `TRUST_GATEWAY_IP=true` somente se x-real-ip for sobrescrito pelo gateway;
   caso contrário manter false/ausente. Validar a infraestrutura de proteção contra bots.
6. Validar nome + PIN, links legados e snapshot no ambiente hospedado.

O pipeline de publicação frontend da main foi mantido. Publicar código frontend não
aplica schema nem atualiza a Function no Supabase; o novo login depende dos passos acima.
Nenhuma configuração remota, migration ou deploy de Function foi executado nesta tarefa.

## Favicon

Expo `web.favicon` aponta para `assets/aliancas-felipe-e-lais.png`, asset já existente
na main. O export gera ICO 16/32/48 preservando proporção. O favicon entra no precache
com hash de conteúdo, e o teste de export verifica sua referência e estrutura.
Os ícones nativos e demais assets de branding não são alterados.

## Validação local desta entrega

Lint, typecheck, 210 testes unitários, 55 testes de Functions, suíte DB completa
(incluindo upgrade/backfill nos baselines 007, 008 e 009 e conexões concorrentes),
84 E2E da suíte completa, 28 testes de autenticação reexecutados (incluindo um novo
caso de contrato legado), build web e teste de export passaram. O teste afetado pelo ajuste do atalho
de cadastro foi repetido após a correção final e passou. Não houve comunicação real
ou execução de SQL/deploy de Functions no Supabase remoto.

## Arquivos desta entrega

- `.env.example`
- `app.config.ts`
- `docs/name-pin-access.md`
- `playwright.config.ts`
- `scripts/test-db.sh`
- `scripts/test-export.mjs`
- `scripts/test-password-db.sh`
- `scripts/test-profile-db.sh`
- `scripts/web-assets.mjs`
- `src/features/auth/PublicScreens.tsx`
- `src/features/auth/entry.ts`
- `src/features/auth/useInvitationEntry.ts`
- `src/features/guests/AdminGuests.tsx`
- `src/features/invitations/AccessControls.tsx`
- `src/lib/AppProvider.tsx`
- `src/lib/supabase.ts`
- `src/repositories/api.ts`
- `src/storage/queue.ts`
- `src/types/domain.ts`
- `supabase/functions/_shared/cors.test.ts`
- `supabase/functions/redeem-invitation/handler.test.ts`
- `supabase/functions/redeem-invitation/handler.ts`
- `supabase/functions/redeem-invitation/index.ts`
- `supabase/migrations/20261013204105_name_pin_access.sql`
- `tests/access-errors.test.ts`
- `tests/e2e/access-stabilization.spec.ts`
- `tests/e2e/database-admin.spec.ts`
- `tests/e2e/public-home.spec.ts`
- `tests/e2e/staff-and-pin.spec.ts`
- `tests/entry.test.ts`
- `tests/event-config.test.ts`
- `tests/name-backfill-prepare.sql`
- `tests/name-backfill-verify.sql`
- `tests/name-normalization.sql`
- `tests/name-pin-access.sql`
- `tests/name-pin-concurrency.py`
- `tests/support/edge-fixture.ts`
