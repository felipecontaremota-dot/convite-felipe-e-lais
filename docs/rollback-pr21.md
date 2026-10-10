# Reconstrução limpa da aplicação — PR #21

Referência: `919382d988c1b8cb06130f0da3813db7a841ebd1`.
Estratégia B: descartar dados operacionais de teste e reconstruir objetos da aplicação em `public` com 001–006. Runtime, dependências, workflows e Functions correspondem à referência; 001–006 não foram editadas. 007/008 estão apenas em `tests/fixtures/post-pr21`, fora do caminho ativo. A proposta 009 foi removida.

## Limites

**Nenhum script deste pacote deve ser aplicado em produção antes da revisão do corte.** Não houve merge, deploy, execução remota de SQL ou alteração de secrets nesta preparação. O teste local não substitui o inventário do projeto hospedado nem recebimento real do Resend.

Não executar `DROP SCHEMA public CASCADE`, `supabase db reset`, `migration repair`, `db push` para reaplicar 001–006, reset/force push de main ou limpeza de `auth`/Storage. O histórico oficial já registra 001–006 e não é modificado.

## Conteúdo operacional

- `scripts/rebuild-pr21/preflight-readonly.sql`: contexto, histórico, objetos, owners/ACL, extensões e dependências; consulta local para identificar ADMIN existente. Conferir no painel Auth o UUID e e-mail autorizado; não publicar resultados pessoais. Se o vínculo estiver ausente, localizar a conta pelo e-mail no painel Auth. Não inventar UUID.
- `cleanup-reviewed.sql`: allowlists explícitas de 32 tabelas, view `invitation_members`, funções com assinaturas permitidas e três enums. Remove triggers/policies internos, funções, tabelas e tipos nessa ordem. Usa RESTRICT, recusa overloads inesperados e objetos de extensão. Dependências externas causam erro, não são removidas automaticamente. Requer confirmação de descarte e deve rodar na mesma transação da reconstrução.
- `bootstrap-reviewed.sql`: valida usuário Auth existente e não anônimo; recria vínculo ADMIN no evento `00000000-0000-4000-8000-000000000001`. `supabase/seed.sql`, executado antes, recria evento/settings/nove regras padrão do baseline. Não cria Auth user, senha ou convidados. Rever data, local e regras do seed; reconfigurar pelo painel após o corte.
- `run-rebuild.sh`: chama psql com `-X`, `ON_ERROR_STOP=1` e transação única para cleanup → 001–006 → seed → bootstrap. URI é recebida pelo ambiente e convertida em arquivo libpq temporário privado, removido ao terminar; não entra em argumentos de psql. Não escreve schema_migrations nem publica Functions. Sem confirmação/UUID/conexão, para.
- `clear-browser-data.js`: ferramenta manual, fora do runtime. Apaga queue/cache/tickets do evento, demo-session e sessão local do projeto indicado; unregister do SW no escopo do convite e caches PWA correspondentes. Preserva dados de outras aplicações. Não acessa banco nem apaga usuário Auth.

## O que será descartado

Todas as linhas das tabelas allowlisted: evento/configurações atuais, profiles/vínculos ADMIN da aplicação, convidados/famílias, convites/códigos/PINs/acessos/sessões de convidados, contatos/RSVP/presentes, QR/check-ins, mensagens/announcements/recipients, regras/jobs/outboxes/attempts, logs, receipts e deliveries/batches/members. Objetos 007/008 são removidos. Links e PINs anteriores deixam de funcionar deliberadamente.

O que permanece: projeto/URL/chaves, schema public e suas permissões de infraestrutura, extensions/pgcrypto, auth e usuários/identidades/senhas/configurações, Storage, migration history, secrets, SMTP, Resend/domínio/remetente, Functions idênticas ao baseline, Repository Variables e Pages. Sessões Supabase Auth não são removidas no servidor; os vínculos de acesso ao casamento são apagados e sessões locais serão limpas.

## Teste isolado e comparação

`npm run test:db` mantém toda a suíte baseline e acrescenta reconstrução. Instala 001–006, seed e ADMIN; registra catálogo baseline; aplica fixtures 007/008 e cria MAYBE, contato revogado, receipt, QR individual/familiar e delivery pendente. Testa que dependência de Storage bloqueia cleanup e que DDL anterior é revertido. Depois executa o procedimento real e compara exatamente tabelas/colunas/enums/funções/assinaturas/retornos/owners/ACL/RLS/policies/triggers/views/índices/constraints/schema. Confirma Auth, Storage e histórico preservados, dados operacionais descartados e event_role/snapshot ADMIN funcionando. A suíte foi validada em PostgreSQL 16 e 17; o runner operacional completo também foi exercitado em container descartável.

