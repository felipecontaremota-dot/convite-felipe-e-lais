import { View } from "react-native";
import { Toggle, styles } from "../../components/ui";
import type { Channel } from "../../types/domain";

const channels: Channel[] = ["IN_APP", "PUSH", "EMAIL", "WHATSAPP"];

export function ChannelChoices({
  value,
  onChange,
}: {
  value: Channel[];
  onChange: (value: Channel[]) => void;
}) {
  return (
    <View style={styles.row}>
      {channels.map((c) => (
        <Toggle
          key={c}
          label={c}
          value={value.includes(c)}
          onChange={(v) =>
            onChange(v ? [...value, c] : value.filter((x) => x !== c))
          }
        />
      ))}
    </View>
  );
}
