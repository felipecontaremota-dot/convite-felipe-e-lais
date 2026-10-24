import { Text } from "react-native";
import type { WeddingEvent } from "../../types/domain";
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
}: {
  page: string;
  event?: WeddingEvent;
  note?: string | null;
}) {
  if (page === "dia")
    return (
      <>
        <Text style={[text, { textAlign: "center" }]}>
          Falta pouco para você estar conosco no Villarejo.
        </Text>
        <VenueLogo />
        <Text style={[text, { textAlign: "center" }]}>
          {event?.address ||
            "O endereço será informado aqui quando estiver confirmado."}
        </Text>
      </>
    );
  if (page === "traje")
    return (
      <>
        <Text style={text}>
          O azul simboliza confiança, lealdade e a serenidade de um amor feito
          para durar. E não poderíamos escolher cor melhor para representar
          pessoas tão especiais em nossa história!
        </Text>
        <Text style={text}>
          Para deixar nosso grande dia ainda mais bonito e harmonioso,
          preparamos algumas orientações com carinho:
        </Text>
        <Text style={text}>
          💙 <Text style={bold}>Madrinhas:</Text> vestidos longos, em tons de{" "}
          <Text style={bold}>azul serenity ou azul-claro</Text>,
          preferencialmente lisos, sem estampas, com modelo e tecido de sua
          preferência.
        </Text>
        <Text style={text}>
          💙 <Text style={bold}>Padrinhos:</Text> terno{" "}
          <Text style={bold}>azul-marinho</Text>, camisa social branca, gravata
          em tom discreto e sapatos sociais, preferencialmente marrons ou
          pretos.
        </Text>
        <Text style={text}>
          Queremos que todos estejam elegantes, mas, acima de tudo, confortáveis
          para aproveitar cada instante!
        </Text>
        <Text style={text}>
          Mais do que a combinação das cores, o que tornará esse dia
          inesquecível será ter vocês ao nosso lado! 💙
        </Text>
      </>
    );
  if (page === "cerimonia")
    return (
      <>
        <Text style={text}>
          Preparamos cada detalhe desse dia com muito carinho e queremos que
          vocês estejam ao nosso lado desde os primeiros momentos! 💙
        </Text>
        <Text style={text}>
          <Text style={bold}>🕊️ Chegada:</Text> A data e o local você já guardou
          no coração, mas gostaríamos de te pedir que chegue com pelo menos 30
          minutos de antecedência ao horário da cerimônia, para que possamos
          organizar tudo com tranquilidade.
        </Text>
        <Text style={text}>
          <Text style={bold}>💍 Cortejo:</Text> Nossos padrinhos e madrinhas
          terão um lugar especial na entrada e durante a cerimônia. A ordem de
          entrada e os posicionamentos serão orientados pela equipe de
          cerimonial.
        </Text>
        <Text style={text}>
          <Text style={bold}>✨ Orientações:</Text> Ao chegarem, procurem nossa
          equipe de cerimonial, liderada pelo Gustavo Morais, que estará à
          disposição para recebê-los e conduzi-los.
        </Text>
        <Text style={text}>
          Acima de tudo, queremos que aproveitem cada instante! Vocês foram
          escolhidos porque fazem parte da nossa história, e ter vocês pertinho
          de nós tornará esse momento ainda mais inesquecível! 💙
        </Text>
      </>
    );
  return <Text style={text}>{note?.trim() ? note : emptyCouplesNote}</Text>;
}
