# Auditoria da migration de reversão de check-in

Arquivo revisado: `supabase/migrations/20261023115359_checkin_reversal_history.sql`.
Status: **aplicada manualmente em produção pelo responsável e confirmada por leitura** no projeto `nwgyxmwaqckpghznbfzm`, versão `20261023115359`, nome `checkin_reversal_history`. A retomada de publicação não reaplicou SQL nem alterou registros ou o histórico de migrations.

Arquivo aprovado preservado: 10.793 bytes, SHA-256 `761cd0b439207aa8d012dbbf8eb841b8378c7f6db707d4cdf1022286fd6d2df1`. Os corpos instalados das seis funções novas/substituídas correspondem ao arquivo após normalização exclusiva de CRLF/LF; as três implementações anteriores delegadas mantêm os hashes auditados. Os dois índices estão válidos e prontos. As seis funções privadas não permitem EXECUTE a anon/authenticated/service_role; as três RPCs públicas permitem authenticated e bloqueiam anon.

## Mudanças após a primeira auditoria

- `CREATE OR REPLACE TRIGGER` substitui o `DROP TRIGGER` seguido de recriação. PostgreSQL 17.11 é compatível; os triggers `touch` e `sync_sheet` permanecem existentes.
- Os REVOKE enumeram somente as seis novas funções privadas. Não há revogação sobre todo o schema, nem alteração dos privilégios das três RPCs públicas. CREATE OR REPLACE mantém seus OIDs e ACLs.
- As RPCs anteriores são copiadas para funções privadas, com o mesmo corpo. As novas wrappers interceptam exclusivamente CHECKIN_REVERT; snapshot acrescenta histórico somente para ADMIN/CEREMONIALIST. Os demais fluxos seguem a implementação anterior.
- Uma pré-condição compara os hashes dos três corpos revisados. Qualquer mudança prévia nas RPCs interrompe a instalação antes da alteração de objetos, exigindo nova análise. Não são hashes de dados pessoais nem credenciais.
- A auditoria da reversão é inserida completa: não existe UPDATE nem DELETE em audit_logs no novo script. O contexto de operação é uma configuração local à transação, confrontada com evento, ID exato do check-in, operador autenticado e receipt. O valor anterior é restaurado após DELETE. Não é armazenado no navegador ou em sessão persistente.
- A exclusão operacional mantém WHERE event_id=p_event AND id=p_id, autorização server-side por ADMIN/CEREMONIALIST do evento e o bloqueio da linha do convidado compartilhado com o registro de entrada. Retry antigo não exclui um check-in novo.

## Limites e índices

A instalação define lock_timeout=3s, statement_timeout=15s e, no PostgreSQL 17+, transaction_timeout=30s. São limites locais à transação, sem alterar configurações globais. O limite transacional pode encerrar a sessão da instalação e provocar rollback. A função privada de reversão também limita espera por locks a 3s; os limites gerais de execução dos demais RPCs não são modificados.

O índice de consulta de auditoria é parcial por entity=checkins. O índice único de reversal_mutation_id é parcial por DELETE com a chave presente, coerente com os mutation IDs globalmente únicos de mutation_receipts. Consultas por esse identificador incluem explicitamente o predicado do índice. Índices comuns podem bloquear escrita enquanto são construídos; os timeouts limitam a instalação e qualquer falha deve ser verificada antes de repetir a execução. Não há limpeza ou deduplicação automática de dados.

Antes da aplicação, consulta somente leitura confirmou PostgreSQL 17.11, migration ausente, nomes dos índices livres, nenhuma chave de reversão duplicada e hashes das RPCs iguais aos da pré-condição. Após a aplicação manual, nova consulta confirmou registro oficial, índices e permissões esperados.

## Instalação versus operação futura

A instalação cria seis funções privadas, substitui um trigger e três funções públicas, cria dois índices, restringe EXECUTE das novas funções e notifica PostgREST. Não executa remoções, alterações ou backfill de registros operacionais ou históricos.

