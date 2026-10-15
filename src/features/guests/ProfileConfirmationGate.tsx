import { useEffect, useId, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { ConfirmModal, AdminModal } from "../../components/AdminModal";
import { Button, Field, styles } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { friendlyError } from "../../lib/errors";
import { useFxToast } from "../../components/FxToastProvider";
import { formatProfilePhone, profilePhone } from "./profileContact";
import { normalizePhone } from "../../utils/security";
import {
  confirmationMembers,
  confirmationTitle,
  profileConfirmationPending,
  profileConfirmationSchema,
} from "./profileConfirmation";
import type { Contact, Guest } from "../../types/domain";

export function ProfileConfirmationGate() {
  const app = useApp();
  if (
    app.data?.role !== "GUEST" ||
    !app.data.profile_confirmation?.supported ||
    app.loading
  )
    return null;
  return (
    <ConfirmationSession
      key={`${app.scope}:${app.data.current_invitation_id || app.data.invitations[0]?.id}`}
    />
  );
}
function ConfirmationSession() {
  const app = useApp();
  const pending = profileConfirmationPending(app.data);
  const [visible, setVisible] = useState(pending);
  const [closing, setClosing] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [revision, setRevision] = useState(0);
  const { reducedMotion } = useFxToast();
  if (pending && !visible) setVisible(true);
  if (!pending && visible && !closing) setClosing(true);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(
      () => {
        setVisible(false);
        setClosing(false);
      },
      reducedMotion ? 0 : 200,
    );
    return () => clearTimeout(timer);
  }, [closing, reducedMotion]);
  const members = confirmationMembers(app.data);
  const selected = members.find(
    (g) => g.id === app.data?.profile_confirmation?.guest_id,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const request = useRef({ key: "", id: "" });
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const identify = async (id: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    if (request.current.key !== id)
      request.current = { key: id, id: Crypto.randomUUID() };
    try {
      await app.profileMutation(
        "PROFILE_IDENTIFY",
        { guest_id: id },
        request.current.id,
      );
      request.current = { key: "", id: "" };
    } catch (e) {
      if (active.current) setError(friendlyError(e));
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  const leave = async () => {
    await app.logout();
    router.replace("/");
  };
  if (!visible) return null;
  return (
    <>
      {Platform.OS === "web" ? (
        <style>{`
      [data-registration="true"][data-premium-modal="open"]{animation:registration-in 300ms cubic-bezier(.22,1,.36,1) both;}
      [data-registration="true"][data-premium-modal="open"]>*{animation:none;}
      [data-registration="true"][data-premium-modal="closing"]{animation:registration-out 200ms ease both;}
      @keyframes registration-in{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
      @keyframes registration-out{to{opacity:0;transform:translateY(4px) scale(.98)}}
      @media(prefers-reduced-motion:reduce){[data-registration="true"]{animation:none!important;}}
    `}</style>
      ) : null}
      <AdminModal
        title={selected ? confirmationTitle : "Quem está usando este convite?"}
        onClose={() => {}}
        dismissible={false}
        closeOnOutside={false}
        hideClose
        premium
        registration
        closing={closing}
        contentWidth={520}
      >
        {selected ? (
          <ConfirmationForm
            key={`${selected.id}:${revision}`}
            guest={selected}
            onBusyChange={setBusy}
            contact={app.data?.contacts.find((c) => c.guest_id === selected.id)}
          />
        ) : (
          <View style={{ gap: 12 }}>
            <Text style={styles.text}>
              Escolha seu nome entre os integrantes deste convite. A confirmação
              será somente dos seus dados.
            </Text>
            {members.map((g) => (
              <Button
                key={g.id}
                title={g.name}
                disabled={busy || !app.online}
                onPress={() => void identify(g.id)}
                secondary
              />
            ))}
            {!members.length ? (
              <Text style={styles.error}>
                Não foi possível identificar os integrantes deste convite.
                Recarregue os dados ou procure Felipe e Laís.
              </Text>
            ) : null}
          </View>
        )}
        {!app.online ? (
          <Text accessibilityRole="alert" style={styles.error}>
            Conecte-se à internet. Sua confirmação permanece pendente.
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {app.pending.length ? (
          <Button
            title="Sincronizar alterações pendentes"
            secondary
            disabled={busy || !app.online}
            onPress={() => {
              void app
                .syncNow()
                .then(() => app.refresh())
                .then(() => {
                  setRevision((r) => r + 1);
                  setError("");
                })
                .catch((e) => setError(friendlyError(e)));
            }}
          />
        ) : null}
        <Button
          title="Carregar dados novamente"
          secondary
          disabled={busy || !app.online}
          onPress={() => {
            void app
              .refresh()
              .then((result) => {
                if ((result as { isError?: boolean } | null)?.isError)
                  throw Error("refresh failed");
                setError("");
                setRevision((r) => r + 1);
              })
              .catch(() =>
                setError(
                  "Não foi possível carregar os dados. Tente novamente.",
                ),
              );
          }}
        />
        <Button
          title="Sair deste convite"
          secondary
          onPress={() => {
            if (app.pending.length) {
              setConfirmLogout(true);
              return;
            }
            void leave().catch(() =>
              setError("Não foi possível sair. Tente novamente."),
            );
          }}
        />
      </AdminModal>
      {confirmLogout ? (
        <ConfirmModal
          title="Sair deste convite?"
          text="Há alterações pendentes neste dispositivo. Sair irá descartá-las. Deseja continuar?"
          confirmLabel="Sair e descartar"
          onCancel={() => setConfirmLogout(false)}
          onConfirm={leave}
        />
      ) : null}
    </>
  );
}
function ConfirmationForm({
  guest,
  contact,
  onBusyChange,
}: {
  guest: Guest;
  contact?: Contact;
  onBusyChange: (busy: boolean) => void;
}) {
  const app = useApp();
  const [draft, setDraft] = useState(() => ({
    name: guest.name,
    email: contact?.email || "",
    whatsapp: profilePhone(contact?.whatsapp || ""),
    country:
      normalizePhone(contact?.whatsapp || "").startsWith("55") &&
      normalizePhone(contact?.whatsapp || "").length === 13,
    version: guest.version,
    contact_updated_at: contact?.updated_at || null,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    active = useRef(true);
  const request = useRef({ key: "", id: "" });
  const id = useId();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const submit = async () => {
    if (lock.current || !app.online) return;
    const parsed = profileConfirmationSchema.safeParse({
      ...draft,
      whatsapp: (draft.country && draft.whatsapp ? "55" : "") + draft.whatsapp,
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      return;
    }
    setErrors({});
    setError("");
    lock.current = true;
    setBusy(true);
    onBusyChange(true);
    const payload = {
      guest_id: guest.id,
      ...parsed.data,
      version: draft.version,
      contact_updated_at: draft.contact_updated_at,
    };
    const key = JSON.stringify(payload);
    if (request.current.key !== key)
      request.current = { key, id: Crypto.randomUUID() };
    try {
      await app.profileMutation("PROFILE_CONFIRM", payload, request.current.id);
    } catch (e) {
      if (active.current) setError(friendlyError(e));
    } finally {
      lock.current = false;
      if (active.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  };
  return (
    <View style={{ gap: 14 }}>
      <Text style={[styles.text, { textAlign: "center" }]}>
        Queremos garantir que todos os recados importantes cheguem até você!
        Confira seus dados abaixo e confirme para continuar. 💌
      </Text>
      <Field
        label="Nome completo"
        value={draft.name}
        editable={!busy}
        maxLength={200}
        autoComplete="name"
        onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
        aria-invalid={!!errors.name}
        aria-describedby={errors.name ? `${id}-name` : undefined}
      />
      {errors.name ? (
        <Text
          nativeID={`${id}-name`}
          accessibilityRole="alert"
          style={styles.error}
        >
          {errors.name}
        </Text>
      ) : null}
      <Field
        label="WhatsApp"
        value={formatProfilePhone(draft.whatsapp)}
        editable={!busy}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={22}
        onChangeText={(value) =>
          setDraft((d) => ({
            ...d,
            whatsapp: profilePhone(value),
            country:
              d.country ||
              (normalizePhone(value).length === 13 &&
                normalizePhone(value).startsWith("55")),
          }))
        }
        aria-invalid={!!errors.whatsapp}
        aria-describedby={errors.whatsapp ? `${id}-phone` : undefined}
      />
      {errors.whatsapp ? (
        <Text
          nativeID={`${id}-phone`}
          accessibilityRole="alert"
          style={styles.error}
        >
          {errors.whatsapp}
        </Text>
      ) : null}
      <Field
        label="E-mail"
        value={draft.email}
        editable={!busy}
        maxLength={320}
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        onChangeText={(email) => setDraft((d) => ({ ...d, email }))}
        aria-invalid={!!errors.email}
        aria-describedby={errors.email ? `${id}-email` : undefined}
      />
      {errors.email ? (
        <Text
          nativeID={`${id}-email`}
          accessibilityRole="alert"
          style={styles.error}
        >
          {errors.email}
        </Text>
      ) : null}
      <Button
        title={busy ? "Confirmando…" : "Confirmar"}
        disabled={busy || !app.online}
        onPress={submit}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
