import { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { RSVP } from "../../types/domain";
import { useFxToast } from "../../components/FxToastProvider";
export function RsvpFx({
  status,
  onCancel,
}: {
  status: RSVP;
  onCancel?: () => void;
}) {
  const { reducedMotion } = useFxToast();
  const { height } = useWindowDimensions();
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reducedMotion) return;
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: 2000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [value, reducedMotion]);
  if (reducedMotion) return null;
  const symbols =
    status === "CONFIRMED"
      ? ["🎉", "🎈", "▪"]
      : status === "DECLINED"
        ? ["💔"]
        : ["🤔"];
  return (
    <Modal visible transparent animationType="none" onRequestClose={onCancel}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        style={{ flex: 1 }}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              bottom: height * 0.08,
              left: `${20 + i * 5}%`,
              opacity: value.interpolate({
                inputRange: [0, 0.1, 0.7, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateY: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -height * (0.5 + (i % 4) * 0.03)],
                  }),
                },
                {
                  translateX: value.interpolate({
                    inputRange: [0, 0.6, 1],
                    outputRange: [
                      0,
                      (i % 2 ? 1 : -1) * (25 + (i % 4) * 12),
                      i % 2 ? 20 : -20,
                    ],
                  }),
                },
                {
                  rotate: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["-8deg", `${8 + i * 2}deg`],
                  }),
                },
                {
                  scale: value.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.75, 1, 0.9],
                  }),
                },
              ],
            }}
          >
            <Text style={{ fontSize: 20 + (i % 4) * 4 }}>
              {symbols[i % symbols.length]}
            </Text>
          </Animated.View>
        ))}
      </View>
    </Modal>
  );
}
