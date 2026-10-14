import { theme } from "../theme/tokens";
import React, { useEffect, useState } from "react";
import {
  AppState,
  Platform,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { countdownParts } from "../features/countdown/domain";
import { styles } from "./ui";

export function WeddingCountdown({ startsAt }: { startsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  const { width } = useWindowDimensions();
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    const visible = () => {
      if (!document.hidden) update();
    };
    if (Platform.OS === "web") {
      document.addEventListener("visibilitychange", visible);
      window.addEventListener("focus", update);
    }
    return () => {
      clearInterval(timer);
      subscription.remove();
      if (Platform.OS === "web") {
        document.removeEventListener("visibilitychange", visible);
        window.removeEventListener("focus", update);
      }
    };
  }, []);
  const parts = countdownParts(startsAt, now);
  if (parts.arrived)
    return (
      <Text style={[styles.title, { textAlign: "center" }]}>
        Chegou o nosso Sim. ❤️
      </Text>
    );
  const units = [
    [parts.days, "dias"],
    [parts.hours, "hrs"],
    [parts.minutes, "min"],
    [parts.seconds, "seg"],
  ] as const;
  return (
    <View
      testID="wedding-countdown"
      accessible
      accessibilityLabel={`Contagem regressiva: ${parts.days} dias, ${parts.hours} horas, ${parts.minutes} minutos e ${parts.seconds} segundos`}
      style={{
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: 4,
        paddingVertical: 12,
      }}
    >
      {units.map(([value, label], index) => (
        <React.Fragment key={label}>
          {index > 0 ? (
            <Text
              style={{
                fontSize: width < 420 ? 28 : 34,
                color: theme.colors.secondary,
              }}
            >
              :
            </Text>
          ) : null}
          <View style={{ alignItems: "center", minWidth: 44, flexShrink: 1 }}>
            <Text
              style={{
                fontSize: width < 420 ? 28 : 34,
                color: theme.colors.ink,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {String(value).padStart(2, "0")}
            </Text>
            <Text style={styles.small}>{label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}
