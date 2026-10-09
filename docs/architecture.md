# Arquitetura

Expo Router fornece as rotas de uma única aplicação TypeScript estrita, executada por React Native em iOS/Android e React Native Web no navegador. A divisão `(public)`, `(guest)`, `(admin)` e `(ceremonial)` organiza a navegação; `Screen` aplica o guard visual. Autoridade real está nas RPCs/RLS do PostgreSQL.

`AppProvider` coordena autenticação Supabase, conectividade, snapshots TanStack Query, persistência por evento/usuário e fila. Não existe estado global de formulários: ficam nas telas. Snapshots são filtrados no servidor por papel para impedir que o cerimonial receba dados privados, mesmo ocultos na UI. Cache é uma cópia com a última autorização conhecida, não uma nova autorização. O demo tem repositório separado e nunca usa um service client.

`repositories/api.ts` adapta chamadas do app. A unidade de mutação é um UUID, tipo e payload; o servidor valida vínculo, papel e campos admitidos dentro da transação. `MutationQueue` serializa alterações de armazenamento para evitar perda durante flush/enqueue concorrentes. Falhas retêm o item, erro e tentativas. A fila para no primeiro erro para preservar ordem; o usuário pode tentar novamente ou descartar explicitamente no logout. RSVP é aplicado por ordem de chegada válida ao servidor, com auditoria.

As telas estão separadas em features por domínio (invitations, guests, rsvp, gifts, tickets, messages, notifications, location, admin, auth e checkin). Os arquivos GuestScreens/AdminScreens são somente barrels de export para as rotas. O domínio centraliza countdown, validações, permissões, QR/check-in, links de transporte, calendário e mapping da planilha. Componentes não chamam storage diretamente, salvo através dos adapters centralizados. Interfaces de armazenamento permitem trocar AsyncStorage por um driver persistente com criptografia/SQLite sem alterar a fila.

PostgreSQL é fonte de verdade. Mudanças de RSVP/check-in disparam a projeção Sheets em uma outbox na mesma transação. Providers externos não podem reverter a resposta de presença. Notificações são configuradas no banco; workers server-side usam leases, tentativas e idempotência. Um scheduler externo configura a periodicidade; não há envio real sem configuração explícita.

Decisões: convite é acesso compartilhado familiar, não conta individual; QR contém apenas token opaco; tokens brutos não são recuperados do servidor e regeneração é explícita; mudanças administrativas não são enfileiradas offline; vínculos são removidos ao rotacionar/bloquear códigos ou mover integrantes. Não há billing nem serviços pagos obrigatórios.

Web é SPA com fallback no hosting e PWA no export. Links universais dependem do domínio final e dos arquivos de associação Apple/Android, descritos em publicação. Os placeholders são tipográficos e não usam sprites ou arte do projeto removido.
