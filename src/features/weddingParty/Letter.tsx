import { Text, View, useWindowDimensions } from "react-native";
import { Button } from "../../components/ui";
import { letterParagraphs } from "./letterContent";
import type { PartyRole } from "./types";
export interface LetterProps {
  name: string;
  arriving?: boolean;
  message?: string | null;
  role: PartyRole;
  busy: boolean;
  onAccept: () => void;
  onThink: () => void;
}
export function Letter({
  name,
  message,
  role,
  busy,
  onAccept,
  onThink,
}: LetterProps) {
  const narrow = useWindowDimensions().width <= 430;
  return (
    <View
      style={{
        width: "100%",
        maxWidth: 700,
        padding: 28,
        gap: 28,
        backgroundColor: "#FAF5E9",
      }}
    >
      {letterParagraphs(name, message, role).map((p, i) => (
        <Text
          key={i}
          style={{
            color: "#18324F",
            fontFamily: "Georgia",
            fontSize: 24,
            lineHeight: 36,
            textAlign: narrow ? "left" : "justify",
          }}
        >
          {p.before}
          {p.name && <Text style={{ fontWeight: "700" }}>{p.name}</Text>}
          {p.after}
        </Text>
      ))}
      <Button
        title="💙 É claro que aceito!"
        disabled={busy}
        onPress={onAccept}
      />
      <Button
        secondary
        title="Preciso pensar um pouquinho..."
        disabled={busy}
        onPress={onThink}
      />
    </View>
  );
}
