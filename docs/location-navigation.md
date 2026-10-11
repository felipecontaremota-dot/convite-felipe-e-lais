# Localização do casamento

A Tela Como chegar usa exclusivamente `venue_name`, `address`, `latitude`, `longitude` e `gps_url` do snapshot do evento. Não há novo endereço, alteração da configuração ou migration. O endereço cadastrado mantém a prioridade anterior; coordenadas válidas são utilizadas quando ele está ausente. O link GPS HTTPS configurado permanece como opção explícita.

## Comportamento por plataforma

- **Web/PWA, inclusive Android e iOS:** “Abrir localização” apresenta os links explícitos para o GPS configurado, Google Maps, Waze e Apple Maps, conforme os dados disponíveis. O navegador pode encaminhar esses links HTTPS ao aplicativo associado ou oferecer acesso pelo navegador. O app não enumera programas instalados nem promete um seletor universal do sistema, pois isso não está disponível de forma portátil na Web.
- **Android nativo:** uma única chamada a `Linking.openURL` com `geo:0,0?q=DESTINO` permite ao sistema resolver o aplicativo de mapas padrão ou exibir seu seletor, dependendo da configuração do aparelho. Não há filtro que obrigue Google Maps.
- **iOS nativo:** uma única abertura do link oficial `https://maps.apple.com/?daddr=DESTINO` usa a integração Apple Maps/navegador. “Escolher outro mapa” também disponibiliza as alternativas explícitas, sem detectar apps instalados.
- **Falha na abertura nativa:** a tela disponibiliza a mesma lista HTTPS. Não tenta abrir vários aplicativos silenciosamente. Quando só existe GPS configurado, essa lista oferece esse link sem inferir endereço a partir dele. Sem destino válido, a ação fica desabilitada.

Os links são ações acessíveis por teclado e mantêm os componentes visuais existentes. Não há integração nova com Uber/99. O mapa de prévia existente permanece inalterado. A configuração administrativa conserva seu comportamento anterior; a escolha de mapas é específica da tela do convidado.

Referências dos formatos utilizados: [Android geo](https://developer.android.com/guide/components/intents-common#Maps), [Apple Map Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html), [Waze Deep Links](https://developers.google.com/waze/deeplinks).

## Identificação visual do local

O anexo visível nesta tarefa é o símbolo “V”, mas seu arquivo original não foi disponibilizado no filesystem. Nenhuma imagem alternativa ou placeholder foi adicionada. Para incluir o asset exato, ainda é necessário receber o arquivo original ou uma URL direta para ele. Não há alteração artística nem imagem pesquisada.

## Rodapé

A única alteração global é a frase compartilhada: “Com carinho, Felipe & Laís · Seus dados são usados para organizar o casamento.” Os controles de consentimento e suas regras permanecem no Perfil.
