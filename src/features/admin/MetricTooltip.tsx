import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { theme } from "../../theme/tokens";
import { styles } from "../../components/ui";
export function MetricTooltip({
  label,
  text,
  children,
  featured = false,
}: {
  label: string;
  text: string;
  children: ReactNode;
  featured?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flexGrow: 1, minWidth: 145 }}>
      {children}
      <Pressable
        style={
          featured
            ? {
                position: "absolute",
                right: 2,
                top: 2,
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }
            : undefined
        }
        accessibilityLabel={`Sobre ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      >
        <Text style={[styles.small, featured && { color: theme.colors.card }]}>
          ⓘ
        </Text>
      </Pressable>
      {open ? <Text style={styles.small}>{text}</Text> : null}
    </View>
  );
}
