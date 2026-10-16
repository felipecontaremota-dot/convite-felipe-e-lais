import { theme } from "../../theme/tokens";
import { useState } from "react";
import { router } from "expo-router";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { Button, Card, Empty, Screen, styles } from "../../components/ui";
import Svg, { Path } from "react-native-svg";
import { WeddingCountdown } from "../../components/WeddingCountdown";
import { homeGreeting, homePresence } from "./homeContent";
import { HomeRsvpModal } from "../rsvp/HomeRsvpModal";
import { useApp } from "../../lib/AppProvider";

export function GuestHome() {
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [presenceTrigger, setPresenceTrigger] = useState<HTMLElement | null>(
    null,
  );
  const [highlight, setHighlight] = useState(false);
  const app = useApp(),
    s = app.data;
  return (
    <Screen
      section="guest"
      title={homeGreeting(s?.invitations[0], s?.guests ?? [])}
    >
      <Card>
        {s ? <WeddingCountdown startsAt={s.event.starts_at} /> : null}
        <Image
          source={require("../../../assets/branding/icon.png")}
          accessibilityLabel="Monograma Felipe & Laís"
          accessible
          resizeMode="contain"
          style={{
            width: 210,
            height: 210,
            maxWidth: "100%",
            alignSelf: "center",
            marginVertical: 16,
          }}
        />
        <WeddingDetail
          icon="M7 3v4m10-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2"
          text="15 de dezembro de 2026"
        />
        <WeddingDetail
          icon="M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0"
          text="Às 16h"
        />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Villarejo"
          onPress={() => router.push("/como-chegar")}
          onHoverIn={() => setHighlight(true)}
          onHoverOut={() => setHighlight(false)}
          onFocus={() => setHighlight(true)}
          onBlur={() => setHighlight(false)}
          style={({ pressed }) => ({
            minHeight: 48,
            justifyContent: "center",
            borderRadius: 8,
            backgroundColor:
              highlight || pressed ? theme.colors.wash : "transparent",
          })}
        >
          <WeddingDetail
            icon="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0"
            text="Villarejo"
          />
        </Pressable>
        <Text style={styles.badge}>
          {homePresence(
            s?.invitations[0],
            s?.guests ?? [],
            s?.rsvps ?? [],
            app.pending,
          )}
        </Text>
        <Button
          secondary
          title="Ver informações"
          onPress={() => router.push("/informacoes")}
        />
        <Button
          title="Confirmar presença"
          onPress={() => {
            if (Platform.OS === "web")
              setPresenceTrigger(document.activeElement as HTMLElement | null);
            setPresenceOpen(true);
          }}
        />
        <Button
          secondary
          title="Ver meus convites"
          onPress={() => router.push("/ingressos")}
        />
      </Card>
      {presenceOpen ? (
        <HomeRsvpModal
          onClose={() => setPresenceOpen(false)}
          returnFocus={presenceTrigger}
        />
      ) : null}
      <Text style={styles.heading}>Recados com carinho</Text>
      {s?.announcements.length ? (
        s.announcements.map((a) => (
          <Card key={a.id}>
            <Text style={styles.heading}>{a.title}</Text>
            <Text style={styles.text}>{a.content}</Text>
          </Card>
        ))
      ) : (
        <Empty text="Os próximos avisos aparecerão aqui." />
      )}
    </Screen>
  );
}

function WeddingDetail({ icon, text }: { icon: string; text: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
        minHeight: 44,
      }}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden={true}>
        <Path
          d={icon}
          stroke={theme.colors.secondary}
          strokeWidth={1.5}
          fill="none"
        />
      </Svg>
      <Text style={[styles.text, { textAlign: "center", flexShrink: 1 }]}>
        · {text}
      </Text>
    </View>
  );
}
