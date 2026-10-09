import { router } from "expo-router";
import { Text, View } from "react-native";
import { Button, Screen, styles } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";

export function AdminHome() {
  const s = useApp().data;
  const counts = [
    ["Convidados", s?.guests.length],
    ["Confirmados", s?.rsvps.filter((r) => r.status === "CONFIRMED").length],
    ["Não irão", s?.rsvps.filter((r) => r.status === "DECLINED").length],
    ["Pendentes", s?.rsvps.filter((r) => r.status === "PENDING").length],
    [
      "Famílias",
      s?.invitations.filter(
        (i) => i.active && (i.kind || "FAMILY") === "FAMILY",
      ).length,
    ],
    ["Presentes", s?.gifts.filter((g) => g.active).length],
    [
      "Mensagens não lidas",
      s?.messages.filter((m) => !m.from_admin && !m.read_at).length,
    ],
    ["Check-ins", s?.checkins.length],
    [
      "Convites não enviados",
      s?.invitations.filter((i) => i.active && !i.sent_at).length,
    ],
    [
      "Famílias já ativadas",
      s?.invitations.filter(
        (i) =>
          i.active &&
          (i.kind || "FAMILY") === "FAMILY" &&
          !!i.first_activated_at,
      ).length,
    ],
  ];
  return (
    <Screen section="admin" title="O nosso casamento, em cada detalhe">
      <View style={styles.row}>
        {counts.map(([label, value]) => (
          <View
            key={String(label)}
            style={[styles.card, { flexGrow: 1, minWidth: 145 }]}
          >
            <Text style={styles.title}>{value || 0}</Text>
            <Text style={styles.text}>{label}</Text>
          </View>
        ))}
      </View>
      <Button
        title="Organizar famílias"
        onPress={() => router.push("/familias")}
      />
      <Button
        secondary
        title="Abrir dia do evento"
        onPress={() => router.push("/dia-do-evento")}
      />
    </Screen>
  );
}
