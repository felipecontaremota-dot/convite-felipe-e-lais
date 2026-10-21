# Indicadores e ações do painel

## Contagens

`dashboardDetails` é a fonte compartilhada dos indicadores e listagens.

- Convidados preserva exatamente `Na lista − Convites não enviados − Não irão`.
- Convidados da noiva e do noivo aplicam a mesma aritmética dentro das classificações individuais exatas `Convidado(a) da noiva` e `Convidado(a) do noivo`.
- As listas finais mostram pessoas marcadas como enviadas e sem recusa. Havendo dupla subtração, cada modal informa o indicador, o tamanho real da lista e a sobreposição; nenhum registro é descartado para forçar igualdade.
- Tags Familiares e outras classificações, além de pessoas sem classificação, não são inferidas como uma das duas origens. O campo é individual e escalar; não há atribuição simultânea às duas origens.
- Pendentes conta somente enviados sem resposta. O estado individual Pendente de uma pessoa não enviada permanece intacto.
- A consulta agregada inicial em produção encontrou 18 elegíveis pela noiva, 28 pelo noivo, 5 pessoas sem classificação e 10 com tags Familiares distintas das classificações solicitadas. Nenhuma sobreposição entre não enviado e recusado foi encontrada. Esses números são uma fotografia, não constantes do sistema.

## Tooltips

Todos os 14 indicadores possuem explicações em `dashboardTooltips.ts`. `MetricTooltip.web.tsx` oferece hover e foco, botão independente de ajuda de 44 px para toque, Escape, fechamento externo, posicionamento acima/abaixo e limite horizontal da viewport, transições discretas e movimento reduzido. A ação do card permanece independente da explicação.

As três descrições investigadas são:

- **Presentes:** “Total de itens ativos cadastrados no catálogo de presentes. Não indica presentes recebidos ou reservados.” Fonte: `snapshot.gifts.filter(g => g.active)`. O card permanece informativo, sem ação própria; a navegação Presentes continua existente.
- **Check-ins:** “Total de pessoas com entrada registrada no evento, por QR Code ou registro manual. Cada pessoa conta uma vez.” Fonte: `snapshot.checkins`, com unicidade `(event_id, guest_id)`. Reversões removem o registro. O card permanece informativo.
- **Famílias já ativadas:** “Total de famílias ativas cujo convite já teve o primeiro acesso validado com senha. Não indica envio nem confirmação de presença.” Fonte: convites ativos FAMILY com `first_activated_at`, preenchido no resgate autenticado do convite. O card permanece informativo.

## Reutilização e segurança

`useInvitationDelivery` extrai sem alterar o controlador já utilizado por AdminGuests: mesmos identificadores de requisição, reconciliação do histórico, retenção para retomada, bloqueio de operações conflitantes e caminho `AppProvider.sendInvitations → api.sendInvitations → send-invitations`.

`GuestInvitationActions` é usado tanto na tela Convidados quanto em todos os modais de pessoas. Reutiliza `ActionFeedbackButton`, `invitationActionOutcome`, `copyText` e `resolveAccessLink`. Não gera códigos nem senhas. Nenhum clique marca envio por antecipação: somente o mecanismo existente de recibo confirmado alimenta a marcação persistida.

Os controles são restritos a ADMIN no componente e no AppProvider; as permissões backend/RLS existentes permanecem intactas. Não há alteração de banco, migration, função remota, Resend, autenticação ou regra de RSVP. Os testes de e-mail usam interceptação e PostgreSQL descartável, sem enviar mensagens reais.

## Arquivos desta entrega

Criados:

- `docs/dashboard-cards.md`
- `src/features/admin/MetricTooltip.tsx`
- `src/features/admin/MetricTooltip.web.tsx`
- `src/features/admin/dashboardTooltips.ts`
- `src/features/guests/GuestInvitationActions.tsx`
- `src/features/guests/useInvitationDelivery.ts`
- `tests/e2e/dashboard-enhancements.spec.ts`

Modificados:

- `docs/admin-rsvp-sending.md`
- `src/features/admin/DashboardDetailsModal.tsx`
- `src/features/admin/HomeScreen.tsx`
- `src/features/admin/dashboard.ts`
- `src/features/guests/AdminGuests.tsx`
- `tests/admin-dashboard.test.ts`
- `tests/e2e/admin-dashboard.spec.ts`
- `tests/e2e/admin-guest-controls.spec.ts`
