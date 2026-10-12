import { useState } from "react";
import { Platform, Text } from "react-native";
import { AdminModal } from "../../components/AdminModal";
import { Button, styles } from "../../components/ui";
import type { WeddingEvent } from "../../types/domain";
import { friendlyError } from "../../lib/errors";
import { openExternal } from "../../utils/externalLinks";
import { googleCalendarUrl } from "./calendar";
import { openDeviceCalendar } from "./calendarActions";

export function CalendarAction({ event }: { event: WeddingEvent }) {
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
        title="Adicionar à agenda"
        onPress={() => setOpen(true)}
      />
      {open ? (
        <AdminModal title="Adicionar à agenda" onClose={() => setOpen(false)}>
          <Text style={styles.text}>
            O casamento começa às 16h, no horário de Goiás. O horário de término
            não foi definido.
          </Text>
          <Button
            title="Google Agenda"
            onPress={() => run(() => openExternal(googleCalendarUrl(event)))}
          />
          <Button
            title={
              Platform.OS === "web"
                ? "Baixar calendário (.ics)"
                : "Calendário do dispositivo"
            }
            onPress={() =>
              run(async () => {
                await openDeviceCalendar(event);
                setOpen(false);
              })
            }
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
