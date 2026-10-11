# Início, Convites e Local

A nova apresentação usa diretamente `assets/branding/icon.png`, sem duplicação. As rotas `/ingressos` e `/como-chegar`, o cálculo do contador, a saudação, o RSVP e as credenciais individuais permanecem nos contratos existentes.

A abertura de Convites mantém a primeira emissão automática sem regeneração. Credencial existente neste ou em outro dispositivo exige confirmação para substituição. Cancelar/Escape não chama a emissão. Se o snapshot estiver desatualizado e uma credencial já existir, a emissão sem regeneração é rejeitada pelo backend, sem invalidá-la. O modal reutiliza a infraestrutura existente de foco e bloqueio durante execução.

Local apresenta Google Maps e Waze pelos links HTTPS existentes. Uber reutiliza o universal link já existente `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=…`, com fallback web do serviço. Referência: https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links . A consulta atual à documentação foi bloqueada pelo proxy do ambiente (HTTP 403); não foi validada abertura em aplicativos físicos.

Não há contrato público de destino preenchido da 99 verificado nesta tarefa. A opção 99 usa o compartilhamento do sistema/navegador; sem Web Share, copia o endereço. Não promete selecionar automaticamente a 99 nem preencher sua corrida e não utiliza esquema inventado. O usuário pode compartilhar com os aplicativos disponíveis ou colar o endereço.

Não foram adicionadas migrations, alterações Supabase, QR familiar ou check-in familiar. Nenhum envio, merge ou deploy foi realizado.
