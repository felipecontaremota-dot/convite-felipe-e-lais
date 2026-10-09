# Google Sheets como projeção

Destino pretendido: **Projeto Casamento — Planejamento e Controle de Custos**, aba de convidados. O título não é usado como identificador: configure GOOGLE_SHEETS_ID e GOOGLE_SHEETS_TAB_GUESTS. Nenhuma planilha real é alterada na implementação/testes.

O banco é primário. Triggers de convidado, contato, RSVP e check-in upsertam sheet_sync_jobs por evento/entidade, incrementando a versão. `sync-sheets` obtém um lote com row lock, consulta o estado atual e projeta. Alteração durante o envio mantém o job pending. Falhas preservam erro, tentativas e próximo horário; após oito tentativas, revisão operacional é necessária.

| Campo normalizado | Coluna recomendada  |
| ----------------- | ------------------- |
| id                | Convidado ID        |
| name              | Nome completo       |
| family            | Família/Convite     |
| group             | Grupo/vínculo       |
| rsvp              | RSVP                |
| checkin           | Check-in            |
| entered           | Horário de entrada  |
| dietary           | Restrição alimentar |
| contact           | Contato             |
| note              | Observações         |

A coluna antiga Presença precisa ser analisada: não se pode inferir que “Confirmado” significa entrada física. Adicione colunas separadas mediante revisão humana e preencha IDs estáveis. O adapter não renomeia, remove ou reordena cabeçalhos. `GOOGLE_SHEETS_COLUMN_MAP` opcional contém JSON de coluna recomendada para nome existente; exemplo não secreto: `{"Família/Convite":"Convite"}`. Os demais nomes usam os defaults. Cabeçalho ausente gera falha com retry, nunca alterações estruturais automáticas.

GoogleSheetsAdapter autentica com JWT RS256 OAuth2 de service account; configure e-mail/private key somente em Supabase secrets. Compartilhe apenas a planilha necessária com esse principal. Escopo é spreadsheets; use uma conta dedicada. Domains: oauth2.googleapis.com, sheets.googleapis.com.

Upsert procura o UUID Convidado ID, atualiza somente as células mapeadas da linha encontrada, sem tocar fórmulas ou colunas extras ou adiciona uma linha nova. Duplicidade do ID interrompe o job para revisão. Valores são enviados em RAW para não executar fórmulas originadas de nomes/observações. O job único por entidade e o lease evitam writers simultâneos usuais; não há transação distribuída com Sheets. Reenvio após resposta perdida procura de novo o UUID. Não execute workers sobrepostos com leases expirados e verifique duplicidades antes de retomar uma operação externa de resultado incerto.

Remover um convidado não apaga sua linha automaticamente; o job falha com necessidade de revisão quando a entidade não existir. Não há sincronização bidirecional contínua.

## Importação inicial com revisão

Exporte/normalize linhas para JSON com campos id opcional, name, family, group opcional, rsvp opcional. O rsvp deve ser PENDING, CONFIRMED ou DECLINED. Não use dados reais em fixtures públicas. Execute `npm run import:report -- entrada.json /caminho/privado/relatorio.json`: schema, duplicidades por nome normalizado e erros por linha ficam em relatório privado de permissão 0600; stdout mostra somente contagens e applied=0. Homônimos são candidatos a revisão, não exclusões automáticas.

O script **não grava no banco**. Compare o relatório com convidados existentes, valide famílias e aplique registros aprovados usando a interface administrativa; se precisar de importação em lote, implemente uma etapa administrativa de aprovação explícita contra o mesmo relatório, sem sobrescrita silenciosa. Nenhum acesso de produção deve ocorrer sem credenciais e autorização.

Scheduler: chame sync-sheets por POST com x-worker-secret em um ambiente server-side. Credenciais não devem aparecer em URLs, logs ou app. Ao corrigir configuração, jobs failed podem ser rearmados por operador confiável com attempts=0/status=pending/next_attempt_at=now(); audite essa operação.
