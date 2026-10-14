import { useContext } from "react";
import { Platform, Pressable, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { InstallContext } from "../features/install/context";
import { theme } from "../theme/tokens";
import type { ViewStyle, TextStyle } from "react-native";
export function InstallAppButton({
  navStyle,
  textStyle,
}: {
  navStyle: ViewStyle;
  textStyle: TextStyle;
}) {
  const install = useContext(InstallContext);
  if (!install.available || Platform.OS !== "web") return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Baixar app"
      accessibilityState={{ disabled: install.busy, busy: install.busy }}
      aria-disabled={install.busy}
      aria-busy={install.busy}
      disabled={install.busy}
      {...{ dataSet: { themeNav: "true" } }}
      onPress={install.install}
      style={[navStyle, { flexDirection: "row", alignItems: "center", gap: 6 }]}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24" aria-hidden={true}>
        <Path
          d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"
          fill="none"
          stroke={theme.colors.secondary}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={[textStyle, { color: theme.colors.secondary }]}>
        Baixar app
      </Text>
    </Pressable>
  );
}
