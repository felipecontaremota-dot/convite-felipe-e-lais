import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Platform, Text } from "react-native";
import {
  Button,
  Card,
  Choice,
  Field,
  Screen,
  styles,
  Toggle,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { AppError } from "../../lib/errors";
import type { Contact, Guest } from "../../types/domain";
import { contactSchema } from "../../utils/security";

const initialContact: Omit<Contact, "guest_id"> = {
  email: "",
  whatsapp: "",
  consent_in_app: true,
  consent_push: false,
  consent_email: false,
  consent_whatsapp: false,
};

function ContactForm({ guest }: { guest: Guest }) {
  const app = useApp(),
    feedback = useFeedback();
  const [form, setForm] = useState(
    app.data?.contacts.find((c) => c.guest_id === guest.id) || {
      guest_id: guest.id,
      ...initialContact,
    },
  );
  const change = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <Card>
      <Text style={styles.heading}>{guest.name}</Text>
      <Field
        label={`E-mail de ${guest.name}`}
        value={form.email}
        onChangeText={(v) => change("email", v)}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field
        label={`WhatsApp de ${guest.name}`}
        value={form.whatsapp}
        onChangeText={(v) => change("whatsapp", v)}
        keyboardType="phone-pad"
      />
      {(["in_app", "push", "email", "whatsapp"] as const).map((c) => (
        <Toggle
          key={c}
          label={`Aceito receber mensagens por ${c.replace("_", " ")}`}
          value={form[`consent_${c}`]}
          onChange={(v) => change(`consent_${c}`, v)}
        />
      ))}
      <Button
        title={`Salvar contato de ${guest.name}`}
        onPress={() =>
          feedback.run(() =>
            app.send("CONTACT_UPDATE", {
              guest_id: guest.id,
              ...contactSchema.parse(form),
            }),
          )
        }
      />
      <Button
        secondary
        title={`Ativar push para ${guest.name}`}
        disabled={
          !form.consent_push ||
          Platform.OS === "web" ||
          app.isDemo ||
          !app.online
        }
        onPress={() =>
          feedback.run(async () => {
            if (Platform.OS === "android")
              await Notifications.setNotificationChannelAsync("wedding", {
                name: "Casamento",
                importance: Notifications.AndroidImportance.DEFAULT,
              });
            const { status } = await Notifications.requestPermissionsAsync();
            if (status !== "granted")
              throw new AppError("Permissão de notificações não concedida.");
            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            if (!projectId)
              throw new AppError(
                "Configure o projeto EAS antes de registrar push.",
              );
            const token = (
              await Notifications.getExpoPushTokenAsync({ projectId })
            ).data;
            return app.send("PUSH_REGISTER", {
              guest_id: guest.id,
              token,
              platform: Platform.OS,
            });
          })
        }
      />
      {Platform.OS === "web" ? (
        <Text style={styles.small}>
          Push será habilitado no aplicativo nativo. Os avisos continuam
          disponíveis aqui.
        </Text>
      ) : null}
      {feedback.node}
    </Card>
  );
}

export function ProfileScreen() {
  const app = useApp(),
    feedback = useFeedback();
  const [who, setWho] = useState("");
  useEffect(() => {
    void import("../../storage/driver")
      .then((m) => m.readCache<string>(`identity:${app.scope}`))
      .then((v) => setWho(v || ""));
  }, [app.scope]);
  return (
    <Screen section="guest" title="Quem está usando este dispositivo?">
      <Card>
        <Text style={styles.text}>
          Selecione seu nome para identificar os próximos recados. A família
          continua acessível neste aparelho.
        </Text>
        <Choice
          value={who}
          onChange={(v) => {
            setWho(v);
            void feedback.run(async () => {
              const { writeCache } = await import("../../storage/driver");
              await writeCache(`identity:${app.scope}`, v);
              return "Identificação salva neste aparelho.";
            });
          }}
          options={
            app.data?.guests.map((g) => ({ value: g.id, label: g.name })) || []
          }
        />
        {feedback.node}
      </Card>
      <Text style={styles.text}>
        Contatos são opcionais. E-mail e WhatsApp só recebem mensagens com sua
        autorização. Desmarque uma opção para revogar o consentimento.
      </Text>
      {app.data?.guests.map((g) => (
        <ContactForm key={g.id} guest={g} />
      ))}
    </Screen>
  );
}
