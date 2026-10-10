# Investigação das regressões após PR #22

## Evidências e limites

O usuário confirmou que a 007 foi aplicada em produção. Não houve acesso ao banco de produção nem a uma sessão real do usuário. A resposta real de app_mutate foi fornecida: HTTP 400, código 22P02, invalid input value for enum rsvp_status: "MAYBE". Portanto, o enum efetivamente usado pela RPC não aceita MAYBE; a aplicação informada da 007 não garante que o schema implantado corresponde ao arquivo. Também foi capturada a resposta real de identify_guest: PGRST202, sem função public.identify_guest(p_event,p_guest) no schema cache. A chamada coincide com os argumentos uuid da 007 versionada e seu grant authenticated; a assinatura não está disponível na API implantada. Sem consulta ao catálogo de produção, não atribuir exclusivamente ao cache: pode ser ausência/definição/grant/cache. A 008 restabelece a assinatura/permissões explicitamente e solicita reload.

Reprodução isolada sobre dados legados, sessão anônima verificada e migrations originais:

| Estado | RSVP YES/NO | RSVP MAYBE | identify_guest | QR familiar antes do Perfil |
| --- | --- | --- | --- | --- |
| 006 | funciona | 22P02, enum inválido | função ausente | contrato antigo dependente de RSVP |
| 007 carregada | HTTP 200 | HTTP 200 | HTTP 204 | unauthorized/nenhum card |
| 007 aplicada com PostgREST previamente iniciado em 006, sem reload | HTTP 200 | HTTP 200 | HTTP 404/PGRST202 | regra da 007 |
| Após NOTIFY pgrst, reload schema | HTTP 200 | HTTP 200 | HTTP 204 | regra da 007 |

A reprodução HTTP utilizou PostgREST 16.4 real, PostgreSQL 17 isolado e JWT de fixture, não somente mocks. Cache desatualizado reproduz a falha de Perfil apesar da migration aplicada; não explica, por si só, falha de RSVP. Isso demonstra uma causa possível para o mesmo PGRST202, mas não distingue sozinho o estado do catálogo de produção.

## Defeitos confirmados e correção

1. A resposta de produção confirmou incompatibilidade do enum com MAYBE. A 008 executa ALTER TYPE public.rsvp_status ADD VALUE IF NOT EXISTS, sem editar a 007. O upgrade simula funções/colunas de 007 com enum antigo, reproduz 22P02 antes da 008 e comprova persistência/retry idempotente depois. Além disso, a tela RSVP mantinha seu estado de edição/erro mesmo depois de um retry da fila já confirmado pelo servidor. Agora o estado salvo acompanha a versão persistida e a ausência de mutação pendente. Não há sucesso/celebração antes da persistência nem perda da escolha em falhas reais.
2. A 008 recria public.identify_guest(uuid,uuid) com os nomes exatos p_event/p_guest, EXECUTE authenticated e sem acesso anon/PUBLIC; valida pertença da pessoa à sessão verificada no próprio UPDATE. O upgrade também remove a função em uma base 007 para comprovar sua restauração. RPCs ausentes/enum incompatível eram reduzidos a erro genérico. O diagnóstico distingue SCHEMA de NETWORK, sem reproduzir detalhes sensíveis. Novo RSVP online confere o contrato atual antes da fila; rede indisponível continua permitindo fila, e mutations existentes conservam seus IDs para retry.
3. TicketsScreen dependia de current_guest_id, e manages_guest_ticket/issue_family_ticket exigiam a identificação do responsável. Como a identidade era uma escolha livre dentro da senha familiar compartilhada, isso era uma pré-condição artificial. A 008 autoriza pela unidade verificada e devolve listas explícitas de alvos no snapshot; a UI usa essas listas, sem inferir papéis pelo Perfil.
4. O catch de emissão descartava o erro técnico e mostrava uma orientação genérica de conexão. Agora a mensagem segura da API permanece visível, incluindo credencial já existente sem token local. Credenciais familiares estavam ocultas pelo snapshot até selecionar o responsável; sem cards, a emissão lazy nem começava. A 008 expõe hashes autorizados da própria unidade e permite emissão lazy sem Perfil. Tokens opacos continuam sendo retornados somente pela emissão autorizada, com hash no banco. Credencial já emitida em outro aparelho sem token local exige regeneração confirmada; não é possível recuperar um token a partir do hash, nem há rotação silenciosa.

## Segurança e upgrade

001–007 permanecem intactas. A nova 008 é incremental, porque 007 já foi aplicada. Não cria senha, responsável ou sessão artificial, não altera RSVP/contatos/consentimentos históricos e não revoga QRs existentes. Família sem responsável explícito mantém o campo vazio; convites pertencem à unidade ativa.

FAMILY compartilhada permite seus convites familiares/individuais; INDIVIDUAL somente o titular. Outra família, evento ou unidade são rejeitados no servidor. Seleção no Perfil continua validando pertença e persistindo no servidor; não há sucesso local silencioso. RSVP e check-in continuam independentes, e a regeneração modifica somente a credencial escolhida.

## Validação e pós-merge

Regressões: navegação HTTP real link→senha→Home→Convites sem Perfil, todas as decisões de RSVP e reload, identificação e reload, QR estável durante RSVP, perda da resposta após commit/retry do mesmo mutation_id, erro de contrato sem nova entrada inválida na fila, isolamento e rotação, dados anteriores a 007 e upgrade até 008.

Após eventual merge, conferir o projeto correto e aplicar apenas migrations pendentes na ordem 007→008. A 008 solicita reload do schema PostgREST. Revalidar com a sessão que apresentou o erro, conferir que a fila antiga foi drenada por retry (não descartar dados válidos) e acompanhar Pages. Para diagnóstico de implantação, scripts/diagnose-guest-backend.sql contém somente consultas sem dados pessoais/tokens.

Nenhuma Edge Function foi alterada. Nenhum secret novo. Não aplicar migration, publicar Functions, configurar secrets ou fazer merge durante esta tarefa.
