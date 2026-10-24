import { createElement, type ReactNode } from "react";
import {
  Platform,
  Text,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from "react-native";

// Scoped to the exclusive area's prose; headings, links and controls keep their alignment.
export const partyParagraphCss = `
 [data-party-body]{text-align-last:start;hyphens:auto;-webkit-hyphens:auto;word-break:normal;overflow-wrap:break-word;}
`;
export function PartyParagraph({
  children,
  style,
}: {
  children: ReactNode;
  style: StyleProp<TextStyle>;
}) {
  const narrow = useWindowDimensions().width <= 350;
  const paragraph = (
    <Text
      style={[style, { textAlign: narrow ? "left" : "justify" }]}
      {...(Platform.OS === "web" ? { dataSet: { partyBody: "true" } } : {})}
    >
      {children}
    </Text>
  );
  // RN Web filters lang on Text; this layout-neutral wrapper supplies the hyphenation language.
  return Platform.OS === "web"
    ? createElement(
        "div",
        { lang: "pt-BR", style: { display: "contents" } },
        paragraph,
      )
    : paragraph;
}