O DELETE de public.checkins fica no corpo de revert_checkin: somente ocorre após futura chamada autorizada. Os INSERT em mutation_receipts e audit_logs também são operacionais. A reversão aciona o trigger existente de sincronização com Sheets. Não modifica convidados, famílias, RSVP, credenciais QR ou usuários. Histórico conserva registro original, nome, método, operador e horário; o mesmo QR pode registrar nova entrada conforme as regras normais.

CREATE OR REPLACE ainda altera comportamento e pode justificar revisão de segurança. SECURITY DEFINER e DELETE dentro do corpo da função também podem ser sinalizados por análise estática. Não foi chamado apply_migration para testar o alerta, pois isso exigiria nova autorização de escrita. Não se afirma que o alerta desapareceu e nenhum mecanismo de segurança foi contornado ou desabilitado.

## Evidências de testes locais

`npx tsx scripts/test-ceremonial.ts` inclui upgrade sobre base anterior com dados existentes e verifica:

- instalação sem mudanças no conteúdo de convidados, famílias/unidades, RSVPs, check-ins, QR, usuários, roles, receipts, auditoria e filas existentes;
- preservação de OIDs e ACLs das RPCs, corpos das implementações delegadas e privilégio de uma função privada não relacionada;
- ausência de EXECUTE para clientes nas seis novas funções privadas;
- rollback completo se a baseline da RPC divergir, se houver chave duplicada no índice ou se outra conexão bloquear o trigger;
- reversão funcionando com um trigger de teste que proíbe qualquer UPDATE na auditoria;
- autorização ADMIN/CEREMONIALIST, bloqueio de GUEST, isolamento de evento, QR original, RSVP e histórico preservados;
- conexões independentes para QR/manual, remoção/remoção, remoção/registro e retry antigo após nova entrada.

Resultados desta revisão:

| Verificação | Resultado |
| --- | --- |
| `npm run test:db` | Aprovado, incluindo SQL/RLS, upgrade, auditoria e concorrência |
| `npm test` | 351 testes aprovados |
| `npm run lint` | Aprovado |
| `npm run typecheck` | Aprovado |
| `npm run check:functions` / `npm run test:functions` | Tipos aprovados e 59 testes aprovados |
| `npm run build:web` / `npm run test:export` | Aprovados; assets, rotas, cache privado, offline e PWA nativa preservados |
| Playwright completo: `npm run test:e2e` | 260 testes aprovados, incluindo os 13 de portal/workflows |

A prévia de câmera foi novamente medida em 336 × 280 px, com vídeo 640 × 480, readyState=4 e paused=false. Câmera simulada não certifica aparelhos físicos Android/iOS ou uma PWA instalada em aparelho real.

## Conclusão e riscos residuais

A versão revisada elimina DROP TRIGGER, revogação abrangente e atualização posterior de auditoria. O script é incremental e transacional, sem exclusão de dados durante a instalação. Permanecem riscos controlados de bloqueio temporário, alteração de comportamento das RPCs e exclusão intencional de uma entrada quando um operador futuramente confirmar a reversão. Mudanças em produção, índices conflitantes, duplicidades ou limites de tempo devem interromper a instalação, sem correção automática de dados.

A aplicação foi concluída pelo responsável e registrada oficialmente. A retomada não executou apply_migration, db push, migration repair, include-all nem reparos nas divergências históricas. A leitura pós-aplicação encontrou 73 convidados, 93 unidades, 73 RSVPs e uma entrada ativa; zero entradas órfãs, duplicidades de entrada ativa ou chaves de reversão duplicadas. Os 1.665 registros de auditoria incluem uma entrada original de check-in e nenhuma remoção real. Não foram criados nem removidos dados operacionais para testar. Testes de reversão usam exclusivamente bancos descartáveis.

A revisão de segurança mantém RLS e o acesso por evento/role. Os advisories atuais incluem avisos sobre RPCs SECURITY DEFINER, políticas de sessões anônimas, tabelas privadas sem políticas e proteção contra senhas vazadas desabilitada; esses avisos não são eliminados por esta entrega. A validação física de câmera e o acesso autenticado no domínio publicado dependem de aparelho e credenciais autorizadas.

Referências dos avisos de segurança: [RPCs SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) e [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). O acesso anônimo autorizado a convidados deve ser distinguido de acesso irrestrito; os testes validam o escopo por sessão, evento e role.
