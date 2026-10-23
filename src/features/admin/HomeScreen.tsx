import { router } from "expo-router";
import { createElement, useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Button, Screen, styles } from "../../components/ui";
import { MetricTooltip } from "./MetricTooltip";
import { dashboardTooltips } from "./dashboardTooltips";
import { useInvitationDelivery } from "../guests/useInvitationDelivery";
import { theme } from "../../theme/tokens";
import { dashboardDetails, type DashboardCategory } from "./dashboard";
import { DashboardDetailsModal } from "./DashboardDetailsModal";
import { useApp } from "../../lib/AppProvider";

export function AdminHome() {
  const s = useApp().data;
  const delivery = useInvitationDelivery();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const details = useMemo(() => dashboardDetails(s), [s]);
  const [selected, setSelected] = useState<DashboardCategory | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const categories: Record<string, DashboardCategory> = {
    Convidados: "sent",
    "Convidados da noiva": "bride",
    "Convidados do noivo": "groom",
    Confirmados: "confirmed",
    "Não irão": "declined",
    Pendentes: "unanswered",
    "Talvez irão": "deciding",
    "Convites não enviados": "unsent",
  };
  const navigate: Record<string, () => void> = {
    "Na lista": () => router.push("/convidados"),
    Famílias: () => router.push("/familias"),
    "Mensagens não lidas": () => router.push("/gestao-mensagens"),
  };
  const counts: [string, number | undefined][] = [
    ["Na lista", details.counts.total],
    ["Convidados", details.counts.sent],
    ["Convidados da noiva", details.counts.bride],
    ["Convidados do noivo", details.counts.groom],
    ["Confirmados", details.counts.confirmed],
    ["Não irão", details.counts.declined],
    ["Pendentes", details.counts.unanswered],
    ["Talvez irão", details.counts.deciding],
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
    ["Check-ins", s?.checkins.filter((c) => !c.local).length],
    ["Convites não enviados", details.counts.unsent],
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
        @keyframes metric-tooltip-enter { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
        [data-dashboard-card] { transition: background-color 180ms ease-out; }
        @media(prefers-reduced-motion:reduce) { [data-dashboard-card], [data-metric-tooltip] { transition:none!important; animation:none!important; } }
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
          const card =
            category || action ? (
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
                    minWidth: 0,
                    flexShrink: 1,
                    width: "100%",
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
                style={[
                  styles.card,
                  { flexGrow: 1, flexShrink: 1, minWidth: 0, width: "100%" },
                ]}
              >
                {content}
              </View>
            );
          return (
            <MetricTooltip
              key={label}
              label={label}
              text={dashboardTooltips[label]!}
            >
              {card}
            </MetricTooltip>
          );
        })}
      </View>
      {selected ? (
        <DashboardDetailsModal
          delivery={delivery}
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
