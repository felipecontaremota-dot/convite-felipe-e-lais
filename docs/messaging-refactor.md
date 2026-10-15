# Chat único e central administrativa

Evolução sobre a main após `565d952` e `5678b34`, sem alteração de migrations, Edge Functions, autenticação ou regras de consentimento. A seção indicada de Informações foi removida por instrução expressa do usuário, inclusive os dois parágrafos. O rodapé e o Perfil permanecem intactos.

## Diagnóstico comprovado

Foi realizada inspeção **somente de leitura** no projeto Supabase PROD `convite-felipe-e-lais` (não no projeto develop): consulta de registro de migrations e metadados de tabelas/funções, sem ler mensagens, contatos, PINs ou dados de convidados.

Resultados: `message_reads` e `notification_schedules` não existem; `messaging_mutation_core` e `messaging_admin_core` não existem; `app_snapshot` não expõe `messaging_v2`. Os contratos de nome/PIN (`name_pin_snapshot_core`), perfil 008 (`internal_mutation_core` e `internal_snapshot_core`) e admissão final de consentimento existem. O registro de migrations apresenta versões históricas com timestamps diferentes dos arquivos da main e não reflete todos esses contratos presentes. Portanto, não se deve executar um `db push` indiscriminado nem reaplicar migrations históricas com base apenas nessa lista.

Na interface anterior, “Responder à família” abria `AdminConversation` somente sob `capabilities.messaging_v2`; sem ela, preenchia o formulário antigo para família. Isso não abria a conversa nem executava `MESSAGE_REPLY`. A exclusão também era intencionalmente ocultada sem a capacidade. **A ausência da migration é uma dependência real, não um erro de RLS comprovado nem falha de persistência demonstrada em produção.** Nenhuma resposta ou exclusão foi tentada em produção nesta investigação.

Agora “Responder” abre a unidade correspondente no mesmo módulo. Com capacidade instalada, executa `MESSAGE_REPLY` sobre a mensagem recebida, e o servidor deriva evento/unidade/destinatários do registro original. Sem capacidade, o histórico é consultável, mas o envio e a exclusão novos ficam bloqueados, com explicação. Não há resposta simulada em memória. O acionador Responder mantém o ID da mensagem histórica selecionada, sem trocá-la pela última mensagem da unidade; uma referência que não esteja mais disponível bloqueia o envio.

## Arquitetura reutilizada

Mantidos `messages`, `message_threads`, `message_recipients`, `message_reads`, `announcements`, `mutation_receipts`, `notification_jobs`, `audit_logs`, `app_mutate`, `admin_action` e todos os filtros/RLS existentes. Não há tabela ou RPC nova.

`MessageCenterContext` coordena o balão administrativo acima das rotas e fecha/limpa seleção quando o papel/escopo muda. O item Mensagens do menu web aciona essa mesma central, com semântica de botão, sem navegação. A rota `/gestao-mensagens` continua disponível; o atalho “Envio para família ou pessoa” conserva o formulário avançado, os destinatários e os quatro canais existentes. Native mantém essa rota como entrada.

A central tem lista de unidades/conversas, histórico da unidade e histórico geral. Troca de visualização acontece dentro de um único `ChatWindow`, com transição de 240 ms e botão Voltar fixo fora da rolagem. Apenas a confirmação de exclusão utiliza o modal adicional já existente. `AdminReplyComposer`, `MessageHistory`, `MessageDeletion` e o compositor idempotente são reutilizados pela central e pela rota antiga.

Contatos são unidades de acesso, não identidades individuais inventadas. Unidades ativas com membros permanecem disponíveis mesmo sem atividade. Conversas históricas com atividade continuam disponíveis. Ordenação é pela última atividade real, com desempate estável pelo ID da unidade; itens sem atividade vêm depois. Os contadores consideram apenas entradas não lidas. Abrir a lista não registra leitura porque as bolhas não estão renderizadas nela.

Se não existe mensagem recebida que sirva de âncora, iniciar recado na unidade utiliza o `MESSAGE_SEND_TO_GUESTS` canônico com os membros daquela unidade, audiência FAMILY e sem anúncio geral, somente sob a capacidade nova. Se há uma mensagem recebida, utiliza `MESSAGE_REPLY`; o destinatário não é aceito do frontend.

## Convidado e identidade

O histórico é único e cronológico: mensagens gerais, particulares, familiares, respostas e legado **já autorizado pelo servidor**. Foram removidos abas, descrição técnica e seletor “Quem está enviando”. Nenhum alcance histórico foi ampliado ou reclassificado.

A autenticação atual vincula `invitation_sessions` à unidade; o nome usado no login e o nome escolhido no Perfil não são identidade individual persistida/autenticada nesse contrato. Mensagens novas enviam `sender_guest_id: null` e recebem a unidade da sessão no servidor. Não se usa primary_guest, primeiro membro nem cache `identity:` como autoria. Mensagens antigas com remetente declarado continuam preservadas como histórico, sem transformar esse dado em prova de autenticação individual.

Para o convidado: GENERAL = “Felipe & Laís para todos”; FAMILY = “Felipe & Laís para sua família”; INDIVIDUAL/PRIVATE = “Felipe & Laís para você”; LEGACY/ausente = “Felipe & Laís”, sem alcance inventado. Mensagens próprias novas representam a família/unidade. Para o administrador, suas mensagens identificam “Felipe & Laís”, com destino indicado pela conversa selecionada.

