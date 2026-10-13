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
import { registerProfilePush } from "./profilePush";
import { theme } from "../../theme/tokens";
import type { Contact, Guest } from "../../types/domain";
import {
  formatProfilePhone,
  profilePhone,
  profileSaveFeedback,
  revocation,
  withRevocation,
} from "./profileContact";
import { contactSchema } from "../../utils/security";

const initialContact: Omit<Contact, "guest_id"> = {
  communications_revoked: false,
  email: "",
  whatsapp: "",
  consent_in_app: true,
  consent_push: false,
  consent_email: false,
  consent_whatsapp: false,
};

function RevocationCheckbox({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const label = "Revogar permissão de receber mensagens e notificações";
  // A native HTML checkbox supplies Space, focus and label activation on Web.
  // Keep native accessibility through the existing Toggle on Android/iOS.
  if (Platform.OS !== "web")
    return <Toggle label={label} value={value} onChange={onChange} />;
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: 12,
        minHeight: 48,
        boxSizing: "border-box",
        border: `1px solid ${theme.colors.line}`,
        borderRadius: 10,
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        aria-label={label}
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          accentColor: theme.colors.ink,
        }}
      />
      <Text style={[styles.text, { flexShrink: 1 }]}>{label}</Text>
    </label>
  );
}

function ContactForm({ guest }: { guest: Guest }) {
  const app = useApp(),
    feedback = useFeedback();
  const [draft, setDraft] = useState<Contact | null>(null);
  const form = draft ||
    app.data?.contacts.find((c) => c.guest_id === guest.id) || {
      guest_id: guest.id,
      ...initialContact,
    };
  const change = (key: string, value: unknown) =>
    setDraft((current) => ({ ...(current || form), [key]: value }));
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
        value={formatProfilePhone(form.whatsapp)}
        onChangeText={(v) => change("whatsapp", profilePhone(v))}
        keyboardType="phone-pad"
      />
      <RevocationCheckbox
        value={revocation(form)}
        onChange={(value) => {
          setDraft((current) => withRevocation(current || form, value));
        }}
      />
      <Text style={styles.small}>
        {app.data?.contacts.find((c) => c.guest_id === guest.id)
          ?.communications_revoked
          ? "Estado confirmado: comunicações revogadas."
          : "Estado confirmado: comunicações conforme os consentimentos autorizados."}
      </Text>
      <Text style={styles.small}>
        {app.pending.some(
          (m) => m.type === "CONTACT_UPDATE" && m.payload.guest_id === guest.id,
        )
          ? "Alteração pendente de confirmação do servidor. O estado remoto mantém a confirmação anterior."
          : "A revogação passa a valer após confirmação do servidor; envios já iniciados podem terminar."}
      </Text>
      <Button
        title={`Salvar contato de ${guest.name}`}
        onPress={() =>
          feedback.run(async () => {
            const result = await app.send("CONTACT_UPDATE", {
              guest_id: guest.id,
              ...contactSchema.parse({
                ...form,
                communications_revoked: revocation(form),
                whatsapp: form.whatsapp.replace(/[^0-9]/g, ""),
              }),
            });
            if (result === "Sincronizado com sucesso.") setDraft(null);
            return profileSaveFeedback(result);
          })
        }
      />
      <Button
        secondary
        title={`Ativar push para ${guest.name}`}
        disabled={
          revocation(form) ||
          app.data?.contacts.find((c) => c.guest_id === guest.id)
            ?.communications_revoked ||
          !form.consent_push ||
          !app.data?.contacts.find((c) => c.guest_id === guest.id)
            ?.consent_push ||
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
            return registerProfilePush({
              requestPermission: () => Notifications.requestPermissionsAsync(),
              projectId: () => Constants.expoConfig?.extra?.eas?.projectId,
              token: async (projectId) =>
                (await Notifications.getExpoPushTokenAsync({ projectId })).data,
              register: (token) =>
                app.send("PUSH_REGISTER", {
                  guest_id: guest.id,
                  token,
                  platform: Platform.OS,
                }),
            });
          })
        }
      />
      {Platform.OS === "web" ? (
        <Text style={styles.small}>
          Push será habilitado no aplicativo nativo, com sua autorização e a
          permissão do aparelho.
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
        autorização. Marque a opção para revogar mensagens e notificações. Ao
        desmarcá-la, somente os canais anteriormente autorizados serão
        restaurados. A ativação de push depende também da permissão do seu
        aparelho.
      </Text>
      {app.data?.guests.map((g) => (
        <ContactForm key={g.id} guest={g} />
      ))}
    </Screen>
  );
}
