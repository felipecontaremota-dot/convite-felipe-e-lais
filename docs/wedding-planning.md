# Planejamento do Casamento — controle simplificado

Acesso exclusivo de ADMIN do evento em `/planejamento`. A interface tem somente **Visão geral**, **Fornecedores** e **Pagamentos**. Não há alteração de autenticação, convidados, RSVP, padrinhos, QR, check-in, mensagens, e-mails, notificações, vídeo ou PWA.

## Causa do erro de R$ 1.820,00

O modelo anterior validava simultaneamente o saldo da parcela e a obrigação do contrato. A consulta de produção encontrou uma parcela de 182.000 centavos vinculada a um lançamento `COMPLETED` com `agreed_cents = 0`. Mesmo sem pagamento anterior, a comparação com o contrato rejeitava 182.000 > 0. A parcela mostrava R$ 1.820,00, enquanto a segunda referência estava zerada. Não era arredondamento de ponto flutuante.

O controle novo possui uma única obrigação: valor contratado do fornecedor, obrigatoriamente igual à soma dos vencimentos. O registro de pagamento usa comparação estrita `>` com os saldos do vencimento e do fornecedor. Igualdade quita normalmente; pagamento parcial mantém o saldo; excedente real é rejeitado com mensagem clara.

## Modelo atual

- `planning_vendors`: fornecedor, contatos/dados bancários opcionais, valor total e modalidade do plano, versão e exclusão lógica.
- `planning_dues`: vencimentos individualizados, entrada/parcelas/à vista, valores e posições editáveis.
- `planning_settlements`: somente pagamentos efetivamente realizados, data, método, observação e histórico de cancelamento lógico.
- `planning_budgets`: orçamento existente reutilizado.

Não é necessário cadastrar despesas ou contratos em uma segunda tela. O fornecedor e o plano são gravados atomicamente por `planning_simple_action`. `planning_simple_snapshot` retorna somente os dados desse módulo ao ADMIN autorizado.

RLS por evento, FKs compostas, ausência de escrita direta pelo cliente, autorização dentro das RPCs e proteção contra acesso de convidados/cerimonialistas são preservadas. Requisições são idempotentes pelos recibos já existentes; alterações usam versão e bloqueio transacional por evento. Os erros não expõem linhas bancárias. Logs de auditoria registram valores, plano e alterações financeiras, sem contatos, PIX, dados bancários ou notas livres.

## Transição dos registros anteriores

A migration `simple_supplier_planning` não executa DROP, TRUNCATE ou DELETE. As tabelas e os registros anteriores de fornecedores, despesas/contratos, parcelas, pagamentos e documentos continuam preservados e protegidos como arquivo legado. Não se alteram dados de outros módulos nem se limpam tabelas compartilhadas de auditoria/recibos.

Os cadastros ativos dos fornecedores são copiados com seus contatos e dados bancários. O orçamento global permanece no mesmo registro. Valores, planos e pagamentos antigos **não são convertidos automaticamente** para o novo controle, porque a origem pode conter contrato zerado, parcelas incompatíveis e obrigações sem associação simples. O novo financeiro inicia com esses valores zerados, conforme a autorização de reinício limitada ao módulo; a tela avisa para conferir e definir cada contrato. Não há criação de pagamentos ou contratos fictícios.

Arquivos privados antigos não são apagados nem expostos. O endpoint antigo de documentos e as RPCs legadas permanecem para compatibilidade/arquivo; a interface nova não os utiliza, exceto a gravação de orçamento já existente. Não há aba Documentos ou Despesas e contratos.

## Operação

O plano aceita À vista, Entrada + parcelas e Somente parcelas. Quantidade gera linhas com sugestão em centavos exatos e datas mensais, respeitando o último dia do mês. Valores e vencimentos individuais são editáveis. A diferença entre contrato e plano fica visível; o backend impede salvar diferenças.

Editar uma obrigação com pagamentos exige confirmação quando seus dados financeiros mudam. Não é permitido reduzir o valor abaixo do que foi pago nem excluir uma parcela com pagamentos sem cancelar explicitamente os registros. Nenhuma edição apaga pagamentos silenciosamente.

A exclusão de fornecedor exige confirmação incluindo o valor pago atual. O backend verifica esse valor para evitar confirmação desatualizada. Fornecedor, plano e pagamentos deixam de integrar as listas/totais ativos, mas permanecem armazenados e auditados. Cancelar pagamento não realiza estorno bancário.

Visão geral calcula orçamento, contratado, pago, saldo, vencidos e próximos vencimentos a partir do mesmo `simpleLedger`. Status são Pago, Vencido, Vence hoje, Vencimento próximo (1–5 dias) e Pendente. Datas usam `America/Sao_Paulo`.

Pagamentos contém somente registros realizados, com total cujo valor monetário é verde, colunas Fornecedor/Data de vencimento/Data de pagamento/Valor pago e ordenação crescente/decrescente. O padrão é fornecedor A→Z, com desempate determinístico por datas/ID. No celular as linhas reorganizam-se em cards.

A barra exibe percentual numérico, interpola vermelho→âmbar→verde e anima discretamente largura/cor. `prefers-reduced-motion` desativa a transição. Não se usa cor como único indicador.

## Testes

Fixtures apenas em modo demo explícito ou PostgreSQL descartável. `test-simple-planning.ts` reproduz o erro anterior, valida upgrade/rollback e preservação de dados externos/legados, comparação exata, múltiplos pagamentos, excesso real, edição de parcelas pagas, exclusão lógica, RLS, idempotência e concorrência independente. Os testes de navegador verificam criação/edição/planos, pagamentos, ordenação, recarregamento e mobile. Não se registram pagamentos de teste em produção.

Migration aplicada pelo mecanismo gerenciado em produção: `20261103015210_simple_supplier_planning.sql`, 17.862 bytes, SHA-256 `32d99d54b76b9cc4531a489f1680c55a75d56533e389861af7b6ef8e3004f7b0`. O histórico oficial contém os mesmos bytes testados. Pós-verificação: oito cadastros copiados sem divergência, orçamento preservado, valores contratados novos zerados, nenhum novo vencimento/pagamento e dados legados/externos/RPCs anteriores/políticas anteriores inalterados. Nenhuma migration histórica foi reparada ou reaplicada.
