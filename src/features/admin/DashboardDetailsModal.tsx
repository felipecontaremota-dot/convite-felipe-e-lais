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
  details,
  onClose,
  returnFocus,
}: {
  category: DashboardCategory;
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
