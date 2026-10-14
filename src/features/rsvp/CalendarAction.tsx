import { useState } from "react";
import { Text } from "react-native";
import { AdminModal } from "../../components/AdminModal";
import { Button, styles } from "../../components/ui";
import type { WeddingEvent } from "../../types/domain";
import { friendlyError } from "../../lib/errors";
import { openExternal } from "../../utils/externalLinks";
import { googleCalendarUrl } from "./calendar";

export function CalendarAction({
  event,
  disabled = false,
}: {
  event: WeddingEvent;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(friendlyError(failure));
    }
  };
  return (
    <>
      <Button
        secondary
        disabled={disabled}
        title="Adicionar à agenda"
        onPress={() => setOpen(true)}
      />
      {open ? (
        <AdminModal title="Adicionar à agenda" onClose={() => setOpen(false)}>
          <Text style={styles.text}>
            🎉💍{" "}
            <Text style={{ fontWeight: "700" }}>
              A festa começa às 16h, hein, não atrasa!
            </Text>{" "}
            ⏰{"\n\n"}E pra terminar? Bom… essa parte a gente ainda não decidiu!
            🥂
          </Text>
          <Button
            title="Google Agenda"
            onPress={() => run(() => openExternal(googleCalendarUrl(event)))}
          />
          <Button secondary title="Fechar" onPress={() => setOpen(false)} />
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </AdminModal>
      ) : null}
    </>
  );
}
