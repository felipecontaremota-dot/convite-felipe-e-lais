# Área do convidado e convites

## Modelagem e política

A migration `202610100007_guest_invitations.sql` é incremental sobre 006. Não altera 001–006, links/senhas, sessões verificadas, histórico de consentimentos ou QRs individuais existentes.

- `guests.salutation`: `NEUTRAL` (legados), `MALE` ou `FEMALE`, editável no cadastro administrativo. Não há inferência pelo nome.
- `invitations.primary_guest_id` continua sendo o responsável explícito. Constraints diferidas verificam que pertence à unidade. Um campo permite no máximo um responsável; a edição existente transfere responsabilidade sem recriar a família.
- `invitation_sessions.identified_guest_id`: identidade do integrante no servidor. A escolha exige pertencer à unidade da sessão. INDIVIDUAL usa seu único titular automaticamente; FAMILY exige identificar-se no Perfil antes de visualizar QRs.
- Conforme a política escolhida pelo usuário, mantém-se a confiança do link/senha familiar compartilhado. Selecionar um nome **não é autenticação individual**: quem conhece a senha familiar pode escolher qualquer integrante. A RPC e o snapshot aplicam os poderes correspondentes à identidade selecionada. Prova individual exigiria outra política/credencial.
- Responsável: QR familiar e QRs individuais dos integrantes. Membro: somente seu próprio QR. ADMIN pode emitir/regenerar; CEREMONIALIST pode resolver e validar para check-in.

## RSVP e check-in

`MAYBE` distingue uma resposta explícita “Ainda decidirei” de `PENDING`/sem resposta. Registros históricos não são reescritos. Uma resposta legada APP/PENDING com responded_at é apresentada como decisão adiada, pois essa era a semântica da opção anterior; PENDING sem resposta continua pendente. A atualização reutiliza a linha única de RSVP e nunca emite/revoga QR ou cria check-in.

`checkins` mantém pessoa, horário, operador e método QR/MANUAL, independentemente do RSVP. Uma pessoa com NO/MAYBE/PENDING pode comparecer. A busca manual existente também inclui essas pessoas.

`resolve_checkin_ticket(event, token)` é exclusiva de ADMIN/CEREMONIALIST. Retorna tipo, título e integrantes elegíveis com `selected=true` e `checked_in`. QR individual resolve uma pessoa; familiar resolve os membros atuais da unidade ativa. O contrato prepara a futura seleção do cerimonialista; não foi construído um novo painel/scanner familiar nesta tarefa.

`CHECKIN_FAMILY` recebe `token_hash` e `guest_ids`, valida o conjunto contra a família, bloqueia a credencial e convidados em ordem estável, registra somente selecionados e guarda o resultado no receipt na mesma transação. Unique por evento/pessoa e receipts evitam duplicações, inclusive entre conexões. `CHECKIN_CREATE` preserva o contrato individual e a idempotência, sem depender de RSVP.

Um novo check-in **individual por QR** de membro gera `guest_checkin_notices` para o responsável atual. Unique por check-in impede repetição. O aviso não modifica RSVP, não vira announcement geral e não gera e-mail/push/WhatsApp. Snapshot/RLS restringem o destinatário; opt-out oculta esses avisos. O horário/operador original é preservado em releituras.

## QRs

A tabela `family_qr_credentials` contém somente hash SHA-256 da credencial aleatória de 32 bytes, com revogação e índice único de credencial ativa por família. QRs individuais continuam em `qr_credentials`.

Conteúdo visual: `wedding://family/<token>` ou `wedding://ticket/<token>`. Nenhum dado pessoal é codificado. Tokens são retornados somente à identidade autorizada e guardados pelo cache de convites já existente para uso offline. Sem token disponível neste aparelho, uma credencial existente não é recuperada/invalida automaticamente: o usuário pode autorizar “Gerar novo convite”.

