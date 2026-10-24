# Operadores do histórico e confirmação de QR — revisão e aplicação

Status: aplicação em produção autorizada e concluída pelo mecanismo gerenciado do Supabase; registro oficial `20261024004410 / checkin_history_actor_role`. A revisão foi aplicada com o SQL e SHA-256 aprovados. O Supabase atribuiu a versão na execução; somente o nome do arquivo novo e suas referências locais foram alinhados ao registro, sem alteração de conteúdo SQL ou reparo de migrations antigas. Commit/publicação seguem as validações descritas abaixo.

## Migration incremental

Arquivo: `supabase/migrations/20261024004410_checkin_history_actor_role.sql`. O arquivo aprovado originalmente usava o prefixo local `20261024001611`; a versão gerenciada atribuída na aplicação foi `20261024004410`. O SQL não mudou.
SHA-256: `8a285a20a18b0a3651921ad8b1355fcedfad3ac919712691cdc882eec847d736` (2.087 bytes).

Substitui exclusivamente o corpo de `ceremonial_private.checkin_history(uuid)`, preservando assinatura, JSONB, STABLE, SECURITY DEFINER, search_path, owner, OID e ACL. Os testes comparam esses atributos e as políticas RLS antes/depois. Nenhuma RPC pública, trigger, índice, tabela, grant ou policy é alterada. Não há backfill nem INSERT/UPDATE/DELETE/DROP/GRANT/REVOKE no arquivo.

A nova chave `actor_role` é calculada por evento e UUID do operador. Uma subconsulta agregada retorna exatamente um valor por item do histórico, mesmo com vínculos repetidos. Um único papel distinto é usado; ausência ou conflito retorna NULL. O cast para texto do user_id evita introduzir erro para um actor_id histórico sem formato UUID válido. A ordem e todos os campos anteriores são preservados. UUIDs internos e auditoria permanecem intactos.

O papel reflete o vínculo atual no evento na hora da consulta. Se esse vínculo for removido, a identificação fica desconhecida; não se presume o papel histórico nem o papel de quem está visualizando a tela. O frontend mostra Cerimonialista, Noivos ou Operador não identificado, sem imprimir o UUID. Clientes anteriores toleram a chave adicional; o frontend novo também tolera a ausência dela.

A instalação usa transação, lock_timeout=3s, statement_timeout=15s e transaction_timeout=30s no PostgreSQL 17+. CREATE OR REPLACE altera metadados de uma função e pode aguardar locks; falhas provocam rollback. O corpo continua exclusivamente de leitura. O custo residual é a busca de papéis por item do histórico, restrita ao evento. O índice único existente de user_roles por evento/usuário e as políticas existentes não mudam. Não há necessidade de reload de schema do PostgREST: a assinatura pública e o tipo JSONB continuam iguais.

A migration `20261023115359_checkin_reversal_history.sql` não foi editada nem reaplicada; mantém SHA-256 `761cd0b439207aa8d012dbbf8eb841b8378c7f6db707d4cdf1022286fd6d2df1`. As 11 divergências históricas não foram reparadas, renomeadas ou reaplicadas.

## Confirmação QR

O fluxo compartilhado de ADMIN/CEREMONIALIST só abre “Entrada de [Nome] registrada” após o backend confirmar uma nova entrada (`duplicate === false`) e o snapshot atualizado fornecer o nome associado ao guest_id retornado. Não aceita nome informado no QR. Falha, duplicidade e QR inválido conservam os tratamentos anteriores.

A câmera permanece montada; leitura é suspensa durante o registro e a confirmação. Um bloqueio síncrono também impede callbacks já em andamento. O modal reutiliza AdminModal, tem apenas Ok e não fecha por Esc ou clique externo. O scanner subjacente também ignora fechamento enquanto a confirmação está ativa. Ok libera o leitor, mantendo o mesmo MediaStream quando suportado. Um frame inalterado não é reenviado imediatamente; outro QR ou a reabertura explícita inicia nova tentativa. A confirmação manual, reversão, auditoria e RSVP não mudam.

## Verificações

- Unitários: 357 aprovados; lint e TypeScript aprovados.
- SQL/RLS completo: aprovado em bancos descartáveis, incluindo autorização, concorrência, QR original, reversão e auditoria.
- Upgrade da nova migration: dados existentes, OIDs/ACL/owner/configuração/volatilidade, políticas e corpos das RPCs públicas preservados; papéis históricos, vínculos ausentes/repetidos/conflitantes e isolamento de evento validados.
- Build/export web local e validação de assets, rotas, cache privado, offline e PWA: aprovados.
- E2E final: 16 testes aprovados em `ceremonial-portal.spec.ts` e `workflows.spec.ts`. Dois QR Codes foram decodificados na mesma câmera, em 320/1280 px, nas sessões CEREMONIALIST/ADMIN. O mesmo MediaStream permaneceu ativo; nenhum segundo registro ocorreu antes de Ok. Cobertura de resposta pendente, falha, duplicidade, QR inválido, operador desconhecido, foco e Esc, atualização de listas/histórico e entrada manual preservada.
- Inspeção visual das confirmações em 320/1280 px: aprovada. O novo E2E identificou e permitiu corrigir o fechamento do scanner subjacente por Esc, antes da rodada final aprovada.

Nenhuma credencial real ou dado de produção foi utilizado nos testes. Câmera simulada com decodificador real não certifica câmera física Android/iOS.

## Arquivos locais desta revisão

Frontend: `src/features/ceremonial/domain.ts`, `src/features/checkin/CameraScanner.tsx`, `src/features/checkin/CheckinScreen.tsx`, `src/lib/AppProvider.tsx`, `src/repositories/demo.ts`, `src/types/domain.ts`.

Testes e execução local: `scripts/test-ceremonial.ts`, `scripts/test-db.sh`, `tests/ceremonial.test.ts`, `tests/e2e/ceremonial-portal.spec.ts`, `tests/e2e/workflows.spec.ts`, `tests/support/postgres.ts`, `tests/support/qr-video.mjs` e novo `tests/support/checkin-role-upgrade.ts`. A baseline histórica da suíte continua separada; a nova migration é validada tanto no upgrade dedicado quanto na instalação completa dos bancos de teste.

Novos arquivos restantes: a migration incremental indicada acima e este relatório.

## Verificação após aplicação gerenciada

Consultas somente leitura confirmaram o corpo instalado (MD5 normalizado `4a3d0a9c19b7963b2ddfeb5a3587c34f`), OID/owner/ACL/search_path/STABLE/SECURITY DEFINER preservados, RPCs públicas sem alterações e o mesmo hash de todas as políticas RLS antes/depois. Contagens antes/depois: 73 convidados, 93 unidades, 73 RSVPs, 0 entradas ativas, 28 credenciais QR e 1.691 registros de auditoria. Nenhum check-in real foi criado ou removido nos testes. A migration anterior e as 11 divergências históricas permanecem intocadas.

A consulta de segurança após aplicação manteve 32 grupos/53 ocorrências, como no diagnóstico anterior: [RPCs SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), políticas para sessões anônimas e [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Nenhuma correção fora do escopo foi introduzida.
