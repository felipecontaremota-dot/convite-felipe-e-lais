import { useEffect, useState } from "react";
import { Animated, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../theme/tokens";
import type { ToastPhase } from "./FxToastProvider";
export function TransientToast({
  message,
  phase,
  reducedMotion,
}: {
  message: string;
  phase: ToastPhase;
  reducedMotion: boolean;
}) {
  const [value] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const animation = Animated.timing(value, {
      toValue: phase === "leaving" ? 0 : 1,
      duration: reducedMotion ? 0 : 200,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [value, phase, reducedMotion]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: insets.top + 18,
        right: insets.right + 18,
        zIndex: 80,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.card,
        opacity: value,
        transform: [
          {
            translateY: reducedMotion
              ? 0
              : value.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }),
          },
        ],
        ...theme.shadow,
      }}
    >
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: theme.colors.ink, fontSize: 14, fontWeight: "600" }}
      >
        {message}
      </Text>
    </Animated.View>
  );
}
