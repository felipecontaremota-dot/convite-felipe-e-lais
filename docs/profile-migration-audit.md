# Validação local da reconstrução da 008

A migration preserva por renomeação os corpos e OIDs dos contratos anteriores
como `internal_mutation_core` e `internal_snapshot_core`. Não cria aliases v7.
O preflight compara as assinaturas, owner e fingerprints dos corpos esperados
no baseline versionado; divergência ou reaplicação aborta a transação.

A regra efetiva de canal vive em `internal_can_receive_communication`. Só funções
autorizadoras expostas podem utilizá-la. O predicado privado é SECURITY INVOKER;
herda o contexto do autorizador e não precisa de elevação própria. Snapshot/RLS compartilham as mesmas
regras; mensagens próprias não são ocultadas pela revogação de comunicações.

`tests/profile-upgrade-prepare.sql` modela exclusivamente a diferença confirmada
na ACL de app_mutate/app_snapshot. `tests/profile-upgrade-verify.sql` compara todos
os campos anteriores de todas as tabelas do evento, incluindo credenciais,
sessões, RSVP, receipts, histórico e fila. Só admite os novos campos estruturais:
revogação false e marcador de início de entrega null. Compara corpos/OIDs dos
núcleos preservados e assinaturas/ACLs públicas.

`scripts/test-profile-db.sh` constrói separadamente 001–007 → 008 e
001–007 → fixture de produção → 008, sem a 009. Compara os catálogos finais de
funções, corpos, owners, search_path, privilégios efetivos, RLS, policies e novas
colunas. `tests/profile-dispatch.sql` cobre leases, canal/evento, revogação,
reativação, resultado incerto e APIs internas privadas.

`tests/profile-concurrency.py` usa conexões PostgreSQL independentes, com barreira
observada em pg_stat_activity: revogação antes da admissão, admissão antes da
revogação, dois dispatchers na mesma lease, replay concorrente de receipt e lease
admitida expirada. Os bancos são descartáveis; nenhum provider real é chamado.

O job guarda `delivery_started_at` para impedir nova tentativa depois de uma
chamada admitida com resultado perdido. A finalização também exige o identificador de admissão para um worker em
preparação não limpar a tentativa já iniciada por outro. O status uncertain não é selecionado
pelas funções de claim. Um envio admitido antes da revogação pode terminar.

A suíte geral continua exercitando a 009 preexistente, sem modificá-la. Os testes
isolados específicos da 008 não a aplicam. Não há validação de gateway Supabase,
credenciais reais, permissões nativas em aparelho ou entregas reais a providers.

Nenhuma publicação é autorizada por estes testes. Antes de produção: conferir
baseline material/fingerprints, aprovar SQL e rollback, validar dependências e
publicar somente dispatch-notifications após o SQL. A divergência do histórico
remoto permanece uma tarefa separada; não utilizar db push/repair automaticamente.

Validação local concluída: lint/typecheck, 189 unitários, 50 testes de Functions,
82 E2E, banco completo e comparação clean/upgrade aprovados; Web/export/PWA e
exports Android/iOS aprovados. Exports não certificam permissões nativas em
aparelhos. Providers reais não foram acionados.

Na ativação futura, impedir a coexistência de workers antigos e novos: suspender
novos dispatches, aguardar instâncias anteriores e auditar jobs antigos com
resultado incerto antes de retomar. O código antigo não usa a admissão SQL.
Esses passos exigem autorização específica; não foram executados.
