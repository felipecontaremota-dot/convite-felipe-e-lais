import { Tag } from "../../components/adminUi";
import { GuestInvitationActions } from "../guests/GuestInvitationActions";
import type { useInvitationDelivery } from "../guests/useInvitationDelivery";
import { useApp } from "../../lib/AppProvider";
import { useEffect } from "react";
import { Platform, Text, View } from "react-native";
import { AdminModal } from "../../components/AdminModal";
import { styles, Empty } from "../../components/ui";
import {
  dashboardCategories,
  type DashboardCategory,
  type dashboardDetails,
} from "./dashboard";

export function DashboardDetailsModal({
  category,
  delivery,
  details,
  onClose,
  returnFocus,
}: {
  category: DashboardCategory;
  delivery: ReturnType<typeof useInvitationDelivery>;
  details: ReturnType<typeof dashboardDetails>;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const nodes = [document.documentElement, document.body];
    const previous = nodes.map((node) => node.style.overflow);
    nodes.forEach((node) => {
      node.style.overflow = "hidden";
    });
    return () => {
      nodes.forEach((node, index) => {
        node.style.overflow = previous[index] ?? "";
      });
      requestAnimationFrame(() => {
        if (returnFocus?.isConnected && !returnFocus.closest("[inert]"))
          returnFocus.focus();
      });
    };
  }, [returnFocus]);
  const app = useApp();
  if (app.data?.role !== "ADMIN") return null;
  const isFinal =
    category === "sent" || category === "bride" || category === "groom";
  const overlap = isFinal
    ? details.overlaps[category as "sent" | "bride" | "groom"]
    : 0;
  const config = dashboardCategories[category],
    guests = details.lists[category];
  return (
    <AdminModal
      title={`${config.title} — ${guests.length}`}
      centerTitle
      animationType="none"
      onClose={onClose}
      captureKeyboard
    >
      {isFinal ? (
        <Text style={styles.text}>
          Convite enviado e sem recusa de presença.
        </Text>
      ) : null}
      {isFinal && overlap > 0 ? (
        <Text accessibilityRole="alert" style={styles.text}>
          Indicador: {details.counts[category]}. Registros nesta lista:{" "}
          {guests.length}. {overlap} pessoa(s) estão simultaneamente com convite
          não enviado e RSVP “Não irá”, sendo descontadas duas vezes pela
          fórmula Na lista − Convites não enviados − Não irão. A lista preserva
          todos os registros elegíveis.
        </Text>
      ) : null}
      {guests.length ? (
        guests.map((guest) => {
          const invitation = details.invitations.get(guest.invitation_id);
          return (
            <View
              key={guest.id}
              {...(Platform.OS === "web"
                ? { dataSet: { dashboardGuest: "true" } }
                : {})}
              style={styles.card}
            >
              <Text style={styles.heading}>{guest.name}</Text>
              {invitation && (invitation.kind || "FAMILY") === "FAMILY" ? (
                <Text style={styles.text}>Família: {invitation.name}</Text>
              ) : null}
              <View style={styles.row}>
                {guest.group_label ? <Tag>{guest.group_label}</Tag> : null}
                <Tag>{guest.invitation_sent ? "Enviado" : "Não enviado"}</Tag>
                <GuestInvitationActions guest={guest} delivery={delivery} />
              </View>
              <Text style={styles.text}>
                Presença: {details.status.get(guest.id)}
              </Text>
            </View>
          );
        })
      ) : (
        <Empty text={config.empty} />
      )}
    </AdminModal>
  );
}
