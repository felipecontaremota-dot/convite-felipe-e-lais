import { useEffect, useState, useSyncExternalStore } from "react";
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Text,
  View,
} from "react-native";
import type { RSVP } from "../../types/domain";
import { styles } from "../../components/ui";
export const rsvpMessages = {
  CONFIRMED:
    "Que alegria saber que você estará com a gente! Sua presença vai deixar esse dia ainda mais especial.",
  DECLINED:
    "Poxa... queríamos muito ter você com a gente. Vamos sentir sua falta nesse dia tão especial.",
  MAYBE:
    "Pensa com carinho. Ainda estamos torcendo para ter você aqui com a gente!",
  PENDING: "",
};
let nativeReduced = true;
function reducedSnapshot() {
  return Platform.OS === "web" && typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : nativeReduced;
}
function subscribeReduced(changed: () => void) {
  if (Platform.OS === "web") {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }
  let active = true;
  const update = (value: boolean) => {
    if (active) {
      nativeReduced = value;
      changed();
    }
  };
  void AccessibilityInfo.isReduceMotionEnabled().then(update);
  const subscription = AccessibilityInfo.addEventListener(
    "reduceMotionChanged",
    update,
  );
  return () => {
    active = false;
    subscription.remove();
  };
}
export function RsvpFeedback({ status }: { status: RSVP }) {
  const [progress] = useState(() => new Animated.Value(0));
  const reduced = useSyncExternalStore(
    subscribeReduced,
    reducedSnapshot,
    () => true,
  );
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: status === "CONFIRMED" ? 700 : 1000,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [reduced, status, progress]);
  return (
    <View accessibilityLiveRegion="polite">
      <Animated.View
        accessible={false}
        style={{
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
          padding: 12,
        }}
      >
        {Array.from({ length: status === "CONFIRMED" ? 7 : 3 }, (_, i) => (
          <View
            key={i}
            style={{
              width: status === "DECLINED" ? 5 : 8,
              height: status === "DECLINED" ? 14 : 8,
              borderRadius: 4,
              backgroundColor:
                status === "CONFIRMED"
                  ? "#B58B45"
                  : status === "DECLINED"
                    ? "#6F8290"
                    : "#BCA79B",
            }}
          />
        ))}
      </Animated.View>
      <Text style={styles.notice}>{rsvpMessages[status]}</Text>
    </View>
  );
}