Responder a um aviso geral continua sendo um `MESSAGE_SEND` privado da própria unidade. Não se cria vínculo com o aviso original que o schema não armazena. O aviso geral permanece geral; outras famílias não recebem a resposta.

Datas usam `dd/mm/aaaa, hh:mm`, sem segundos, sempre em `America/Sao_Paulo`. Ordenação usa o instante completo, incluindo segundos/milisegundos, e ID para desempate. Recibos continuam por administrador ou unidade; a versão antiga mantém a semântica compartilhada histórica, sem inventar recibos por usuário.

## UX, entrega e falhas

`SendMessageButton` fornece círculo de 48 px, ícone da biblioteca existente, loading, disabled, foco, tooltip acessível no hover/teclado e interação de 180 ms. Abertura/fechamento do chat seguem 300/200 ms; bolhas entram em 220 ms; movimento reduzido remove esses efeitos. X não tem borda/fundo permanente, mantém 44 px de toque e foco visível. Safe areas e ajuste por visualViewport/teclado permanecem.

O histórico rola para o final ao abrir e após mensagem própria nova. Mensagens recebidas não interrompem alguém lendo mais acima. A leitura só ocorre sobre bolhas realmente visíveis (60% por 400 ms, documento visível, confirmação remota); abrir o balão não lê todo o histórico. Modo nativo conserva a ação manual.

“Sincronizado com sucesso.” é suprimido **apenas nos compositores de chat**. Fila, idempotência, erro, conteúdo pendente e informações reais da outbox permanecem. O retry consulta a remoção da própria mutation: uma operação posterior ainda falhando não transforma o envio confirmado em falha nem gera uma nova cópia. Pendências anteriores com remetente declarado reutilizam o mesmo UUID/payload, sem reescrever autoria ou descartar a fila. Confirmação externa não é inventada; estado por mensagem administrativa utiliza os jobs associados quando disponíveis. Cancelamento/exclusão não recolhe e-mail ou WhatsApp entregues, não apaga conversa e preserva auditoria, recibos e jobs admitidos/concluídos. A proteção de projeção histórica ambígua continua no servidor e sua rejeição permanece visível na confirmação.

## Produção: passos ainda pendentes

1. Conferir os contratos efetivos, reconciliar o registro histórico e fazer backup/cópia isolada. Não usar develop nem aplicar seed. Não reaplicar migrations históricas já representadas por contratos existentes.
2. Revisar e aplicar posteriormente **somente** `20261014171048_messaging_conversations.sql` seguindo `docs/messaging-conversations.md`, com autorização específica. Nenhuma migration nova foi necessária nesta refatoração; a anterior não foi editada.
3. Verificar `app_snapshot.capabilities.messaging_v2`, permissões, recibos, resposta e exclusão em execução controlada. Até isso ocorrer, os compositores novos e a exclusão dependentes ficam protegidos; envio legado permanece disponível pela rota avançada.
4. A atualização de `dispatch-notifications` preparada no commit anterior permanece uma publicação remota separada e pendente; não foi modificada nem publicada nesta tarefa. Agendamentos continuam exigindo worker/providers verificados e o flag específico do evento, conforme a documentação anterior. Este trabalho não habilita flags ou capabilities remotas.

Não foram executados `apply_migration`, SQL de escrita, deploy de Edge, alteração de secret, política, permissão ou dado de produção. Somente testes descartáveis locais escrevem dados e aplicam migrations de teste.

## Validação

O E2E de persistência em `database-admin.spec.ts` usa o navegador com RPCs reais em PostgreSQL descartável: mensagem da sessão familiar sem remetente arbitrário, resposta administrativa, reload em outro navegador, bloqueio de outra unidade, aviso geral, resposta privada, exclusão geral/particular e recuperação após reload. O transporte/Auth de teste é controlado; a persistência, RLS e RPCs são reais. Não equivale a entrega por provider de produção.

A suíte SQL anterior mantém upgrade, RLS, isolamento entre eventos/unidades, leitura por administrador/unidade, concorrência e idempotência. E2E cobre fallback sem capability, erro de exclusão sem falso sucesso, leitura apenas visível, offline/reconexão, navegação sem mudança de rota, mesma janela, canais, foco, Escape, Informações e regressões gerais. Mobile é em Chromium com viewports/teclado simulados, não Android/iPhone físicos ou Safari.

## Resultados locais

- 293 testes unitários passaram.
- 172 E2E da suíte completa passaram; 14 cenários focados revalidaram os ajustes finais e três cenários adicionais (retry isolado, mensagem histórica selecionada e teclado administrativo). São 175 cenários únicos cobertos.
- PostgreSQL: suíte histórica, upgrade, RLS, isolamento, concorrência, exclusão e idempotência passaram.
- 59 testes de Edge Functions e verificação Deno passaram; seu código permaneceu intacto.
- Lint, TypeScript, build/export e validação nativa PWA/worker/assets/caches privados passaram.
- Inspeção visual em 320, 375, 390, 768 e 1280 px: chat único, lista administrativa, conversa e envio geral; Informações validada com o bloco solicitado ausente.

## Implantação no baseline efetivo de PROD

A aplicação direta da migration original não é o roteiro autorizado para o baseline remoto divergente. Consulte [Compatibilização de produção](messaging-production-compatibility.md): instalador incremental completo, pré/pós-validação, prova de equivalência, ledger específico e contingência. Nenhum desses passos remotos foi executado por este trabalho.
