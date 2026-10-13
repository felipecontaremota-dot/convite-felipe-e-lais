# Relatório local da reconstrução da 009

Branch: `codex/rebuild-password-entry-009`.
Base main: `521e75f55e8fd29a127500afaddb6de8518da143`.

O desenho, contratos, elegibilidade, constraint, HMAC, ACLs/OWNER/search_path, limites, capacidade e estratégia futura de publicação estão detalhados em [public-password-entry.md](public-password-entry.md).

## Evidências de validação

- `scripts/test-db.sh`: suite existente completa, upgrade 004 e 006, cenários de regressão da 008 e novo harness 009.
- `scripts/test-password-db.sh`: duas bases isoladas: clean 001–008→009 e baseline 001–007→009. Colisão legada provoca preflight negativo e rollback, sem reparar credenciais. Instalação normal valida preservação dos registros públicos, definições/ACLs de RPCs não relacionadas e backfill exato. Catálogos finais da 009 são comparados entre as duas bases, excluindo chave aleatória e conteúdo sensível.
- `tests/password-allocation.sql`: preferência WhatsApp, alternativa quando ocupada, senha aleatória sem WhatsApp, rejeição explícita, credenciais anteriores intactas, isolamento dos papéis da API, domínio completo de 10 mil senhas e rollback sem registros parciais ao esgotar capacidade.
- `tests/access-units.sql` preservado: FAMILY_DELETE com 501 integrantes, inclusão/remoção, criação individual e lotes continuam executando as RPCs reais.
- `tests/password-entry.sql`: RPC real somente service_role, staff rejeitado, senha inválida, vínculo correto, snapshot isolado, colisão estrutural, link exclusivo preservado, inativo/código bloqueado, quotas e nenhuma rotação.
- `tests/password-concurrency.py`: 15 cenários com processos/conexões PostgreSQL independentes e barreiras observadas em pg_stat_activity: alocadores automáticos concorrentes; conflito explícito; atualização concorrente para mesma senha; ativação conflitante; arquivamento que libera senha; alteração administrativa antes do resgate; dois resgates idempotentes; exclusão antes do resgate; rollback; remoção do acesso antes do resgate; mesma senha em eventos diferentes; reassociação com UUIDs ordenados para reproduzir a antiga autocolisão do rascunho; desarquivamento conflitante; duas ativações concorrentes; resgate que confirma antes de uma alteração administrativa bloqueada. Verificação final compara registry e fontes elegíveis.

## Problemas encontrados e resolvidos

O gerador legado colidia em criação automática, sobretudo no lote de 501 pessoas. A alteração inicial automática foi expressamente autorizada. Senhas explícitas não têm fallback. Duas fixtures existentes pressupunham PIN duplicado: apenas seus dados foram separados, preservando assertions de isolamento e reenvio familiar. A fixture de concorrência foi corrigida para respeitar a regra preexistente de responsável INDIVIDUAL. A reconciliação de reassociação do rascunho foi corrigida para não depender da ordem dos UUIDs.

`test:export` inicialmente tentou usar um Chromium ausente no cache padrão. Foi repetido com o Chromium instalado via `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium`, sem modificar a aplicação ou enfraquecer os testes.

## Limites da evidência

Todas as bases, credenciais e usuários de teste são locais e descartáveis. Não houve inspeção do estado atual de produção nem validação de colisões reais. Não se afirma que a produção esteja pronta para aplicar a 009. O caminho CI PostgreSQL instalado é preservado, mas esta rodada utiliza PostgreSQL 17 via Docker. Nenhum Actions foi disparado porque nenhum push é autorizado. Exports Android/iOS validam empacotamento, não instalação física em aparelhos.

As migrations 001–008 devem permanecer byte-for-byte iguais à base. Nenhum schema dump de produção é incorporado. Nenhuma operação Supabase, escrita remota, push, PR, merge ou deploy integra esta tarefa.

## Resultados da entrega

| Validação | Resultado local |
| --- | --- |
| lint / typecheck | Aprovados |
| Unitários | 190 aprovados, 16 arquivos |
| check:functions / Functions | Aprovados; 52 testes |
| E2E completo | 82 aprovados |
| DB completo e histórico | Aprovado |
| Regressão 008 | Instalação/upgrade, catálogo idêntico e concorrência aprovados |
| 009 instalação com 008 / upgrade sem 008 | Ambos aprovados; catálogo final idêntico |
| Concorrência 009 | 15 cenários por base, 30 execuções ao todo |
| Preflight negativo e backfill | Aprovados nas duas bases |
| Capacidade / rollback | Domínio cheio rejeitado atomicamente; lote de 501 preservado |
| build:web / test:export | Aprovados; rotas, manifest/SW, offline e 390×844 |
| export Android / iOS | Ambos aprovados |

Não houve redução de assertions. A alteração de dados das fixtures decorre da nova invariável: uma senha explícita duplicada não pode mais ser criada para montar um teste de outra funcionalidade. O caso de ambiguidade foi substituído por rejeição estrutural da escrita e preflight de colisões legadas, mantendo cobertura do risco.

Riscos operacionais para revisão: ACCESS EXCLUSIVE durante instalação; baixa entropia de quatro dígitos; quota de evento que também conta logins corretos e pode limitar picos legítimos; bloqueio de instalação diante de colisões reais; custo maior perto de capacidade; backups completos contêm credenciais legadas. Nenhum desses pontos foi testado contra produção nem tratado com alterações remotas.
