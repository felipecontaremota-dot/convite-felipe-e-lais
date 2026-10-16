import { router } from "expo-router";
import { createElement, useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Button, Screen, styles } from "../../components/ui";
import { theme } from "../../theme/tokens";
import { dashboardDetails, type DashboardCategory } from "./dashboard";
import { DashboardDetailsModal } from "./DashboardDetailsModal";
import { useApp } from "../../lib/AppProvider";

export function AdminHome() {
  const s = useApp().data;
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const details = useMemo(() => dashboardDetails(s), [s]);
  const [selected, setSelected] = useState<DashboardCategory | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const categories: Record<string, DashboardCategory> = {
    Confirmados: "confirmed",
    "Não irão": "declined",
    Pendentes: "unanswered",
    "Talvez irão": "deciding",
    "Convites não enviados": "unsent",
  };
  const navigate: Record<string, () => void> = {
    Convidados: () => router.push("/convidados"),
    Famílias: () => router.push("/familias"),
    "Mensagens não lidas": () => router.push("/gestao-mensagens"),
  };
  const counts: [string, number | undefined][] = [
    ["Convidados", s?.guests.length],
    ["Confirmados", details.lists.confirmed.length],
    ["Não irão", details.lists.declined.length],
    ["Pendentes", details.lists.unanswered.length],
    ["Talvez irão", details.lists.deciding.length],
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
    ["Convites não enviados", details.lists.unsent.length],
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
      {Platform.OS === "web" &&
        createElement(
          "style",
          null,
          `
        [data-dashboard-card] { transition: background-color 180ms ease-out; }
        @media(prefers-reduced-motion:reduce) { [data-dashboard-card] { transition:none; } }
      `,
        )}
      <View style={styles.row}>
        {counts.map(([label, value]) => {
          const category = categories[label],
            action = navigate[label];
          const content = (
            <>
              <Text style={styles.title}>{value || 0}</Text>
              <Text style={styles.text}>{label}</Text>
            </>
          );
          return category || action ? (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${value || 0}`}
              {...(Platform.OS === "web"
                ? { dataSet: { dashboardCard: "true" } }
                : {})}
              onHoverIn={() => setHoveredCard(label)}
              onHoverOut={() => setHoveredCard(null)}
              onPress={() => {
                if (action) action();
                else {
                  if (Platform.OS === "web")
                    setTrigger(document.activeElement as HTMLElement | null);
                  setSelected(category!);
                }
              }}
              style={({ pressed }) => [
                styles.card,
                {
                  flexGrow: 1,
                  minWidth: 145,
                  backgroundColor: pressed
                    ? theme.colors.line
                    : hoveredCard === label
                      ? theme.colors.wash
                      : theme.colors.card,
                },
              ]}
            >
              {content}
            </Pressable>
          ) : (
            <View
              key={label}
              style={[styles.card, { flexGrow: 1, minWidth: 145 }]}
            >
              {content}
            </View>
          );
        })}
      </View>
      {selected ? (
        <DashboardDetailsModal
          category={selected}
          details={details}
          onClose={() => setSelected(null)}
          returnFocus={trigger}
        />
      ) : null}
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
