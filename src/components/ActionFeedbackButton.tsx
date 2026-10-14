import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { theme } from "../theme/tokens";
import { feedbackColors } from "../theme/feedback";
import { styles } from "./ui";
import { useFxToast } from "./FxToastProvider";
export type ActionOutcome = {
  message: string;
  confirmed: boolean;
  detail?: string;
};
export function ActionFeedbackButton({
  icon,
  label,
  action,
  onError,
  onNotice,
  onStart,
}: {
  icon: "copy" | "send";
  label: string;
  action: () => Promise<ActionOutcome>;
  onError: (error: unknown) => void;
  onNotice?: (message: string) => void;
  onStart?: () => void;
}) {
  const { reducedMotion } = useFxToast();
  const [phase, setPhase] = useState<
    "idle" | "loading" | "success" | "info" | "leaving"
  >("idle");
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const lock = useRef(false),
    alive = useRef(true),
    timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [opacity] = useState(() => new Animated.Value(0));
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    opacity.stopAnimation();
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
      opacity.stopAnimation();
    };
  }, [opacity]);
  const run = async () => {
    if (lock.current) return;
    clear();
    lock.current = true;
    setOutcome(null);
    setPhase("loading");
    try {
      onStart?.();
      const result = await action();
      if (!alive.current) return;
      setOutcome(result);
      setPhase(result.confirmed ? "success" : "info");
      opacity.setValue(reducedMotion ? 1 : 0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: reducedMotion ? 0 : 200,
        useNativeDriver: Platform.OS !== "web",
      }).start();
      if (!result.confirmed) {
        lock.current = false;
        if (result.detail) onNotice?.(result.detail);
      }
      timers.current.push(
        setTimeout(
          () => {
            setPhase("leaving");
            Animated.timing(opacity, {
              toValue: 0,
              duration: reducedMotion ? 0 : 180,
              useNativeDriver: Platform.OS !== "web",
            }).start();
            timers.current.push(
              setTimeout(
                () => {
                  setPhase("idle");
                  setOutcome(null);
                  lock.current = false;
                },
                reducedMotion ? 0 : 180,
              ),
            );
          },
          (reducedMotion ? 0 : 200) + 1400,
        ),
      );
    } catch (error) {
      if (alive.current) {
        setPhase("idle");
        setOutcome(null);
        lock.current = false;
        onError(error);
      }
    }
  };
  const confirmed = !!outcome?.confirmed;
  const color = confirmed
    ? feedbackColors.confirmed.text
    : theme.colors.secondary;
  const iconPath = confirmed
    ? "m5 12 4 4L19 6"
    : icon === "copy"
      ? "M9 9h12v12H9zM15 9V3H3v12h6"
      : "M3 5h18v14H3zM3 5l9 7 9-7";
  return (
    <View style={{ position: "relative", width: 44, minHeight: 44 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{
          disabled: phase === "loading" || confirmed,
          busy: phase === "loading",
        }}
        aria-disabled={phase === "loading" || confirmed}
        aria-busy={phase === "loading"}
        disabled={phase === "loading" || confirmed}
        onPress={() => void run()}
        {...(Platform.OS === "web" ? { dataSet: { fxAction: phase } } : {})}
        style={[
          styles.nav,
          {
            padding: 10,
            minWidth: 44,
            minHeight: 44,
            justifyContent: "center",
            alignItems: "center",
          },
          confirmed && {
            borderColor: feedbackColors.confirmed.border,
            backgroundColor: feedbackColors.confirmed.background,
          },
        ]}
      >
        {phase === "loading" ? (
          <ActivityIndicator size="small" color={theme.colors.secondary} />
        ) : (
          <Animated.View
            style={{
              opacity: outcome ? opacity : 1,
              transform: [
                {
                  scale:
                    outcome && !reducedMotion
                      ? opacity.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.96, 1],
                        })
                      : 1,
                },
              ],
            }}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden={true}>
              <Path
                d={iconPath}
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>
        )}
        {outcome ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: "100%",
              right: 0,
              padding: 7,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: confirmed
                ? feedbackColors.confirmed.border
                : theme.colors.line,
              backgroundColor: confirmed
                ? feedbackColors.confirmed.background
                : theme.colors.card,
              opacity,
              transform: [
                {
                  translateY: reducedMotion
                    ? 0
                    : opacity.interpolate({
                        inputRange: [0, 1],
                        outputRange: [3, 0],
                      }),
                },
              ],
              ...theme.shadow,
            }}
          >
            <Text
              role="status"
              accessibilityLiveRegion="polite"
              style={{ fontSize: 13, color, fontWeight: "600", minWidth: 100 }}
            >
              {outcome.message}
            </Text>
          </Animated.View>
        ) : null}
      </Pressable>
    </View>
  );
}
