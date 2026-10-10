import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useState } from "react";
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
import { mobileMask, mobileDigits, validMobile } from "../../utils/mobilePhone";
import { contactSchema } from "../../utils/security";

const initialContact: Omit<Contact, "guest_id"> = {
  email: "",
  whatsapp: "",
  consent_in_app: true,
  consent_push: true,
  consent_email: true,
  consent_whatsapp: true,
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
        value={mobileMask(form.whatsapp)}
        onChangeText={(v) => change("whatsapp", mobileDigits(v))}
        maxLength={16}
        keyboardType="phone-pad"
      />
      <Toggle
        label="Revogar permissão de receber mensagens e notificações"
        value={!!form.notifications_revoked}
        onChange={(v) =>
          setForm((f) => ({
            ...f,
            notifications_revoked: v,
            consent_in_app: !v,
            consent_push: !v,
            consent_email: !v,
            consent_whatsapp: !v,
          }))
        }
      />
      <Button
        title={`Salvar contato de ${guest.name}`}
        onPress={() =>
          feedback.run(async () => {
            if (!validMobile(mobileDigits(form.whatsapp)))
              throw new AppError("Informe um celular com DDD e 11 dígitos.");
            const result = await app.send("CONTACT_UPDATE", {
              guest_id: guest.id,
              ...contactSchema.parse({
                ...form,
                whatsapp: mobileDigits(form.whatsapp),
                notifications_revoked: !!form.notifications_revoked,
              }),
            });
            if (app.online)
              setForm((f) => ({
                ...f,
                consent_in_app: !f.notifications_revoked,
                consent_push: !f.notifications_revoked,
                consent_email: !f.notifications_revoked,
                consent_whatsapp: !f.notifications_revoked,
              }));
            return app.online ? "Salvo com sucesso." : result;
          })
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
  const who = app.data?.current_guest_id || "";
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
            void feedback.run(async () => {
              await app.identifyGuest(v);
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
        Contatos são opcionais. Marque a opção de revogação para deixar de
        receber mensagens e notificações; desmarque para reativar a permissão.
      </Text>
      {app.data?.guests.map((g) => (
        <ContactForm key={g.id} guest={g} />
      ))}
    </Screen>
  );
}
