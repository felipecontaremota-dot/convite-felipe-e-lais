import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
  type TextInputProps,
} from "react-native";
import { router, usePathname } from "expo-router";
import { theme } from "../theme/tokens";
import { useApp } from "../lib/AppProvider";
import { canAccess } from "../utils/security";
import { Confirmation } from "./adminUi";
import { mutationAction } from "../storage/syncLabels";
import { friendlyError } from "../lib/errors";
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.paper },
  content: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    padding: 24,
    gap: 20,
    paddingBottom: 60,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: 22,
    gap: 12,
  },
  title: { fontFamily: "Georgia", fontSize: 36, color: theme.colors.ink },
  heading: { fontSize: 23, color: theme.colors.ink, fontWeight: "600" },
  text: { fontSize: 16, lineHeight: 25, color: theme.colors.muted },
  small: { fontSize: 13, lineHeight: 20, color: theme.colors.muted },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: theme.colors.ink,
    backgroundColor: "#FFF",
    width: "100%",
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.ink,
  },
  nav: {
    padding: 12,
    minHeight: 48,
    borderRadius: 10,
    borderColor: theme.colors.line,
    borderWidth: 1,
  },
  selected: { backgroundColor: "#F4EDDD", borderColor: theme.colors.gold },
  selectedText: { color: theme.colors.ink, fontWeight: "700" },
  notice: { backgroundColor: theme.colors.wash, padding: 14, borderRadius: 10 },
  error: { color: theme.colors.error, fontSize: 15 },
  badge: {
    color: theme.colors.gold,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
  },
});
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void | Promise<unknown>;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      aria-disabled={disabled || busy}
      aria-busy={busy}
      disabled={disabled || busy}
      onPress={async () => {
        setBusy(true);
        try {
          await onPress();
        } finally {
          setBusy(false);
        }
      }}
      style={({ pressed }) => [
        styles.button,
        secondary && { backgroundColor: theme.colors.wash },
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? theme.colors.ink : "#FFF"} />
      ) : (
        <Text
          style={{
            fontSize: 15,
            color: secondary ? theme.colors.ink : "#FFF",
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.small}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.muted}
        style={[
          styles.input,
          props.multiline && { minHeight: 90, textAlignVertical: "top" },
        ]}
        {...props}
      />
    </View>
  );
}
export function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityLabel={option.label}
          accessibilityState={{ checked: value === option.value }}
          aria-checked={value === option.value}
          onPress={() => onChange(option.value)}
          style={[styles.nav, value === option.value && styles.selected]}
        >
          <Text
            style={[styles.text, value === option.value && styles.selectedText]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      aria-checked={value}
      onPress={() => onChange(!value)}
      style={[styles.nav, styles.row]}
    >
      <Text style={styles.text}>
        {value ? "☑" : "☐"} {label}
      </Text>
    </Pressable>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Empty({ text = "Nada por aqui ainda." }: { text?: string }) {
  return <Text style={styles.text}>{text}</Text>;
}
export function useFeedback() {
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  return {
    message,
    error,
    run: async (fn: () => Promise<unknown>) => {
      setMessage("");
      setError("");
      try {
        const result = await fn();
        setMessage(typeof result === "string" ? result : "Alteração salva.");
      } catch (e) {
        setError(friendlyError(e));
      }
    },
    node: (
      <>
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {message}
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </>
    ),
  };
}
const nav = {
  guest: [
    ["Início", "/inicio"],
    ["Presença", "/presenca"],
    ["Ingressos", "/ingressos"],
    ["Presentes", "/presentes"],
    ["Como chegar", "/como-chegar"],
    ["Mensagens", "/mensagens"],
    ["Informações", "/informacoes"],
    ["Perfil", "/perfil"],
  ],
  admin: [
    ["Painel", "/painel"],
    ["Famílias", "/familias"],
    ["Convidados", "/convidados"],
    ["Presentes", "/gestao-presentes"],
    ["Mensagens", "/gestao-mensagens"],
    ["Notificações", "/notificacoes"],
    ["Dia do evento", "/dia-do-evento"],
    ["Local", "/configuracao"],
    ["Minha conta", "/conta"],
  ],
  ceremonial: [
    ["Check-in", "/checkin"],
    ["Minha conta", "/conta"],
  ],
};
export function Screen({
  title,
  section,
  children,
}: {
  title: string;
  section?: "guest" | "admin" | "ceremonial";
  children: React.ReactNode;
}) {
  const app = useApp();
  const pathname = usePathname();
  const feedback = useFeedback();
  const [discardFailed, setDiscardFailed] = useState<string | null>(null);
  const failed = app.pending.find((p) => p.lastError);
  const [discard, setDiscard] = useState(false);
  const guard = section && !canAccess(app.data?.role || null, section);
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.row}>
        <Text style={[styles.title, { flexGrow: 1 }]}>
          Felipe <Text style={{ color: theme.colors.gold }}>&</Text> Laís
        </Text>
        <Text style={styles.badge}>15 · 12 · 2026</Text>
      </View>
      {app.isDemo ? (
        <Text style={styles.notice}>
          DEMONSTRAÇÃO LOCAL · Dados fictícios. Nenhum envio externo.
        </Text>
      ) : null}
      {section && !guard ? (
        <View style={styles.row}>
          {nav[section].map(([label, path]) => (
            <Pressable
              key={path}
              accessibilityRole="link"
              accessibilityState={{ selected: pathname === path }}
              aria-current={pathname === path ? "page" : undefined}
              onPress={() => router.push(path as never)}
              style={[styles.nav, pathname === path && styles.selected]}
            >
              <Text
                style={[styles.small, pathname === path && styles.selectedText]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      {!app.online ? (
        <Text style={styles.notice}>
          Sem conexão · exibindo os últimos dados salvos neste dispositivo.
        </Text>
      ) : null}
      {app.pending.length ? (
        <Card>
          <Text style={styles.text}>
            {app.pending.length}{" "}
            {app.pending.length === 1
              ? "alteração aguardando sincronização"
              : "alterações aguardando sincronização"}
          </Text>
          {failed ? (
            <>
              <Text style={styles.error}>{mutationAction(failed.type)}</Text>
              <Text style={styles.small}>Tentativas: {failed.attempts}</Text>
              <Text style={styles.error}>{failed.lastError}</Text>
              <Button
                secondary
                title="Descartar alteração com erro"
                onPress={() => setDiscardFailed(failed.mutationId)}
              />
            </>
          ) : null}
          <Button
            title="Sincronizar agora"
            disabled={!app.online}
            onPress={() => feedback.run(app.syncNow)}
          />
        </Card>
      ) : null}
      {discardFailed ? (
        <Confirmation
          confirmLabel="Descartar"
          text="Descartar esta alteração com erro? Ela será removida somente deste dispositivo e não será reenviada. As demais alterações serão preservadas."
          onCancel={() => setDiscardFailed(null)}
          onConfirm={async () => {
            await app.discardFailed(discardFailed);
            setDiscardFailed(null);
          }}
        />
      ) : null}
      {app.loading && section ? (
        <ActivityIndicator accessibilityLabel="Carregando convite" />
      ) : null}
      {guard && !app.loading ? (
        <Card>
          <Text style={styles.text}>
            Acesso restrito. Abra seu convite ou entre com sua conta autorizada.
          </Text>
          <Button
            title="Voltar ao início"
            onPress={() => router.replace("/")}
          />
        </Card>
      ) : null}
      {app.error && section ? (
        <Card>
          <Text accessibilityRole="alert" style={styles.error}>
            Não foi possível atualizar os dados.
          </Text>
          <Button
            title="Tentar novamente"
            onPress={() => feedback.run(app.refresh)}
          />
        </Card>
      ) : null}
      {!guard ? children : null}
      {feedback.node}
      {section && !guard ? (
        <>
          {app.pending.length ? (
            <Toggle
              label="Descartar alterações locais não sincronizadas ao sair"
              value={discard}
              onChange={setDiscard}
            />
          ) : null}
          <Button
            disabled={app.pending.length > 0 && !discard}
            secondary
            title="Sair deste dispositivo"
            onPress={() =>
              feedback.run(async () => {
                await app.logout();
                router.replace("/");
                return "Sessão encerrada.";
              })
            }
          />
        </>
      ) : null}
      <Text style={styles.small}>
        Com carinho, Felipe & Laís · Seus dados são usados para organizar o
        casamento. Consentimentos podem ser revogados no Perfil.
      </Text>
    </ScrollView>
  );
}
