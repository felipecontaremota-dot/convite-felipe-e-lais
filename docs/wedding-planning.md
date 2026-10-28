# Planejamento do Casamento

Acesso: menu administrativo → Planejamento do Casamento (`/planejamento`). Exclusivo de ADMIN do evento. Não há alteração das sessões, RSVP, QR, check-in, mensagens, notificações ou portal do cerimonialista.

## Modelo e autorização

Seis relações novas: `planning_suppliers`, `planning_entries`, `planning_installments`, `planning_payments`, `planning_budgets` e `planning_documents`. Todas possuem RLS, isolamento por `event_id`, versionamento e identificadores próprios. FKs compostas impedem vínculos entre eventos. Os clientes têm somente SELECT condicionado a ADMIN; gravações passam por `planning_action`, que revalida o papel, serializa operações do evento e aplica a alteração, o recibo e a auditoria numa transação. Não há escrita offline.

`planning_snapshot` é uma leitura própria do módulo, não acrescenta dados financeiros aos snapshots dos convidados. `planning_document_finish` é exclusiva de `service_role` e confirma somente documentos preparados por um administrador que ainda tenha esse papel. Nenhuma RPC anterior é substituída.

São reutilizados `user_roles`, `event_role`, `audit_logs`, `mutation_receipts`, o cliente Supabase, a autenticação e os componentes administrativos. O recibo contém somente identificação, versão e fingerprint da requisição, sem os dados financeiros ou bancários em texto aberto. Alterações concorrentes exigem a versão esperada; repetição da mesma requisição retorna o resultado original.

## Finanças e conciliação

Valores são centavos inteiros (bigint), limitados por registro, formatados em BRL. A obrigação de um lançamento Contratado ou Concluído é o valor acordado menos o desconto. Planejado, Orçamento solicitado e Em negociação não geram obrigação. No cancelamento, o administrador informa explicitamente a obrigação mantida, sem apagar pagamentos anteriores.

Cada pagamento guarda a identificação do fornecedor no momento do registro, sem copiar seus dados bancários. Alterações posteriores no cadastro não reescrevem essa identificação histórica. Cada parcela aceita vários pagamentos. Entradas, pagamentos antecipados e complementares são descrições/ordens do cronograma; é possível criar novas parcelas ou adicionar pagamentos às existentes. O gerador mensal considera o saldo ainda não pago e divide os centavos exatamente, com limite de 120 parcelas, e mantém o dia original quando possível (31/01 → 28/02 → 31/03). Não gera outro cronograma sobre parcelas ativas.

Pagamentos precisam de valor positivo, data efetiva não futura, forma de pagamento, lançamento e parcela autorizados. Um valor superior ao saldo, ou uma edição que gere crédito, exige confirmação explícita. Créditos aparecem separados e nunca reduzem a dívida de outro contrato. Não há integração bancária, pagamento automático nem estorno bancário.

O total pago soma registros de pagamentos não cancelados, uma única vez. Saldo global é a soma dos saldos positivos dos lançamentos. Não se somam contratos novamente por parcela ou pagamento. O percentual quitado usa apenas o valor aplicado a cada obrigação, limitado ao valor devido por lançamento; créditos não quitam outros contratos. O total efetivamente pago continua incluindo o excedente, destacado separadamente.

A projeção soma obrigações assumidas e estimativas de lançamentos ainda não contratados, sem repetir parcelas. O orçamento global é opcional e configurável; disponibilidade e excedente são separados do saldo financeiro a pagar. Filtros afetam somente a lista, nunca os indicadores globais.

O cronograma é conciliado com a obrigação: diferenças permanecem visíveis e não são consideradas pagas. Nos indicadores de vencimento, o saldo de cada lançamento é distribuído por vencimento, limitado à obrigação restante, evitando contar a mesma dívida em dobro num cronograma excedente. A lista também mostra o saldo próprio de cada parcela e a divergência a corrigir. Pagamentos de parcelas arquivadas continuam compondo a cobertura financeira do cronograma, sem serem cobrados novamente.

