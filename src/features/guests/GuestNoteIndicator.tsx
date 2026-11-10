import { useState } from "react";
import { Pressable, Text } from "react-native";
import { AdminModal } from "../../components/AdminModal";
import { styles } from "../../components/ui";
import { guestNoteStyle } from "./guestNoteStyle";
import type { Guest } from "../../types/domain";
export function GuestNoteIndicator({ guest }: { guest: Guest }) {
  const [open, setOpen] = useState(false);
  if (!guest.admin_notes?.trim()) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Observação de ${guest.name}`}
        onPress={() => setOpen(true)}
        style={{ padding: 8 }}
      >
        <Text style={guestNoteStyle}>!</Text>
      </Pressable>
      {open ? (
        <AdminModal
          title={`Observação de ${guest.name}`}
          onClose={() => setOpen(false)}
        >
          <Text style={styles.text}>{guest.admin_notes}</Text>
        </AdminModal>
      ) : null}
    </>
  );
}
