import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { weddingCountdown } from "../features/countdown/domain";
import { styles } from "./ui";
export function WeddingCountdown({
  startsAt,
  quoteSim = false,
}: {
  startsAt: string;
  quoteSim?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[
        styles.title,
        quoteSim && { textAlign: "center", paddingVertical: 12 },
      ]}
    >
      {quoteSim
        ? weddingCountdown(startsAt, now).text.replace(
            /até o Sim$/,
            'até o\n"Sim"',
          )
        : weddingCountdown(startsAt, now).text}
    </Text>
  );
}
