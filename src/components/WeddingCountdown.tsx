import { theme } from "../theme/tokens";
import React from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { useCountdownClock } from "../features/countdown/clock";
import { countdownParts } from "../features/countdown/domain";
import { styles } from "./ui";

export function WeddingCountdown({ startsAt }: { startsAt: string }) {
  const now = useCountdownClock();
  const { width } = useWindowDimensions();
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

export function CompactCountdown({ startsAt }: { startsAt: string }) {
  const parts = countdownParts(startsAt, useCountdownClock());
  const units = [parts.days, parts.hours, parts.minutes, parts.seconds].map(
    (v) => String(v).padStart(2, "0"),
  );
  return (
    <Text
      testID="compact-countdown"
      accessibilityLiveRegion="none"
      style={[styles.badge, { fontVariant: ["tabular-nums"] }]}
    >
      {units.map((value, index) => (
        <React.Fragment key={index}>
          {index ? ":" : null}
          <Text
            testID="compact-countdown-number"
            style={{ color: theme.colors.countdownAccent }}
          >
            {value}
          </Text>
        </React.Fragment>
      ))}{" "}
      ·{" "}
    </Text>
  );
}
