# Auditoria preventiva da migration 008 — PR #32

## Escopo e correções

A auditoria usa exclusivamente bancos descartáveis. Não consulta nem copia dados
reais, não aplica migrations em produção e não envia notificações reais.
As migrations 001–007 permanecem intactas.

A 008 preserva `EXECUTE` de `authenticated` e `service_role` nas assinaturas
`app_mutate(uuid,uuid,text,jsonb)` e `app_snapshot(uuid)`, conforme o ACL de
produção confirmado pelo responsável. Não concede execução a `anon` ou PUBLIC.
As implementações internas versionadas continuam inacessíveis aos três papéis.
O grant de service_role não elimina `event_role`, `auth.uid()` ou a autorização:
o teste executa ambas as RPCs nesse papel e rejeita mutação sem identidade válida.

A política `announcement_read` usa `can_receive_announcements`, a mesma regra
usada pelo snapshot: ao menos um integrante acessível precisa de IN_APP autorizado
e não estar globalmente revogado. Outro acesso com consentimento não libera esta
unidade. A política administrativa separada permanece intacta. Os testes consultam
`announcements` diretamente com `SET ROLE authenticated` e identidade de convidado,
além da RPC, incluindo acesso individual, família parcialmente/totalmente revogada,
reativação e IN_APP não autorizado.

## Upgrade real 007 → 008

`scripts/test-db.sh` mantém a instalação limpa e cria **outro banco**, exclusivo
para o upgrade. Aplica 001–007, configura somente os grants de produção informados,
e executa `tests/profile-upgrade-prepare.sql`. Depois aplica **somente 008** e
executa `tests/profile-upgrade-verify.sql`. O cleanup elimina os bancos/container
mesmo após erro. Localmente usa PostgreSQL 17; Actions usa o PostgreSQL do runner.

O fixture contém ADMIN, sessões anônimas FAMILY/INDIVIDUAL, integrantes, links
emitidos explicitamente, PIN com zero inicial, contatos legados com autorizações
mistas, RSVP confirmado, QR já emitido, token push, mensagem administrativa de
quatro canais, recipients, announcement, jobs, tentativa de entrega, receipt com
ID da mensagem e operação de convite pendente. São dados sintéticos.

Antes de qualquer ação pós-upgrade, compara **todos os registros de todas as
tabelas públicas com `event_id`** desse evento, inclusive timestamps, versões,
credenciais, histórico e fila. A única diferença aceita é o novo booleano de
contato, que deve ser false. Também compara os snapshots dos três atores,
removendo somente esse campo novo para a comparação do contrato anterior.

Captura antes da 008 e compara depois: nomes/tipos dos parâmetros, retorno,
SECURITY DEFINER, search_path e EXECUTE de anon/authenticated/service_role.
Compara OID, assinatura e corpo da implementação renomeada; verifica que nenhum
`app_mutate_vN` ou `app_snapshot_vN` é executável por esses papéis, nem os novos
wrappers por PUBLIC. Essas verificações falhariam com o grant anterior da 008.

## Wrappers e encaminhamento

A implementação de mutação preservada como v7 encaminha operações legadas para
v4; o snapshot v7 encaminha para v5 e este para v4. Nenhuma implementação salva
volta a chamar o novo nome público. Os corpos preservados são comparados no
catálogo e as chamadas reais demonstram o encaminhamento, sem recursão.

A 008 intercepta exclusivamente CONTACT_UPDATE/PUSH_REGISTER; os demais tipos
continuam no código anterior. O snapshot mantém o resultado anterior e restringe
somente announcements quando não há autorização. O filtro de mensagens existente
passa a considerar o bloqueio global. Não foi necessário substituir a estratégia
de wrappers. A migration deve ser aplicada uma única vez, com o mecanismo normal
de controle de versões; os nomes v7 não são APIs públicas.

## Matriz de evidências executáveis