Datas de vencimento e de pagamento são separadas. Os agrupamentos vencidos, 7/15/30 dias e futuros usam o calendário de America/Sao_Paulo; a tela atualiza a data ao atravessar a meia-noite.

## Arquivamento e auditoria

Exclusões são lógicas e confirmadas. Arquivar um fornecedor não apaga seus vínculos. Obrigações e pagamentos de lançamentos arquivados continuam nos indicadores, com indicação explícita; o filtro permite encontrá-los, registrar a quitação e editar a conciliação sem restaurá-los silenciosamente. Não se apagam pagamentos ao editar/arquivar uma parcela. Cancelar o registro de um pagamento retira-o do total pago, preservando o registro e a auditoria, sem realizar estorno bancário.

A auditoria existente registra operador, horário, entidade, versão, campos alterados e valores/datas financeiros relevantes. PIX, dados bancários, contatos e notas livres não são copiados para os logs de auditoria. A consulta `planning_history` apresenta páginas de 100 eventos com cursor estável, incluindo histórico antigo e registros filhos do lançamento; não há corte permanente na visualização. Erros de integridade da nova RPC são saneados para não expor os detalhes das linhas bancárias.

## Documentos

Bucket novo `wedding-planning`, privado. O bucket público de convites não é alterado. Formatos: PDF, JPG/JPEG e PNG, até 10 MiB. O endpoint `planning-documents` exige JWT válido, verifica o usuário e seu papel no evento, limita a leitura do corpo e confere extensão, MIME e assinatura dos bytes antes do upload. Usa as variáveis de servidor já fornecidas pela plataforma, sem chaves no frontend.

O cliente não possui política de INSERT/UPDATE/DELETE no Storage. A RPC prepara metadados PENDING; o endpoint validado faz o upload e somente então confirma READY pelo RPC exclusivo de serviço. Upload parcial não libera leitura. Tentativas idênticas reutilizam a reserva; uma resposta perdida não deve duplicar o documento. Pendências podem ser excluídas logicamente pela administração.

Downloads são autenticados, sujeitos a RLS e ao vínculo do evento. Não há URLs públicas ou assinadas permanentes. Blobs são mantidos somente em memória para visualizar/baixar, e suas URLs são revogadas ao sair do módulo. Excluir logicamente o documento bloqueia novas leituras, preservando metadados, objeto privado e auditoria. Conteúdo já baixado por um usuário autorizado não pode ser desfeito. A identificação do documento é editável; os bytes não são sobrescritos.

Validação de formato não é antivírus. Uma política futura de retenção/limpeza física dos objetos arquivados exigirá ação administrativa própria; esta entrega não remove bytes indiscriminadamente.

## Testes e operação

Fixtures financeiras existem somente nos bancos descartáveis e no modo de demonstração local explícito. A migration não insere fornecedores, contratos, parcelas, pagamentos ou orçamento em produção. Não usa db push ou altera migrations históricas.

`test-planning.ts` cobre upgrade/rollback, autorização/RLS, vínculos, versões, parcelas exatas, múltiplos pagamentos, cancelamento, arquivamento, auditoria sem dados bancários, documentos privados, concorrência e idempotência em conexões independentes. O transporte de upload é validado por testes Deno; testes de navegador usam RPCs reais em PostgreSQL descartável e um adaptador de Storage. O stub SQL de Storage é exclusivamente de teste, não uma migration.

Uma reversão de frontend não deve apagar tabelas ou arquivos financeiros. Após uso real, qualquer mudança de dados exige nova análise incremental. Arquivos/documentos reais não são criados como teste em produção.

Migration aplicada pelo mecanismo gerenciado em produção: `20261028192221_wedding_planning.sql`, SHA-256 `a35f14f5f2e52942d3a94834ab0cdb308143e3dc651c86e06d9f83a56060cb9f`. O histórico oficial contém os mesmos 30.657 bytes. Nenhuma migration histórica foi reparada ou reaplicada.
