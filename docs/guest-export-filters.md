# Filtros de exportação administrativa

O botão Baixar lista de convidados abre uma seleção própria, independente da busca e do filtro da tela. Todos inclui integralmente os convidados do evento e é exclusivo. Sem seleção ou com resultado vazio, nenhum arquivo é gerado.

Os quatro vínculos utilizam `guests.group_label`. A presença reutiliza `adminRsvpStatus`: sem resposta é Pendente; PENDING com `responded_at` é Talvez. O envio utiliza exclusivamente `guests.invitation_sent`, sem inferir por cópia de link ou geração do convite. Padrinho/Madrinha exige `party_role` PADRINHO ou MADRINHA.

Opções de uma categoria são unidas por OU; categorias selecionadas são combinadas por E. Categorias vazias não restringem. A seleção percorre cada convidado uma vez, mantém o isolamento do evento e passa pela ordenação e projeção de colunas existentes. Contagem, Excel e PDF utilizam a mesma função `filteredGuestExportRows`.

O gerador Excel permanece existente, incluindo contatos como texto, links, senhas e as dez colunas. O PDF anterior estava desabilitado (Em breve); agora utiliza jsPDF e AutoTable, carregados apenas após a escolha do formato, com as mesmas dez colunas, orientação paisagem A3 e cores centralizadas. A escolha do formato é obrigatória antes da geração. Não há novas consultas, persistência, migrations ou alterações de permissões.

AdminModal e Toggle existentes fornecem apresentação, rolagem e interação. No desktop, três colunas com quatro opções; abaixo de 700 px, uma coluna rolável. A geração mantém a trava contra cliques duplicados e revalida o escopo autenticado antes do download.