Auth/Storage hospedados são representados por fixtures no PostgreSQL descartável; dependências específicas do projeto precisam do preflight. O proprietário de execução deve ser o owner confiável validado; a comparação local usa o mesmo owner na instalação limpa e reconstrução. Não supor que owners de produção sejam iguais ao teste.

## Sequência do corte futuro

1. Revisar PR e inventário; confirmar projeto, snapshot/backup e owner de execução. Confirmar UUID ADMIN existente. Conferir Functions publicadas com baseline; não republicar se iguais. Guardar configuração externa/evento desejada.
2. Pausar acesso, scheduler/workers e envios. Nenhum cliente antigo deve escrever ou retomar filas; manter a pausa até fim do smoke. Secrets não são apagados para pausar workers.
3. Fechar outras abas/janelas PWA. Com o app parado (página de manutenção, sem bundle executando), executar a ferramenta de limpeza no console da origem/caminho correto; fechar aba. Para IndexedDB, o baseline não a utiliza: identificar bases adicionais em DevTools e apagar somente as deste app. Não limpar toda a origem GitHub Pages se outras aplicações a compartilham.
4. Apps nativos de teste: encerrar app; descartar AsyncStorage deste app e sessão SecureStore via procedimento de reset do app. Desinstalar/reinstalar limpa armazenamento do app, mas iOS Keychain pode sobreviver; em simulador dedicado usar reset do simulador, ou exclusão explícita do item Supabase SecureStore antes do próximo uso. Não considerar reinstalação iOS prova de limpeza. Manter instalações antigas fechadas; distribuir build baseline.
5. Preparar conexão de banco em ambiente seguro, sem URL/senha em chat, commit ou histórico de shell. Executar somente após aprovação do corte:

```bash
export REBUILD_ADMIN_USER_ID='<UUID-AUTH-CONFIRMADO>'
export REBUILD_CONFIRMATION=DISCARD_TEST_DATA_REBUILD_PR21
# REBUILD_DATABASE_URL deve ser injetada por mecanismo seguro.
bash scripts/rebuild-pr21/run-rebuild.sh
```

6. Se qualquer operação falhar, parar: transação inteira deve ser revertida. Não adicionar CASCADE nem ignorar erros. Investigar dependência/owner/overload, revisar e homologar novamente.
7. Conferir catálogo final contra 001–006; enum RSVP deve conter somente PENDING/CONFIRMED/DECLINED e nenhuma estrutura 007/008. Confirmar Auth/Storage/histórico intactos e papel ADMIN correto. Recarregamento PostgREST é solicitado pelo bootstrap.
8. Coordenar merge/publicação: merge em main dispara Pages automaticamente, por isso só fazer durante a janela. Validar artefato baseline e SW; clientes não podem abrir versão antiga contra banco novo. Não fazer deploy das Functions idênticas. A pausa cobre todo o intervalo entre reconstrução e frontend pronto.
9. Smoke real: login ADMIN correto/incorreto → painel → novo convidado/convite → envio Resend → e-mail recebido → novo link → PIN correto/incorreto → área convidado → RSVP → sessão/reabertura → QR individual/check-in. Validar isolamento, mensagens, retry idempotente/lease/pending sem duplicar e PWA. Ajustar data/local e regras antes de uso.
10. Liberar somente clientes novos e depois workers. Convites antigos descartados não devem ser usados para teste.

## Riscos residuais

- Dependências não registradas em pg_depend (SQL dinâmico/corpos textuais) exigem leitura no preflight; RESTRICT não as detecta todas.
- Objetos adicionais não reconhecidos devem ser classificados antes do corte; não ampliar allowlists automaticamente.
- Clientes offline antigos e iOS Keychain podem sobreviver ao corte; todos precisam de reset controlado.
- E-mail realmente aceito antes do corte não é desfeito pelo descarte de deliveries; novos testes podem gerar e-mails adicionais. Não retomar lote antigo.
- Uma falha de Auth/configuração externa não é corrigida por reconstrução de public; smoke real permanece obrigatório.
- Perda de dados é intencional; backup permite recuperação excepcional, mas não deve ser restaurado automaticamente sobre o banco novo.

Informações necessárias no corte: project ref correto para limpeza local, conexão segura, owner confiável, UUID ADMIN confirmado, aprovação de configuração do evento e inventário externo. Nenhuma credencial privilegiada entra no frontend ou Git.
