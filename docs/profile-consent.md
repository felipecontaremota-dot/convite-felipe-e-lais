# Perfil: contato e revogação

Antes, o Perfil alterava quatro autorizações independentes em `guest_contacts`.
Agora, `communications_revoked` é um bloqueio global durável separado dessas
autorizações. Marcar bloqueia os quatro canais; desmarcar remove o bloqueio,
restaurando exatamente os canais autorizados antes, sem conceder canais novos.
Os quatro valores anteriores nunca são apagados pela revogação.

A migration incremental 008 adiciona o bloqueio com default false, sem alterar
os consentimentos ou contatos antigos. `CONTACT_UPDATE` mantém os quatro campos
do banco quando recebe o novo controle, independentemente de valores enviados
por um snapshot antigo/manipulado. Contatos ainda inexistentes mantêm o padrão
anterior: IN_APP autorizado, canais externos não autorizados. Chamadas legadas
sem o campo novo continuam editando consentimentos individuais, mas nunca
removem um bloqueio global existente. Receipts, locks, autorização por integrante,
`consent_changed_at` e o trigger de auditoria permanecem em funcionamento.

O dispatch verifica o bloqueio antes de qualquer provider, além do consentimento
de cada canal. RLS/snapshot também respeitam o bloqueio para mensagens internas.
No acesso familiar compartilhado, conteúdo destinado a outro integrante
autorizado continua disponível à família. Avisos IN_APP gerais só aparecem se
há ao menos um integrante autorizado naquela unidade. Dados do evento e
mensagens escritas pelos convidados permanecem disponíveis.

Revogar desativa tokens de push e impede `PUSH_REGISTER`. Remover a revogação
não concede permissão nativa nem reativa tokens. O fluxo de ativação continua
exigindo consentimento push previamente autorizado, salvo e sem revogação, além
da permissão do aparelho. Nenhuma chamada ao sistema operacional ocorre pelo
simples desmarcar do checkbox.

O envio administrativo do convite de acesso (`send-invitations`) permanece
um fluxo separado, sem gate de consentimento, conforme seu contrato existente.
Entregas já aceitas por providers não podem ser canceladas retroativamente.

A máscara do Perfil é `(62) 9 9999-9999`, limitada a 11 dígitos na edição.
Números brasileiros legados com +55 são apresentados sem o prefixo; se não forem
editados, o código de país é preservado ao salvar (somente dígitos). O backend
continua normalizando contatos formatados. Não há migração de números.
Não consultamos registros de produção: a compatibilidade é verificada com
fixtures e os contratos versionados.

A fila projeta a revogação offline por integrante, preservando também as
permissões anteriores. O bloqueio no servidor passa a valer após sincronização.
Offline/erro não são convertidos em sucesso. Apenas a confirmação online do
Perfil apresenta `Salvo com sucesso.`; demais telas preservam seu feedback.

Quando a publicação for autorizada: aplicar 008 e publicar
`dispatch-notifications` com o novo gate antes de publicar o frontend.
Como o merge na main aciona GitHub Pages, preparar o backend antes desse merge. Não é necessário publicar outras Functions.
Testes SQL cobrem instalação limpa e preservação de dados no upgrade 007 → 008.
Nenhuma dessas ações de produção foi realizada nesta tarefa.
