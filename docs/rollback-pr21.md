# Rollback funcional para o PR #21

Base restaurada: `919382d988c1b8cb06130f0da3813db7a841ebd1`.
Reversão funcional dos merges #23 (`0fcd3bf`) e #22 (`5dbfa3d`), preservando histórico.

## Implementação

- Runtime volta a RSVP PENDING/CONFIRMED/DECLINED, identidade local no Perfil, QR individual para confirmados e projeção original do cerimonial. QR familiar, saudação por gênero, novo feedback RSVP e identificação RPC deixam a UX.
- Migrations 001–008 permanecem byte-for-byte. A `202610100009_restore_pr21_contracts.sql` restaura `admin_action`, `app_snapshot`, `app_mutate` e `issue_ticket` a partir das definições versionadas do PR #21. As cadeias privadas originais continuam existindo.
- A 009 não altera linhas de dados, enum, links/PINs, sessões, consentimentos, receipts ou deliveries. Retira somente os dois triggers de responsável familiar adicionados em 007; as validações administrativas originais da 004 continuam ativas.
- Novas RPCs de identificação/QR familiar/resolução ficam sem EXECUTE para clientes. Funções, tabelas, colunas, índices, RLS e dados aditivos ficam dormentes.
- Funções públicas restauradas têm EXECUTE somente para authenticated, SECURITY DEFINER, search_path fixo e owner igual ao owner confiável de invitations. Conferir este owner e os delegates antes de produção.
- MAYBE existente permanece no banco e na leitura administrativa. No formulário restaurado, aparece como a opção indecisa PENDING. Abrir a tela não escreve; salvar explicitamente usa os três estados do PR #21. O backend aceita payloads MAYBE antigos ainda pendentes para não descartar filas durante a transição.
- `notifications_revoked=true` mantém os quatro canais desligados no Perfil. O backend serializa a verificação com os writers e impede que um formulário/cache antigo reative esses canais. O marcador é mantido no payload/fila e mesclado na projeção otimista, inclusive para payloads históricos sem esse campo. Salvar offline, reabrir Perfil e reconectar não reativa canais. Reconsentimento global exige um futuro fluxo explícito; não é feito automaticamente por este rollback.
- Functions, secrets, workflows, dependências, autenticação/recovery, rotas, armazenamento da fila, PWA e infraestrutura 006 de Resend/mensagens ficam intactos.

## Validação isolada

`npm run test:db` aplica 001–009 desde o início, mantém fixtures de upgrade 004/006/007/008 e acrescenta dados reais de 008 antes da 009. Compara todas as linhas de todas as tabelas public/auth antes/depois, incluindo credenciais, notificações, consentimentos, mutation results e lease/payload hash de envio pendente.

`rollback-database.sql` valida contrato restaurado, ACL/owner/search_path, ausência das features no snapshot, leitura de MAYBE, opt-out resistente a cache, papel GUEST, projeção do cerimonial, ID de mensagem em retry, link/PIN existentes e mesma reservation de envio.

E2E de acesso usa PostgreSQL descartável e a Function real de acesso via bridge de teste. Valida login administrativo, link, PIN inválido/válido, RSVP salvo, MAYBE sem alteração na abertura, QR individual FAMILY sem Perfil, identidade apenas local, reload e revogação persistente. Auth HTTP é fixture; não substitui smoke real de produção. Resend é simulado nos testes de Functions; recebimento de e-mail real exige smoke controlado posterior.

## Trava antes de produção

Nesta execução não houve acesso ao catálogo de produção, aplicação de migration, publicação de Functions, alteração de secrets ou merge. O SQL `scripts/checkpoint-rollback.sql` é somente leitura e foi preparado para a conferência posterior; não deve ser confundido com checkpoint já executado.