Regeneração exige modal Confirmar/Cancelar, evita dupla submissão, revoga o token anterior e atualiza o QR. Rotação familiar não afeta individuais e vice-versa. RSVP não é requisito de emissão. Unidades INDIVIDUAL nunca recebem QR familiar.

## Perfil e localização

O checkbox `Revogar permissão de receber mensagens e notificações` grava `notifications_revoked` e os quatro consentimentos coerentes na mesma mutação. Registros legados mantêm flags anteriores e `notifications_revoked=NULL` até um salvamento explícito; não ocorre backfill silencioso. Marcar revoga todos, desmarcar/salvar reativa. Push ainda depende da permissão do sistema e registro do dispositivo. Auditoria existente de contatos permanece.

Máscara de celular compartilhada em `src/utils/phone.ts` e `mobilePhone.ts`: DDD + nove dígitos, limite durante digitação, armazenamento em dígitos, apresentação formatada. Sugestão de senha por últimos quatro dígitos foi preservada. Feedback de contato online: `Salvo com sucesso.`; offline mantém informação de sincronização pendente.

`Abrir localização` na área do convidado delega ao Share nativo em Android/iOS e Web Share em Web/PWA. Esses mecanismos oferecem os destinos compatíveis disponibilizados pelo sistema; não garantem que qualquer app específico esteja instalado ou apareça na lista. Web sem Share copia endereço/URL para abertura no app preferido. Não existe submenu próprio nem enumeração de apps. Google Maps explícito e copiar endereço permanecem. A ação administrativa de abertura direta foi preservada.

Imagem Villarejo pendente, pois não foi fornecida no workspace: colocar o original em `assets/venues/villarejo.png` e ativar o `require` indicado em `src/features/location/venueImage.ts`. O componente está preparado com 72px, círculo, `contain`, proporção preservada e label acessível. Nenhuma imagem aleatória/de terceiros foi incluída.

## Checklist do pedido

- Rodapé, saudação contextual sem heurística, RSVP humano/agregado e botões da Home atualizados.
- Contador: somente texto com aspas em “Sim”; algoritmo existente preservado, sem implementar nova refatoração de horas.
- Perfil: identidade na sessão, opt-out real, máscara/limite/canonicalização e feedback de salvamento.
- Localização: mecanismo por plataforma, fallback seguro, Google Maps/endereço separados; asset original único pendente.
- Presença: Irei/Não irei/Ainda decidirei, botão contextual, estado salvo e edição posterior.
- Feedback: somente após retorno confirmado online; erro preserva escolha/possibilidade de retry; formas animadas leves, sem emojis e com reduced motion Web/nativo.
- Convites: terminologia atualizada, texto antigo removido, cards familiar/individuais, poderes de responsável/membro, tokens opacos distintos, modal e rotação isolada.
- Check-in: contrato familiar/parcial e individual, transacional/idempotente, sem alterar RSVP; aviso privado único ao responsável.
- Mobile 390×844, modais com foco/Escape, labels, QR identificado por texto, estados desabilitados e ausência de overflow cobertos por E2E.
- Sem redesign geral, novo cronômetro, painel completo, template de e-mail, WhatsApp de produção ou mudanças no Resend.

## Após eventual merge

1. Conferir o projeto Supabase e que 001–006 estão aplicadas; aplicar somente 007 pelo fluxo de migrations após conferir a lista pendente.
2. Validar FAMILY/INDIVIDUAL, identidade/roles, RSVP, opt-out, emissão/rotação e contratos de check-in em ambiente autorizado.
3. Acompanhar o deploy Pages do frontend da main, mantendo variables e base path existentes. Atualizar builds nativos conforme o fluxo habitual do projeto.
4. Incluir a imagem original quando fornecida, em mudança revisada.

Nenhuma Edge Function nova/alterada precisa ser publicada para esta rodada. Nenhum secret novo é necessário. Não aplicar migrations, publicar Functions, alterar secrets ou fazer merge durante este PR.
