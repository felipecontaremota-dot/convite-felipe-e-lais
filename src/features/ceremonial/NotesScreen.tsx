import { Platform, Text, View } from "react-native";
import { Card, Empty, Screen, styles } from "../../components/ui";
import { Tag } from "../../components/adminUi";
import { useApp } from "../../lib/AppProvider";
import { rsvpTone } from "../../theme/feedback";
import { adminRsvpOptions, adminRsvpStatus } from "../guests/adminGuestStatus";
import { guestsWithNotes } from "./domain";
export function NotesScreen() {
  const app = useApp();
  const people = guestsWithNotes(app.data);
  return (
    <Screen title="Observações" section="ceremonial">
      {people.map((g) => {
        const unit = app.data?.invitations.find(
          (i) => i.id === g.invitation_id,
        );
        const status = adminRsvpStatus(
          app.data?.rsvps.find((r) => r.guest_id === g.id),
        );
        return (
          <View
            key={g.id}
            {...(Platform.OS === "web"
              ? { dataSet: { notedGuest: g.id } }
              : {})}
          >
            <Card>
              <Text style={styles.heading}>{g.name}</Text>
              <View style={styles.row}>
                {g.group_label ? <Tag>{g.group_label}</Tag> : null}
                {unit?.kind === "FAMILY" ? <Tag>{unit.name}</Tag> : null}
                <Tag tone={status === "MAYBE" ? "deciding" : rsvpTone(status)}>
                  {adminRsvpOptions.find((o) => o.value === status)?.label}
                </Tag>
              </View>
              <Text style={styles.text}>
                Observação:{" "}
                <Text style={{ fontWeight: "700" }}>{g.admin_notes}</Text>
              </Text>
            </Card>
          </View>
        );
      })}
      {!people.length ? (
        <Empty text="Nenhum convidado possui observações cadastradas." />
      ) : null}
    </Screen>
  );
}
