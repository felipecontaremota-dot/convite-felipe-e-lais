# Início do convidado

Base: main após a reconstrução controlada (merge #24). Escopo: conteúdo da Início; nenhuma alteração de autenticação, RSVP, Perfil, ingressos/QR, links ou envio.

## Fontes existentes

- Unidade: `invitations.kind` (INDIVIDUAL/FAMILY), não quantidade de integrantes.
- Responsável: `primary_guest_id`, procurando somente entre os integrantes daquela unidade; nunca inferido pela ordem.
- Integrantes e RSVP: snapshot da sessão existente; registros por guest_id, com a projeção otimista já existente. A Início apenas lê.
- Contador: `event.starts_at` e o cálculo original de `weddingCountdown`, atualizado a cada minuto; somente o texto exibido na Início recebe aspas em "Sim".

## Saudação

Individual: MASCULINE → Bem-vindo; FEMININE → Bem-vinda; NULL/ausente → Boas-vindas. Não se infere gênero pelo nome. FAMILY usa nome do responsável + "e família"; sem responsável, usa o nome da família.

Não existia campo confiável no baseline. A migration `202610110007_home_greeting.sql` adiciona `guests.greeting_form`, opcional, restrito a MASCULINE/FEMININE. O formulário **Adicionar/Editar convidado** mostra logo abaixo de Nome a lista **Gênero → Selecione, Masculino, Feminino**, sem opção Neutro. Selecione grava NULL e mantém o fallback de Boas-vindas. O campo é persistido atomicamente pelo fluxo administrativo: a migration preserva a implementação integral de `admin_action` como função privada e cria um wrapper com a mesma assinatura que valida/persiste somente `greeting_form` para GUEST_CREATE/GUEST_UPDATE; as demais ações são delegadas sem alteração. O snapshot existente já serializa convidados e transporta o campo. Nenhuma alteração em enum RSVP, credenciais, sessões ou registros anteriores. Não reaplicar as antigas fixtures 007/008. Migrations 001–006 continuam intactas. Esta migration não foi executada em produção.

## Presença — regra aprovada

CONFIRMED → confirmação; DECLINED → ausência; PENDING sem responded_at → não respondeu; PENDING com responded_at → ainda decidindo. Não existe MAYBE e ele não foi introduzido.

Família: mensagem familiar somente por unanimidade de situação, incluindo a distinção de PENDING. Situações diferentes recebem contagens reais, com plural e separação por " · "; ausentes do snapshot/RSVP são tratados como sem resposta. A resposta do responsável não é propagada. Nenhum RSVP familiar paralelo é criado. Enquanto offline, uma resposta explícita pendente na fila existente também é reconhecida pela Início, sem inventar responded_at nem modificar AppProvider/Presença.

## Navegação e validação

Informar contatos mantém /perfil; Ver meus convites mantém /ingressos. Layout, cores, componentes e demais cards foram preservados.

Unitários cobrem saudação e quatro situações derivadas de RSVP, unanimidade/divergência/isolamento. E2E cobre contador dinâmico, aspas, conteúdo, navegação e viewport mobile. SQL valida NULL/registros antigos, constraint, criação/edição por RPC, leitura pelo snapshot, isolamento de credenciais e preservação das RPCs não relacionadas. E2E verifica lista sem Neutro e persistência no cadastro/edição.

O harness normal continua descobrindo todas as migrations. A reconstrução histórica usa um banco isolado separado com 001–006; o upgrade da nova migration é testado depois nesse banco separado. O runner operacional de reconstrução continua restrito ao baseline e não deve ser usado para implantar esta melhoria.
