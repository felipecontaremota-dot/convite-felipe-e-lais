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

function EventSettingsForm() {
  const app = useApp(),
    feedback = useFeedback();
  const [venue, setVenue] = useState(app.data?.event.venue_name || ""),
    [address, setAddress] = useState(app.data?.event.address || ""),
    [lat, setLat] = useState(String(app.data?.event.latitude ?? "")),
    [lng, setLng] = useState(String(app.data?.event.longitude ?? ""));
  return (
    <Screen section="admin" title="Local da celebração">
      <Card>
        <Field label="Nome do local" value={venue} onChangeText={setVenue} />
        <Field label="Endereço" value={address} onChangeText={setAddress} />
        <Field
          label="Latitude"
          value={lat}
          onChangeText={setLat}
          keyboardType="numbers-and-punctuation"
        />
        <Field
          label="Longitude"
          value={lng}
          onChangeText={setLng}
          keyboardType="numbers-and-punctuation"
        />
        <Button
          title="Salvar localização"
          onPress={() =>
            feedback.run(async () => {
              if (
                (lat && !lng) ||
                (!lat && lng) ||
                (lat &&
                  (!Number.isFinite(Number(lat)) ||
                    Math.abs(Number(lat)) > 90)) ||
                (lng &&
                  (!Number.isFinite(Number(lng)) ||
                    Math.abs(Number(lng)) > 180))
              )
                throw new AppError(
                  "Informe um par de coordenadas válido ou deixe ambos em branco.",
                );
              await app.admin("EVENT_SAVE", {
                venue_name: venue.trim() || null,
                address: address.trim() || null,
                latitude: lat ? Number(lat) : null,
                longitude: lng ? Number(lng) : null,
              });
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
