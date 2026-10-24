import { Text } from "react-native";
import type { WeddingEvent } from "../../types/domain";
import { PartyParagraph } from "./PartyParagraph";
import { ceremonyCopy } from "./content";
import { PartyVenueAddress } from "./PartyVenueAddress";
import type { PartyRole } from "./types";
import { VenueLogo } from "../location/VenueLogo";
const text = {
  color: "#F4E6BD",
  fontSize: 18,
  lineHeight: 29,
};
const bold = { fontWeight: "700" as const };
export const emptyCouplesNote =
  "Estamos preparando um recado com carinho para você. Em breve, ele estará aqui. 💙";
export function PartyContent({
  page,
  event,
  note,
  role,
}: {
  page: string;
  event?: WeddingEvent;
  note?: string | null;
  role?: PartyRole | null;
}) {
  if (page === "dia")
    return (
      <>
        <Text style={[text, { textAlign: "center" }]}>
          Falta pouco para você estar conosco no Villarejo.
        </Text>
        <VenueLogo />
        <PartyVenueAddress
          event={event}
          style={[text, { textAlign: "center" }]}
        />
      </>
    );
  if (page === "traje")
    return (
      <>
        <PartyParagraph style={text}>
          O azul simboliza confiança, lealdade e a serenidade de um amor feito
          para durar. E não poderíamos escolher cor melhor para representar
          pessoas tão especiais em nossa história!
        </PartyParagraph>
        <PartyParagraph style={text}>
          Para deixar nosso grande dia ainda mais bonito e harmonioso,
          preparamos algumas orientações com carinho:
        </PartyParagraph>
        <PartyParagraph style={text}>
          💙 <Text style={bold}>Madrinhas:</Text> vestidos longos, em tons de{" "}
          <Text style={bold}>azul serenity ou azul-claro</Text>,
          preferencialmente lisos, sem estampas, com modelo e tecido de sua
          preferência.
        </PartyParagraph>
        <PartyParagraph style={text}>
          💙 <Text style={bold}>Padrinhos:</Text> terno{" "}
          <Text style={bold}>azul-marinho</Text>, camisa social branca, gravata
          em tom discreto e sapatos sociais, preferencialmente marrons ou
          pretos.
        </PartyParagraph>
        <PartyParagraph style={text}>
          Queremos que todos estejam elegantes, mas, acima de tudo, confortáveis
          para aproveitar cada instante!
        </PartyParagraph>
        <PartyParagraph style={text}>
          Mais do que a combinação das cores, o que tornará esse dia
          inesquecível será ter vocês ao nosso lado! 💙
        </PartyParagraph>
      </>
    );
  if (page === "cerimonia")
    return (
      <>
        <PartyParagraph style={text}>
          Preparamos cada detalhe desse dia com muito carinho e queremos que
          vocês estejam ao nosso lado desde os primeiros momentos! 💙
        </PartyParagraph>
        <PartyParagraph style={text}>
          <Text style={bold}>🕊️ Chegada:</Text> A data e o local você já guardou
          no coração, mas gostaríamos de te pedir que chegue com pelo menos 30
          minutos de antecedência ao horário da cerimônia, para que possamos
          organizar tudo com tranquilidade.
        </PartyParagraph>
        <PartyParagraph style={text}>
          <Text style={bold}>💍 Cortejo:</Text> Nossos padrinhos e madrinhas
          terão um lugar especial na entrada e durante a cerimônia. A ordem de
          entrada e os posicionamentos serão orientados pela equipe de
          cerimonial.
        </PartyParagraph>
        <PartyParagraph style={text}>
          <Text style={bold}>✨ Orientações:</Text>{" "}
          {ceremonyCopy(role).guidance}
        </PartyParagraph>
        <PartyParagraph style={text}>
          {ceremonyCopy(role).closing}
        </PartyParagraph>
      </>
    );
  return (
    <PartyParagraph style={text}>
      {note?.trim() ? note : emptyCouplesNote}
    </PartyParagraph>
  );
}
