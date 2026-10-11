# Convites e entrada no evento

A migration `202610110009_family_tickets.sql` acrescenta credenciais familiares independentes. As migrations 001–008 permanecem intactas. `issue_ticket` e `/ingressos` mantêm seus contratos; os textos apresentados passam a usar “Convites”.

## Credenciais e autorização

- Link e senha do site continuam em `invitation_access`/`invitations`. Nenhuma emissão ou regeneração de QR chama `CODE_ROTATE`.
- QR individual: `wedding://ticket/<token>`, uma pessoa confirmada, `qr_credentials` existente.
- QR familiar: `wedding://family-ticket/<token>`, uma unidade FAMILY ativa, nova tabela `family_qr_credentials` e RPC `issue_family_ticket`.
- Tokens têm 256 bits aleatórios. O banco recebe apenas SHA-256; o token retornado fica no cache de convites já existente no dispositivo. Nenhum nome, senha ou link de acesso integra o QR.
- ADMIN pode emitir; GUEST pode emitir somente para sua unidade; CEREMONIALIST pode conferir/registrar entradas. Apenas ADMIN/CEREMONIALIST podem executar check-in.
- A sessão FAMILY continua compartilhada. `primary_guest_id` identifica o responsável cadastrado, não a pessoa utilizando o aparelho. Todos os aparelhos autorizados da família podem consultar seus convites; não há promessa de privacidade individual dentro dessa sessão compartilhada.

## Conferência e transação

Escanear nunca escreve RSVP ou check-in. A conferência familiar marca somente integrantes CONFIRMED ainda aguardados; presentes e não confirmados ficam identificados. O funcionário desmarca ausentes e confirma a lista exata. O servidor valida toda a seleção, credencial ativa e composição da família antes de inserir qualquer entrada.

`CHECKIN_FAMILY_CREATE` usa a fila existente, uma receipt por operação e resultado persistido. A transação compartilha a trava usada pela administração de membros, bloqueia os convidados em ordem e preserva a unicidade por evento/pessoa. Retry retorna o resultado original antes de revalidar dados mutáveis; duas conexões concorrentes não duplicam entradas. Pessoas já registradas são preservadas; ausentes podem entrar posteriormente individualmente ou por nova conferência familiar.

A chegada individual de outro integrante gera mensagem IN_APP para o responsável, com recipient explícito e auditoria `CHECKIN_NOTIFICATION`/`event_type: CHECK_IN`. Ela usa a caixa de mensagens existente e respeita `consent_in_app` e `communications_revoked`; não cria consentimento, push ou e-mail. Chegada do próprio responsável, conferência familiar e retries não criam essa mensagem. As regras de leitura existentes continuam valendo, inclusive o compartilhamento autorizado dentro da família.

## Regeneração

“Gerar novo convite” abre o modal acessível existente. Cancelar não chama a RPC nem altera o cache. Confirmar exige conexão e substitui somente a credencial selecionada. Falha mantém a cópia local do QR anterior e o modal disponível para nova tentativa. Se uma resposta se perder depois do commit da regeneração, aquele QR poderá já estar revogado no servidor; uma nova emissão exige outra confirmação online. Requisições simultâneas do mesmo dispositivo são consolidadas; uma confirmação durante a emissão inicial aguarda essa emissão antes de regenerar.

## Offline e conflitos

QRs previamente salvos permanecem disponíveis com credenciais conhecidas no cache. Sem conexão, o cerimonial pode registrar a seleção exata como pendente no próprio dispositivo. Ela só é definitiva depois da sincronização. A fila não acrescenta integrantes ao reconectar.

O servidor revalida a família, CONFIRMED e a credencial. Se alguém mudou de família/status ou o QR foi revogado, toda a operação familiar falha: nenhuma entrada parcial é commitada. O erro fica visível na fila; o funcionário deve conferir os dados atualizados e resolver/descartar conscientemente a operação conforme o fluxo existente.

Dois dispositivos offline não conhecem imediatamente as entradas ou revogações um do outro. A unicidade é garantida no servidor ao sincronizar. Um aparelho novo não recupera o token original a partir do hash; deve usar uma cópia do QR ou confirmar explicitamente a regeneração, que invalida aquela credencial nos demais aparelhos. Não se promete revogação instantânea enquanto o leitor estiver offline.

## Validação e publicação posterior

`test:db` executa instalação limpa e um upgrade isolado 008 → 009 com convidados, famílias, sessões, links/PINs, RSVP, QRs, consentimentos, mensagens e histórico existentes. Compara dados, snapshots e privilégios antes de exercitar as novas RPCs. Testes SQL cobrem isolamento, consentimentos, seleção inválida e rollback. E2E usa PostgreSQL real para modal, cache, offline, sincronização e entrada parcial; outro teste abre duas conexões PostgreSQL para concorrência.

Após a revisão e autorização, coordenar a aplicação da migration 009 **antes de liberar o novo frontend**. O merge na main dispara automaticamente o workflow de GitHub Pages; portanto, a implantação do banco precisa estar concluída antes dessa publicação. A 009 mantém os contratos usados pelo frontend anterior. Nenhuma Edge Function foi alterada e não há secrets novos. Nenhuma dessas ações de produção é executada por este PR.
