import { useFxToast } from "../../components/FxToastProvider";
import { useState } from "react";
import { Button, Empty, Field, Screen, useFeedback } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { AdminModal } from "../../components/AdminModal";
import { LocationCard } from "../location/LocationScreen";
import { AppError } from "../../lib/errors";
import { safeHttps } from "../../utils/security";
function EventSettingsForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const app = useApp(),
    feedback = useFeedback();
  const [expectedVersion, setExpectedVersion] = useState(
    app.data?.event.version || 1,
  );
  const [venue, setVenue] = useState(app.data?.event.venue_name || ""),
    [address, setAddress] = useState(app.data?.event.address || ""),
    [gps, setGps] = useState(app.data?.event.gps_url || "");
  return (
    <AdminModal title="Editar local" onClose={onClose}>
      <Field label="Nome do local" value={venue} onChangeText={setVenue} />
      <Field
        label="Endereço"
        value={address}
        onChangeText={setAddress}
        multiline
      />
      <Field
        label="Link de GPS"
        value={gps}
        onChangeText={setGps}
        keyboardType="url"
        autoCapitalize="none"
        maxLength={2048}
      />
      <Button
        title="Salvar"
        onPress={() =>
          feedback.run(async () => {
            if (gps.trim() && !safeHttps(gps.trim()))
              throw new AppError("Informe um link de GPS HTTPS válido.");
            await app.admin("EVENT_SAVE", {
              version: expectedVersion,
              venue_name: venue.trim() || null,
              address: address.trim() || null,
              gps_url: gps.trim() ? safeHttps(gps.trim()) : null,
            });
            setExpectedVersion(expectedVersion + 1);
            onSaved();
            onClose();
            return "";
          })
        }
      />
      <Button secondary title="Cancelar" onPress={onClose} />
      {feedback.node}
    </AdminModal>
  );
}
export function EventSettings() {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const toast = useFxToast();
  const canEdit = app.data?.role === "ADMIN";
  return (
    <Screen section="admin" title="Local">
      {app.data ? (
        <>
          {canEdit ? (
            <Button
              secondary
              title="Editar local"
              onPress={() => setEditing(true)}
            />
          ) : null}
          <LocationCard
            event={app.data.event}
            onCopied={() => toast.notify("Endereço copiado")}
          />
          {editing && canEdit ? (
            <EventSettingsForm
              onClose={() => setEditing(false)}
              onSaved={() => toast.notify("Local salvo")}
            />
          ) : null}
        </>
      ) : (
        <Empty text="Carregando a configuração do evento…" />
      )}
    </Screen>
  );
}