| Requisito | Evidência |
| --- | --- |
| Integridade anterior | Comparação de todas as linhas do evento antes/depois da 008, inclusive consentimentos, receipts, pending e outbox |
| ADMIN/painel/RPCs | Snapshot igual antes/depois; papel ADMIN; criação/edição de família e convidado por admin_action; testes E2E administrativos existentes |
| Acesso individual/familiar | Sessões prévias preservadas; redeem_invitation real com link/PIN antigo; PIN errado rejeitado; isolamento no snapshot sem identify_guest |
| RSVP | RPC real percorre CONFIRMED/DECLINED/PENDING e edita a mesma linha com responded_at; enum exatamente PENDING/CONFIRMED/DECLINED |
| QR/link/PIN | Hash anterior preservado; issue_ticket real gera nova credencial; nenhuma CODE_ROTATE adicional; links e PINs inalterados |
| QR na interface | E2E auth com PostgreSQL real: SVG apresentado, reload preserva hash e link; bridge de teste executa issue_ticket real |
| Mensagem/recipients/jobs | Preservação integral anterior; retry mantém ID sem duplicação; novo envio real e leitura sob papel do destinatário |
| RLS avisos/mensagens | tests/profile-consent.sql e cenário familiar preexistente no upgrade: leitura direta e snapshot coerentes, revogação/reativação/admin |
| Perfil/WhatsApp | CONTACT_UPDATE real normaliza número; consentimentos mistos preservados na revogação/reativação |
| Offline/idempotência | Replay SQL com mesmo mutation ID após reativação não reaplica revogação; E2E real offline/reconexão/reload/novo navegador persiste exatamente duas operações |
| Quatro canais | Testes da Function executam o handler com providers simulados: bloqueio global impede todos; reativação respeita autorizações anteriores; banco real cobre persistência/gate/RLS/push |

## Resultados locais desta auditoria

- `npm run lint` e `npm run typecheck`: aprovados.
- `npm test`: 163 testes aprovados em 13 arquivos.
- `npm run check:functions`: aprovado; `npm run test:functions`: 46 aprovados.
- `npm run test:db`: aprovado, incluindo instalação limpa, upgrade exclusivo
  007 → 008, RLS direto e baseline histórico isolado.
- `npm run test:e2e`: 69 aprovados, incluindo o novo cenário PostgreSQL/Perfil/QR.
- `npm run build:web` e `npm run test:export`: aprovados na raiz e no base path
  `/convite-felipe-e-lais`, incluindo PWA/offline/404 e viewport 390×844.
- `npx expo export --platform android` e `--platform ios`: aprovados.

O check `Validate platform / application` repete a validação Web/SQL/Functions/
E2E no novo commit do PR. Seu resultado deve ser conferido no GitHub; o relatório
final identifica o run aprovado. Exports nativos locais não são testes em aparelhos.

## Limitações e publicação

O cenário representa o schema versionado e os privilégios informados, **não é
um dump de produção**. Alterações manuais desconhecidas em produção não são
validadas por esses fixtures. O bridge E2E executa SQL real como authenticated,
mas usa autenticação HTTP sintética: não certifica GoTrue, cache PostgREST ou
credenciais reais de produção. Não houve teste de entrega por Resend/WhatsApp/
serviço push, nem permissões nativas em aparelho físico; providers externos são
simulados deliberadamente. Não se considera entrega real validada.

O bloqueio offline passa a valer no servidor quando a fila sincroniza. Um envio
já aceito externamente não pode ser desfeito. Convites de acesso continuam sendo
um fluxo distinto de comunicações opcionais, conforme o contrato anterior.

Quando houver autorização específica para produção: aplicar 008 e publicar
`dispatch-notifications` antes do frontend (o merge na main aciona Pages).
Não é necessário alterar outras Functions, secrets ou migrations anteriores.
Esta auditoria não executa essas etapas nem autoriza merge.
