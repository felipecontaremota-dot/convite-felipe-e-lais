import { useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useFxToast } from "../../components/FxToastProvider";
import { Select, Tag } from "../../components/adminUi";
import { styles, useFeedback } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { theme } from "../../theme/tokens";
import type { Guest } from "../../types/domain";
import {
  adminRsvpOptions,
  adminRsvpStatus,
  invitationSendingHint,
} from "./adminGuestStatus";

export function GuestSendingControl({ guest }: { guest: Guest }) {
  const app = useApp(),
    feedback = useFeedback();
  const { notify } = useFxToast();
  const [saving, setSaving] = useState(false),
    lock = useRef(false);
  if (
    app.data?.role !== "ADMIN" ||
    !app.data.capabilities?.admin_guest_controls
  )
    return null;
  const sent = !!guest.invitation_sent,
    hint = invitationSendingHint(sent);
  return (
    <View style={{ maxWidth: "100%" }}>
      <Pressable
        ref={(node) => {
          if (Platform.OS === "web")
            (node as unknown as HTMLElement | null)?.setAttribute(
              "title",
              hint,
            );
        }}
        accessibilityRole="button"
        accessibilityLabel={`${hint} ${guest.name}`}
        accessibilityState={{ disabled: saving, busy: saving }}
        disabled={saving}
        {...(Platform.OS === "web" ? { "aria-pressed": sent } : {})}
        style={[
          styles.nav,
          {
            minHeight: 44,
            minWidth: 44,
            padding: 10,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
        onPress={async () => {
          if (lock.current) return;
          lock.current = true;
          setSaving(true);
          try {
            await feedback.run(async () => {
              await app.admin("GUEST_INVITATION_SENT_SET", {
                id: guest.id,
                sent: !sent,
                expected_sent: sent,
              });
              notify(
                sent
                  ? "Convite marcado como não enviado."
                  : "Convite marcado como enviado.",
              );
              return "";
            });
          } finally {
            lock.current = false;
            setSaving(false);
          }
        }}
      >
        {saving ? (
          <ActivityIndicator color={theme.colors.secondary} />
        ) : (
          <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden={true}>
            <Path
              d={
                sent
                  ? "M3 5h18v14H3zM3 5l9 7 9-7M8 15l3 3 5-5"
                  : "M3 5h18v14H3zM3 5l9 7 9-7"
              }
              fill="none"
              stroke={theme.colors.secondary}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )}
      </Pressable>
      {feedback.node}
    </View>
  );
}
export function GuestRsvpControl({ guest }: { guest: Guest }) {
  const app = useApp(),
    feedback = useFeedback();
  const { notify } = useFxToast();
  const [saving, setSaving] = useState(false),
    lock = useRef(false);
  const record = app.data?.rsvps.find((r) => r.guest_id === guest.id),
    value = adminRsvpStatus(record);
  if (
    app.data?.role !== "ADMIN" ||
    !app.data.capabilities?.admin_guest_controls
  )
    return <Tag>{adminRsvpOptions.find((o) => o.value === value)?.label}</Tag>;
  return (
    <View style={{ maxWidth: "100%", gap: 4 }}>
      <Select
        compact
        label={`Alterar confirmação de presença de ${guest.name}`}
        value={value}
        disabled={saving}
        tone={
          value === "CONFIRMED"
            ? "confirmed"
            : value === "DECLINED"
              ? "declined"
              : value === "MAYBE"
                ? "deciding"
                : "neutral"
        }
        options={adminRsvpOptions}
        onChange={async (next) => {
          if (lock.current || next === value) return;
          lock.current = true;
          setSaving(true);
          try {
            await feedback.run(async () => {
              await app.admin("GUEST_RSVP_SET", {
                id: guest.id,
                status: next,
                expected_status: record?.status || "PENDING",
                expected_responded_at: record?.responded_at || null,
              });
              notify("Confirmação de presença atualizada.");
              return "";
            });
          } finally {
            lock.current = false;
            setSaving(false);
          }
        }}
      />
      {saving ? (
        <ActivityIndicator
          accessibilityLabel="Salvando presença"
          color={theme.colors.secondary}
        />
      ) : null}
      {feedback.node}
    </View>
  );
}
