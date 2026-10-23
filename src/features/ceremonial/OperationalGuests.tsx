import { Text, View } from "react-native";
import { Tag } from "../../components/adminUi";
import { styles } from "../../components/ui";
import { rsvpTone } from "../../theme/feedback";
import { adminRsvpOptions, adminRsvpStatus } from "../guests/adminGuestStatus";
import type { Guest, Snapshot } from "../../types/domain";
export { operationalName, operationalGuests } from "./domain";
export function OperationalGuest({
  guest,
  data,
}: {
  guest: Guest;
  data: Snapshot;
}) {
  const response = data.rsvps.find((r) => r.guest_id === guest.id),
    status = adminRsvpStatus(response);
  const unit = data.invitations.find((i) => i.id === guest.invitation_id);
  const present = data.checkins.some(
    (c) => c.guest_id === guest.id && !c.local,
  );
  return (
    <>
      <Text style={styles.heading}>{guest.name}</Text>
      <View style={styles.row}>
        {guest.group_label ? <Tag>{guest.group_label}</Tag> : null}
        {unit?.kind === "FAMILY" ? <Tag>{unit.name}</Tag> : null}
        {guest.is_child ? <Tag tone="child">Criança</Tag> : null}
        {guest.party_role ? (
          <Tag>{guest.party_role === "PADRINHO" ? "Padrinho" : "Madrinha"}</Tag>
        ) : null}
        <Tag
          tone={
            status === "MAYBE"
              ? "deciding"
              : rsvpTone(response?.status || "PENDING")
          }
        >
          {adminRsvpOptions.find((o) => o.value === status)?.label}
        </Tag>
        {present ? <Tag tone="confirmed">Presente</Tag> : null}
      </View>
      {guest.admin_notes?.trim() ? (
        <Text selectable style={styles.text}>
          Observações gerais:{"\n"}
          {guest.admin_notes}
        </Text>
      ) : null}
      {response?.dietary?.trim() ? (
        <Text selectable style={styles.text}>
          Restrições alimentares:{"\n"}
          {response.dietary}
        </Text>
      ) : null}
      {response?.note?.trim() ? (
        <Text selectable style={styles.text}>
          Observações do RSVP:{"\n"}
          {response.note}
        </Text>
      ) : null}
      <Text style={styles.small}>
        {present ? "Entrada registrada" : "Entrada ainda não registrada"}
      </Text>
    </>
  );
}
