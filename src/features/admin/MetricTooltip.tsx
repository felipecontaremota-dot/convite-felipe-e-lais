import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { styles } from "../../components/ui";
export function MetricTooltip({
  label,
  text,
  children,
}: {
  label: string;
  text: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flexGrow: 1, minWidth: 145 }}>
      {children}
      <Pressable
        accessibilityLabel={`Sobre ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      >
        <Text style={styles.small}>ⓘ</Text>
      </Pressable>
      {open ? <Text style={styles.small}>{text}</Text> : null}
    </View>
  );
}
