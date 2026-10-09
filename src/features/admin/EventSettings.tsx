import { useState } from "react";
import {
  Button,
  Card,
  Empty,
  Field,
  Screen,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { AppError } from "../../lib/errors";
import { safeHttps } from "../../utils/security";
function EventSettingsForm() {
  const app = useApp(),
    feedback = useFeedback();
  const [expectedVersion, setExpectedVersion] = useState(
    app.data?.event.version || 1,
  );
  const [venue, setVenue] = useState(app.data?.event.venue_name || ""),
    [address, setAddress] = useState(app.data?.event.address || ""),
    [gps, setGps] = useState(app.data?.event.gps_url || "");
  return (
    <Screen section="admin" title="Local da celebração">
      <Card>
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
            })
          }
        />
        {feedback.node}
      </Card>
    </Screen>
  );
}
export function EventSettings() {
  const app = useApp();
  return app.data ? (
    <EventSettingsForm key={app.data.event.id} />
  ) : (
    <Screen section="admin" title="Local da celebração">
      <Empty text="Carregando a configuração do evento…" />
    </Screen>
  );
}
