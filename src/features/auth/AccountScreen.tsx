import { useEffect, useRef, useState } from "react";
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
import { requireStaff, savePassword } from "./staffAuth";
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
            return "Senha atualizada no Supabase Auth.";
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
    [error, setError] = useState("");
  const attempted = useRef<string | null>(null);
  const valid =
    !!supabase &&
    type === "recovery" &&
    typeof token_hash === "string" &&
    /^[A-Za-z0-9_-]{20,512}$/.test(token_hash);
  const inputError = valid ? "" : "Link de recuperação inválido ou expirado.";
  useEffect(() => {
    if (!valid || !supabase || !token_hash || attempted.current === token_hash)
      return;
    attempted.current = token_hash;
    const client = supabase;
    void (async () => {
      // Consume the one-time recovery token, then erase it from the browser URL.
      const result = await client.auth.verifyOtp({
        token_hash,
        type: "recovery",
      });
      if (Platform.OS === "web")
        window.history.replaceState(null, "", window.location.pathname);
      if (result.error)
        throw new AppError("Link de recuperação inválido ou expirado.");
      await requireStaff(client, eventId);
      setVerified(true);
    })().catch((e: unknown) =>
      setError(
        e instanceof AppError
          ? e.message
          : "Não foi possível recuperar o acesso.",
      ),
    );
  }, [token_hash, valid]);
  return (
    <Screen title="Recuperar senha">
      {inputError || error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {inputError || error}
        </Text>
      ) : verified ? (
        <PasswordForm />
      ) : (
        <Text style={styles.text}>Validando recuperação…</Text>
      )}
    </Screen>
  );
}
