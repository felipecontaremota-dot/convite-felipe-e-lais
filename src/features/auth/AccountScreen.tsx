import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Platform, Text } from "react-native";
import {
  Button,
  Card,
  Field,
  Screen,
  styles,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { AppError } from "../../lib/errors";
import { supabase, eventId } from "../../lib/supabase";
import { requireStaff, savePassword, StaffValidationError } from "./staffAuth";
import {
  establishRecovery,
  parseRecovery,
  takeRecoveryUrl,
} from "./recoverySession";
function PasswordForm() {
  const app = useApp(),
    feedback = useFeedback();
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  return (
    <Card>
      <Text style={styles.text}>
        Defina ou altere sua própria senha. A senha atual nunca é exibida. Use
        pelo menos 8 caracteres.
      </Text>
      <Field
        label="Nova senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <Field
        label="Confirmar nova senha"
        value={confirmation}
        onChangeText={setConfirmation}
        secureTextEntry
        autoCapitalize="none"
      />
      <Button
        title="Salvar minha senha"
        disabled={!app.online || app.isDemo || !password || !confirmation}
        onPress={() =>
          feedback.run(async () => {
            if (!supabase)
              throw new AppError("Configure o Supabase para alterar a senha.");
            await savePassword(supabase, eventId, password, confirmation);
            setPassword("");
            setConfirmation("");
            return "Senha atualizada.";
          })
        }
      />
      {feedback.node}
    </Card>
  );
}
export function AccountScreen() {
  const app = useApp();
  return (
    <Screen
      section={app.data?.role === "ADMIN" ? "admin" : "ceremonial"}
      title="Minha conta"
    >
      <PasswordForm />
    </Screen>
  );
}
export function RecoveryScreen() {
  const { token_hash, type } = useLocalSearchParams<{
    token_hash?: string;
    type?: string;
  }>();
  const [verified, setVerified] = useState(false),
    [error, setError] = useState(""),
    [sessionEstablished, setSessionEstablished] = useState(false),
    [retryRole, setRetryRole] = useState(false);
  const attempted = useRef(false);
  const validateRole = useCallback(async () => {
    if (!supabase) return;
    setError("");
    setRetryRole(false);
    try {
      await requireStaff(supabase, eventId);
      setVerified(true);
    } catch (e: unknown) {
      setError(
        e instanceof AppError
          ? e.message
          : "Não foi possível recuperar o acesso.",
      );
      setRetryRole(e instanceof StaffValidationError);
    }
  }, []);
  useEffect(() => {
    if (!supabase || attempted.current) return;
    attempted.current = true;
    const client = supabase;
    const query = new URLSearchParams();
    if (token_hash !== undefined) query.set("token_hash", token_hash);
    if (type !== undefined) query.set("type", type);
    const input =
      takeRecoveryUrl() ??
      parseRecovery(
        query.toString(),
        Platform.OS === "web" ? window.location.hash : "",
      );
    if (Platform.OS === "web")
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
    void (async () => {
      await establishRecovery(client, input);
      setSessionEstablished(true);
      await validateRole();
    })().catch((e: unknown) =>
      setError(
        e instanceof AppError
          ? e.message
          : "Não foi possível recuperar o acesso.",
      ),
    );
  }, [token_hash, type, validateRole]);
  return (
    <Screen title="Recuperar senha">
      {!supabase || error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error || "Link de recuperação inválido ou expirado."}
        </Text>
      ) : verified ? (
        <PasswordForm />
      ) : (
        <Text style={styles.text}>Validando recuperação…</Text>
      )}
      {sessionEstablished && retryRole ? (
        <Button
          title="Tentar validar acesso novamente"
          onPress={validateRole}
        />
      ) : null}
    </Screen>
  );
}
