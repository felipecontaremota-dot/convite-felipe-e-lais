# Contador e agenda do casamento

## Contador da Início

O contador usa o `event.starts_at` existente, com timezone obrigatório, recalculando a diferença entre esse instante e `Date.now()` a cada segundo. O instante configurado de 15/12/2026 às 16h em Goiás é 15/12/2026 às 19h UTC (`America/Sao_Paulo`, UTC−03). O timezone do dispositivo não define o alvo. Há atualização imediata no retorno de AppState, foco e visibilidade da página. O intervalo e os listeners são removidos na desmontagem.

Mostra dias/hrs/min/seg, sem números negativos; no instante do casamento passa a “Chegou o nosso Sim. ❤️”. A Home usa “· Às 16h”; os demais textos não foram alterados.

## Adicionar à agenda

A ação aparece na ficha de quem confirmou presença, depois de terminar o salvamento, e permanece disponível ao retornar à Presença. Respostas negativas ou indecisas não oferecem a ação. Uma resposta salva offline utiliza a fila existente; calendário não faz parte da sincronização nem altera RSVP. Fechar o seletor ou cancelar no calendário não desfaz a confirmação.

O seletor usa o modal existente. Oferece Google Agenda e uma alternativa para o dispositivo:

- Web/desktop/PWA: arquivo `.ics` UTF-8 com título, início UTC, localização e UID estável do evento. A importação depende do calendário instalado e pode exigir abrir/importar o arquivo baixado; não há inserção automática. Google Agenda abre uma aba externa com `noopener,noreferrer`, sem integração OAuth. A própria Google pode exigir login para salvar no serviço.
- Android nativo: `expo-calendar/legacy.createEventInCalendarAsync` abre o editor do sistema por ação explícita, sem listar calendários nem pedir acesso a seus dados. O usuário escolhe calendário e confirma/cancela.
- iOS nativo 17+: o mesmo método abre o editor EventKit. Versões anteriores do iOS exigem acesso mais amplo para esse método; não solicitamos essa permissão. Nesses aparelhos o app orienta usar Google Agenda ou o navegador para baixar `.ics`.
- iPhone no navegador/PWA: Google Agenda ou `.ics`; a importação no Apple Calendar varia conforme navegador e versão do sistema. A abertura real em aparelhos físicos precisa ser conferida antes da distribuição. No app nativo iOS 17+ há editor direto.

É utilizada a API oficial exportada em `expo-calendar/legacy`, compatível com o SDK 57. A API nova baseada em objetos pode exigir consulta a calendários; o método de UI escolhido evita isso. Não é usado o export depreciado do módulo principal, que lança erro no SDK 57.

Dados: título “Casamento Felipe & Laís”, início de `event.starts_at`, nome e endereço de `event.venue_name`/`event.address`, com Villarejo Eventos como fallback do nome. Não são incluídos nome de convidado, senha, sharing_code, QR ou credenciais.

Não há horário de término configurado. Pelo RFC 5545, o `.ics` omite DTEND/DURATION. Google Agenda e editor nativo recebem início e fim iguais (duração zero), pois suas interfaces utilizam um intervalo. Isso não afirma a duração da cerimônia; o usuário poderá ajustar o evento no editor. O calendário pode sugerir uma duração própria; o usuário deve conferir no editor. O aplicativo não verifica se o evento foi efetivamente salvo pelo usuário.

## Publicação e validação

Não há migration, alteração de Supabase ou nova Edge Function. A publicação Web segue o workflow existente, após revisão e merge. O módulo `expo-calendar` foi adicionado às dependências; apps nativos precisam de um novo build com autolinking para disponibilizar o módulo. Não há chamada a APIs de solicitação de permissões, alteração manual de secrets ou publicação automática nesta tarefa.

Testes verificam cálculo, segundos, timezone diferente no navegador, avanço de relógio sem decrementos acumulados, visibilidade/foco, reload, zero, layouts mobile/desktop, confirmação independente, ausência da ação em respostas negativas/indecisas, parâmetros Google, download/conteúdo ICS e contrato do editor nativo. A UI física Android/iOS e importação em calendários reais não são comprovadas por exports ou mocks.
