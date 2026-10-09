import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
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
import { demoEnabled, eventId, supabase } from "../../lib/supabase";
import { DEMO_CODE, DEMO_PIN } from "../../repositories/demo";
import {
  codeFromLink,
  invitationPin,
  staffDestination,
} from "../../utils/security";
import { passwordLogin } from "./staffAuth";
export function PublicHome() {
  const app = useApp(),
    feedback = useFeedback();
  const [code, setCode] = useState(""),
    [pin, setPin] = useState("");
  useEffect(() => {
    if (app.data?.role)
      router.replace(staffDestination(app.data.role) || "/inicio");
  }, [app.data?.role]);
  return (
    <Screen title="Nossa próxima aventura">
      <Card>
        <Text style={styles.title}>Um novo capítulo, juntos.</Text>
        <Text style={styles.text}>
          15 de dezembro de 2026 · 16h · Horário de Brasília
        </Text>
        <Text style={styles.text}>
          Abra o link exclusivo que recebeu dos noivos ou informe o código e a
          senha do seu convite.
        </Text>
        <Field
          label="Código do convite"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
        />
        <Field
          label="Senha de acesso"
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
        />
        <Button
          title="Abrir meu convite"
          disabled={!code.trim() || !invitationPin.safeParse(pin).success}
          onPress={() =>
            feedback.run(() =>
              app.enter(codeFromLink(code.trim()) || code.trim(), pin),
            )
          }
        />
        {feedback.node}
      </Card>
      <Button
        secondary
        title="Acesso dos noivos e cerimonial"
        onPress={() => router.push("/login")}
      />
      {demoEnabled ? (
        <Card>
          <Text style={styles.heading}>Conhecer a demonstração</Text>
          <Text style={styles.small}>
            Somente em desenvolvimento. Nenhum acesso privilegiado ao Supabase.
          </Text>
          <Button
            title="Demo convidado"
            onPress={() => app.enter(DEMO_CODE, DEMO_PIN)}
          />
          <Button title="Demo noivos" onPress={() => app.demoLogin("ADMIN")} />
          <Button
            title="Demo cerimonial"
            onPress={() => app.demoLogin("CEREMONIALIST")}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
export function InvitationAccess() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const app = useApp(),
    feedback = useFeedback();
  const [pin, setPin] = useState(""),
    [family, setFamily] = useState<{ code: string; name: string } | null>(null),
    [error, setError] = useState("");
  const identify = app.identify;
  useEffect(() => {
    let active = true;
    // Identification never binds the anonymous UID or reveals the roster.
    void identify(code)
      .then((result) => {
        if (!active) return;
        setFamily({ code, name: result.name });
        setError("");
        if (result.activated) router.replace("/inicio");
      })
      .catch((e: unknown) => {
        if (active)
          setError(
            e instanceof AppError ? e.message : "Código ou senha inválido.",
          );
      });
    return () => {
      active = false;
    };
    // The lookup is tied to this URL. Auth-state re-renders must not repeat signup/lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  return (
    <Screen title="Seu convite">
      <Card>
        <Text style={styles.heading}>
          {family?.code === code
            ? `Olá, ${family.name}!`
            : "Convite preparado para você"}
        </Text>
        <Text style={styles.text}>
          Este convite foi preparado especialmente para vocês.
        </Text>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Field
          label="Senha de acesso"
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
        />
        <Button
          title="Abrir nosso convite"
          disabled={!invitationPin.safeParse(pin).success}
          onPress={() =>
            feedback.run(async () => {
              await app.enter(code, pin);
              router.replace("/inicio");
            })
          }
        />
        {feedback.node}
        <Button secondary title="Voltar" onPress={() => router.replace("/")} />
      </Card>
    </Screen>
  );
}
export function Login() {
  const app = useApp(),
    feedback = useFeedback();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current || !email.includes("@") || !password) return;
    submitting.current = true;
    setBusy(true);
    try {
      await feedback.run(async () => {
        if (!supabase)
          throw new AppError("Configure o Supabase para usar o login.");
        const role = await passwordLogin(supabase, eventId, email, password);
        router.replace(staffDestination(role)!);
      });
    } finally {
      setPassword("");
      submitting.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    const path = staffDestination(app.data?.role || null);
    if (path) router.replace(path);
  }, [app.data?.role]);
  return (
    <Screen title="Acesso dos noivos e cerimonial">
      <Card>
        <Text style={styles.text}>
          Entre com o e-mail e a senha da sua conta autorizada. O papel de
          acesso é verificado no servidor.
        </Text>
        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          returnKeyType="go"
          editable={!busy}
          onSubmitEditing={() => void submit()}
        />
        <Button
          title="Entrar"
          disabled={busy || !email.includes("@") || !password}
          onPress={submit}
        />
        <Button
          secondary
          title="Esqueci minha senha"
          disabled={!email.includes("@")}
          onPress={() =>
            feedback.run(async () => {
              if (!supabase)
                throw new AppError(
                  "Configure o Supabase para recuperar a senha.",
                );
              const base = process.env.EXPO_PUBLIC_WEB_BASE_URL;
              if (!base)
                throw new AppError(
                  "A recuperação por e-mail ainda não está configurada.",
                );
              const { error } = await supabase.auth.resetPasswordForEmail(
                email.trim(),
                { redirectTo: `${base.replace(/\/$/, "")}/recuperar-senha` },
              );
              if (error)
                throw new AppError(
                  "Não foi possível solicitar a recuperação. Tente novamente mais tarde.",
                );
              return "Se houver uma conta para este e-mail, você receberá as instruções de recuperação.";
            })
          }
        />
        {feedback.node}
        <Button
          secondary
          title="Voltar ao convite"
          onPress={() => router.replace("/")}
        />
      </Card>
    </Screen>
  );
}
