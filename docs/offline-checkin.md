# Consulta offline e confirmação de entrada

1. Faça login autorizado com conexão e abra **Dia do evento**.
2. Use **Preparar / atualizar cache offline** para salvar a base de consulta atualizada neste dispositivo.
3. O cerimonial recebe nomes, famílias ativas, classificações reais de padrinhos, RSVP, observações gerais/alimentares/de RSVP e entradas persistidas. Não recebe contatos, conversas, valores financeiros, senhas, links exclusivos ou hashes de credenciais QR.
4. Sem conexão, busque por nome/família e consulte o último estado conhecido. **Uma entrada nova exige confirmação do servidor.** O scanner fica indisponível offline; uma tentativa manual informa que é preciso conectar antes de confirmar. Nenhuma entrada local pendente recebe a tag Presente ou aumenta o contador.
5. Com conexão, o scanner extrai o token do QR existente e calcula SHA-256. O backend autentica o operador, valida evento, credencial não revogada, unidade ativa e RSVP confirmado e registra automaticamente. O token não é salvo em logs.
6. A entrada manual exige o modal **Deseja confirmar a entrada de [Nome]?**. Cancelar não envia mutação. Erro mantém o modal aberto; a repetição conserva o UUID para recuperar o resultado com segurança.
7. A confirmação e o horário vêm da tabela `checkins`, com método QR/MANUAL e usuário responsável. Os índices únicos existentes e o bloqueio transacional impedem duplicidade entre dispositivos. A auditoria e a projeção para Sheets existentes são preservadas.
8. Postgres Changes avisa dispositivos autorizados. Há também atualização periódica/foco e, na tela operacional visível e online, fallback de cinco segundos. Sem rede não é possível conhecer entradas registradas em outro aparelho.

A fila genérica preexistente continua atendendo os demais fluxos autorizados; registros antigos nela não são prova de entrada. A reconexão não inventa um novo registro de check-in pela interface operacional.

AsyncStorage mantém cache separado por conta/evento. Auth usa SecureStore no nativo e storage da origem no web. O cache operacional contém dados pessoais necessários ao evento, não é criptografado por esse driver e deve ficar em aparelho protegido e individual. Sair remove o cache da conta; a saída segura preserva o tratamento existente de pendências. Revogações só podem ser revalidadas com rede.

Web offline depende de primeiro acesso online, exportação com service worker e HTTPS. O shell e o cache operacional são separados. O worker e o manifest não foram alterados pelo Portal do Cerimonialista.