1. Confirmar projeto e backup/PITR recuperável. Registrar migration history, versões de Functions e artefatos Pages/nativos.
2. Executar o checkpoint somente leitura. Comparar definições/owners/ACL/search_path com o Git da main antes do rollback e o SHA estável, incluindo delegates privados. Se faltar função, houver definição/owner divergente ou dados de acesso inconsistentes, parar antes de qualquer alteração; não aplicar a 009 sob premissas falsas.
3. Conferir filas nos clientes afetados: são locais e não podem ser inventariadas por SQL. Não limpar cache/localStorage/AsyncStorage nem descartar mutations para facilitar o deploy. Drenar alterações compatíveis e preservar mutation IDs.
4. Conferir deliveries pending, leases e janela de 24h. Não repetir lotes nem criar novos request IDs como procedimento de implantação.
5. Conferir versões publicadas das quatro Functions; o código versionado coincide com PR #21. Se coincidir, não republicar. Manter secrets Resend e demais integrações.
6. Homologar o artefato restaurado com banco 008 (ponte do corte) e com 009. Testar upgrade com dados representativos, incluindo MAYBE/consentimentos/receipts antigos.

## Corte após revisão/merge autorizado

O merge dispara Pages; coordenar a janela antes de aprová-lo. Pausar novas escritas/envios sem apagar filas ou alterar secrets. Publicar frontend restaurado primeiro, ainda com 008, verificar artefato/SW, e aplicar somente a 009 após aprovação do checkpoint. Recarregar schema e validar grants/contratos. Clientes web/PWA/nativos anteriores precisam ser atualizados/controlados: identificação e QR familiar antigos deixarão de funcionar após a 009. Não liberar operação enquanto houver clientes antigos escrevendo sem controle.

Não reaplicar 001–008. Não apagar estruturas novas. Não restaurar backup antigo por cima de novas escritas. Não alterar SMTP, Resend ou secrets válidos. Não usar o link antigo comprovadamente rotacionado e não regenerar um convite existente para o smoke.

## Smoke obrigatório antes de reabrir

- ADMIN: senha válida/inválida, painel, convidados, edição, criação de convite controlado e cópia de link existente.
- Envio: destinatário de teste, Resend confirma ID, e-mail recebido, URL/base path corretos e PIN correto. Retry conserva operation/request/reservation; nada duplica. Pending permanece pending quando resultado incerto.
- Convidado: link atualmente válido, senha incorreta rejeitada, senha correta aceita, Home, Presença, Perfil local, Mensagens, Presentes, Local e QR individual após confirmação. FAMILY não depende de identify_guest.
- Segurança: código inválido, isolamento de eventos/unidades, GUEST sem ADMIN, cerimonial sem contatos/mensagens, nenhum link rotacionado e consentimentos revogados preservados.
- Operação: fila antiga drenada sem descarte, deliveries/receipts preservados, deploy Pages e builds nativos correspondem ao commit aprovado.

## Reversão do corte e riscos

Guardar definições/ACL/owners e artefatos anteriores no checkpoint. Se o smoke falhar, manter operação pausada, restaurar os contratos/ACL/owners anteriores por alteração incremental revisada e o artefato frontend correspondente. Não voltar só o frontend #23 enquanto as RPCs continuarem em contrato #21; não tentar reexecutar 007/008 sobre objetos existentes. Dados novos ficam preservados.

QR familiar fica armazenado, mas fora da UX/scanner antigo. QR individual volta à confirmação obrigatória; uma futura alteração explícita de RSVP para não confirmado pode revogar seu QR conforme PR #21, sem rotação do link de acesso. Abrir/aplicar a migration não revoga QRs em massa. O botão administrativo Regenerar link já existia no PR #21; não o usar durante o corte.

## Resultados locais deste PR

- Node 24.19.0; lint e typecheck aprovados.
- Unitários: 122 aprovados; Functions: check aprovado e 41 testes aprovados.
- PostgreSQL 17 descartável: instalação limpa 001–009, checkpoint somente leitura e suíte completa de upgrade/SQL aprovados.
- E2E: 52 aprovados, com EXPO_NO_TELEMETRY=1, EXPO_NO_CACHE=1 e EXPO_PUBLIC_DEMO_MODE=false no processo principal; cada web server configura seu modo conforme Playwright. Chromium do ambiente usado localmente; CI instala seu Chromium.
- Build/export Web na raiz e em /convite-felipe-e-lais aprovados; manifest, SW, 404, isolamento de caches privados e shell offline verificados.
- Exports Android e iOS aprovados (bundles Expo; não equivalem a instalação/teste em aparelho nem publicação nas lojas).
- Migrations 001–008, Functions, workflows, Auth/recovery, fila e secrets sem alterações.
- Smoke de produção/recebimento real Resend e catálogo/versões publicadas não verificados por falta de acesso ao Supabase neste ambiente.
