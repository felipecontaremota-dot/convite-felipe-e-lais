import { Text } from "react-native";
import { theme } from "../theme/tokens";
export function UnreadBadge({ count }: { count: number }) {
  return count > 0 ? (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        right: -5,
        top: -7,
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: theme.colors.error,
        color: theme.colors.card,
        fontSize: 11,
        fontWeight: "700",
        textAlign: "center",
        lineHeight: 20,
        paddingHorizontal: 3,
        shadowColor: theme.colors.shadow,
        shadowOpacity: 0.12,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
      }}
    >
      {count > 99 ? "99+" : count}
    </Text>
  ) : null;
}
