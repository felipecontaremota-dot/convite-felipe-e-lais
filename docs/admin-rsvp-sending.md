# RSVP e controle individual de envio

## Experiência compartilhada do convidado

`presenceContent.ts` define os três textos aprovados e suas partes. `RsvpScreen.tsx` os renderiza tanto em Presença quanto no modal da Home: somente `eu vou`, `Não vou` e `Não sei ainda` recebem negrito, sublinhado e, respectivamente, `#03ab00`, `#ff0022` e `#ffb700`. O restante conserva a cor do estado original e peso normal; bordas, fundos, seleção, conclusão, reações e campos continuam no fluxo compartilhado.

## Quatro escolhas administrativas, um registro de RSVP

A tag em Convidados reutiliza o `Select` existente, com variante compacta, carregamento, bloqueio de múltiplos comandos e foco nativo. Os quatro estados lógicos preservam o modelo já instalado:

| Escolha    | rsvps.status | responded_at     |
| ---------- | ------------ | ---------------- |
| Pendente   | PENDING      | NULL             |
| Confirmado | CONFIRMED    | Data da resposta |
| Não irá    | DECLINED     | Data da resposta |
| Talvez     | PENDING      | Data da resposta |

`admin_action/GUEST_RSVP_SET` exige um administrador do evento, confere estado/data esperados e atualiza a mesma linha utilizada pelo convidado. Preserva `dietary` e `note`, registra `source=ADMIN`, mantém os triggers de planilha e segue a revogação de QR do fluxo original ao sair de confirmado. Não cria ingressos, check-ins, mensagens ou reações. Escolher o estado atual não grava nem gera auditoria adicional.

A auditoria explícita registra evento, pessoa, administrador, estado anterior, próximo estado e horário. O próprio convidado continua respondendo pelo fluxo normal e pode alterar a resposta posteriormente. O snapshot é atualizado após persistência; o mecanismo existente consulta novamente a cada 30 segundos enquanto ativo, ao retornar ao navegador e no recarregamento. Formulários sem edição acompanham respostas remotas; rascunhos em edição são preservados.

## Controle de envio por pessoa

A única fonte dos novos indicadores é `guest_invitation_status(event_id, guest_id)`: `sent`, origem `MANUAL/EMAIL`, administrador e data de atualização. Ausência de linha significa **não enviado**. A tabela tem RLS e somente leitura para administradores autenticados; escritas diretas são negadas. A RPC administrativa valida `auth.uid()` e o papel no evento. Os snapshots dos convidados e do cerimonial não recebem o marcador.

`GUEST_INVITATION_SENT_SET` marca/desmarca uma única pessoa. Não copia links, envia e-mail, muda RSVP, permissões, nome, PIN ou unidade familiar. O botão fica imediatamente antes de copiar link e usa tooltip, estado acessível e ícones distintos. Sucesso é informado somente após persistir e atualizar o snapshot, usando o toast existente sem expandir a linha.

A migration importa somente destinatários comprovados em `invitation_deliveries` com `status=sent` e `sent_at`, incluindo apenas os aliases individualmente registrados em `invitation_delivery_members`. Não usa `invitations.sent_at`, ativação, cópia de link ou RSVP para presumir envio. O levantamento somente leitura anterior à implantação encontrou 29 recibos e 16 pessoas distintas comprovadas. Dados de envio anteriores permanecem intactos.

Novos recibos confirmados e novos destinatários registrados em um recibo deduplicado atualizam a respectiva pessoa. Repetir a conclusão de um recibo já concluído não desfaz uma desmarcação manual. Alterações de família não propagam marcações entre seus membros.

## Painel e filtros

- **Na lista**: mesmo total anterior de pessoas e mesma navegação para Convidados.
- **Convidados**: indicador calculado exatamente como `Na lista − Convites não enviados − Não irão`, em `dashboardDetails`, fonte compartilhada dos contadores e listas. O modal lista pessoas com convite enviado e sem recusa de presença.
- **Convites não enviados**: pessoas não marcadas, no mesmo escopo de Na lista.
- A fórmula inclui cadastros com unidade inativa e não é limitada artificialmente a zero. Uma pessoa com convite não enviado e RSVP negativo é descontada duas vezes: o modal explicita o indicador, a quantidade real de registros e a sobreposição, sem excluir registros elegíveis para forçar igualdade.
- Confirmados, Não irão, Pendentes e Talvez irão particionam o mesmo conjunto de pessoas, distinguindo resposta indefinida de ausência de resposta.
- Filtros de envio e dos quatro estados de presença usam os mesmos dados persistidos. Não há vínculo automático entre RSVP e envio. O filtro Enviados permanece um filtro de envio; o card Convidados combina envio e RSVP pela fórmula acima.
- O seletor RSVP é a última tag textual antes dos ícones (envio individual antes de copiar link). A variante compacta compartilha o tamanho visual da Tag, sem seta ou espaço lateral reservado, preservando o select nativo, cores e foco acessível.

## Segurança e implantação

A migration incremental copia os wrappers anteriores para funções internas sem renomear seus OIDs públicos e delega todas as ações anteriores. Os novos helpers têm `search_path` fixo e execução revogada de PUBLIC, anon, authenticated e service_role. Nenhuma política existente é enfraquecida. Não há alteração de autenticação, Edge Functions, integrações Resend ou da identificação do responsável familiar.

Validar antes de implantar: `npm test`, `npm run lint`, `npm run typecheck`, `npm run test:db`, `npm run test:e2e`, `npm run build:web` e `npm run test:export`. O teste de upgrade usa PostgreSQL descartável, recibos anteriores à migration, todas as transições de RSVP e no-ops, isolamento por evento, RLS, recusas de autorização e regressões dos wrappers de perfil, link familiar, mensagens e padrinhos.

## Implantação do banco

Migration `20261021161455_admin_guest_rsvp_sending.sql` aplicada no Supabase PROD após validação isolada. Foram inicializadas 16 marcações comprovadas de envio, sem modificar RSVPs existentes. Postflight confirmou RLS ativa, ausência de leitura pública e bloqueio de escrita direta pelo cliente.

## Arquivos desta entrega

- `docs/admin-rsvp-sending.md`
- `playwright.config.ts`
- `scripts/test-admin-guest-status.ts`
- `scripts/test-db.sh`
- `src/components/adminUi.tsx`
- `src/features/admin/HomeScreen.tsx`
- `src/features/admin/dashboard.ts`
- `src/features/guests/AdminGuests.tsx`
- `src/features/guests/GuestAdminControls.tsx`
- `src/features/guests/adminDomain.ts`
- `src/features/guests/adminGuestStatus.ts`
- `src/features/rsvp/RsvpScreen.tsx`
- `src/features/rsvp/presenceContent.ts`
- `src/lib/AppProvider.tsx`
- `src/repositories/demo.ts`
- `src/theme/feedback.ts`
- `src/types/domain.ts`
- `supabase/migrations/20261021161455_admin_guest_rsvp_sending.sql`
- `tests/admin-dashboard.test.ts`
- `tests/admin-guest-prepare.sql`
- `tests/admin-guest-status.test.ts`
- `tests/admin-guest-verify.sql`
- `tests/e2e/admin-dashboard.spec.ts`
- `tests/e2e/admin-guest-controls.spec.ts`
- `tests/e2e/countdown-calendar.spec.ts`
- `tests/e2e/home-content.spec.ts`
- `tests/e2e/premium-fx.spec.ts`
- `tests/e2e/workflows.spec.ts`
- `tests/presence-content.test.ts`
- `tests/support/postgres.ts`
