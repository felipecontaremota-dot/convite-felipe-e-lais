import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { weddingCountdown } from "../features/countdown/domain";
import { styles } from "./ui";
export function WeddingCountdown({ startsAt }: { startsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  return (
    <Text accessibilityLiveRegion="polite" style={styles.title}>
      {weddingCountdown(startsAt, now).text}
    </Text>
  );
}
