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
import { demoEnabled, supabase } from "../../lib/supabase";
import { DEMO_CODE } from "../../repositories/demo";
import type { Role } from "../../types/domain";
const destination = (role: Role) =>
  role === "ADMIN"
    ? "/painel"
    : role === "CEREMONIALIST"
      ? "/checkin"
      : "/inicio";
export function PublicHome() {
  const app = useApp(),
    feedback = useFeedback();
  const [code, setCode] = useState("");
  useEffect(() => {
    if (app.data?.role) router.replace(destination(app.data.role));
  }, [app.data?.role]);
  return (
    <Screen title="Nossa próxima aventura">
      <Card>
        <Text style={styles.title}>Um novo capítulo, juntos.</Text>
        <Text style={styles.text}>
          15 de dezembro de 2026 · 16h · Horário de Brasília
        </Text>
        <Text style={styles.text}>
          Abra o link exclusivo que recebeu dos noivos ou informe o código do
          seu convite.
        </Text>
        <Field
          label="Código do convite"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
        />
        <Button
          title="Abrir meu convite"
          disabled={!code.trim()}
          onPress={() => feedback.run(() => app.enter(code.trim()))}
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
          <Button title="Demo convidado" onPress={() => app.enter(DEMO_CODE)} />
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
  const attempted = useRef<string | null>(null);
  const [validated, setValidated] = useState<string | null>(null);
  useEffect(() => {
    if (code && attempted.current !== code) {
      attempted.current = code;
      void Promise.resolve().then(() =>
        feedback.run(async () => {
          await app.enter(code);
          setValidated(code);
          return "Convite validado.";
        }),
      );
    }
  }, [code, app, feedback]);
  useEffect(() => {
    if (app.data?.role === "GUEST" && validated === code)
      router.replace("/inicio");
  }, [app.data?.role, validated, code]);
  return (
    <Screen title="Seu convite">
      <Card>
        <Text style={styles.text}>
          Validando o link exclusivo da sua família…
        </Text>
        {feedback.node}
        <Button
          title="Tentar validar novamente"
          onPress={() =>
            feedback.run(async () => {
              await app.enter(code);
              setValidated(code);
              return "Convite validado.";
            })
          }
        />
        <Button secondary title="Voltar" onPress={() => router.replace("/")} />
      </Card>
    </Screen>
  );
}
export function Login() {
  const app = useApp(),
    feedback = useFeedback();
  const [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [sent, setSent] = useState(false);
  useEffect(() => {
    if (app.data?.role === "ADMIN" || app.data?.role === "CEREMONIALIST")
      router.replace(destination(app.data.role));
  }, [app.data?.role]);
  return (
    <Screen title="Acesso autorizado">
      <Card>
        <Text style={styles.text}>
          Entre com o e-mail cadastrado pelos noivos. O papel de acesso é
          verificado no servidor.
        </Text>
        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Button
          title="Receber código por e-mail"
          disabled={!email.includes("@")}
          onPress={() =>
            feedback.run(async () => {
              if (!supabase)
                throw new AppError("Configure o Supabase para usar o login.");
              const { error } = await supabase.auth.signInWithOtp({
                email: email.trim(),
                options: { shouldCreateUser: false },
              });
              if (error)
                throw new AppError(
                  "Não foi possível solicitar o código. Confira o cadastro e tente novamente.",
                );
              setSent(true);
              return "Solicitação realizada. Confira seu e-mail.";
            })
          }
        />
        {sent ? (
          <>
            <Field
              label="Código recebido"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
            />
            <Button
              title="Entrar"
              disabled={otp.length < 6}
              onPress={() =>
                feedback.run(async () => {
                  const result = await supabase!.auth.verifyOtp({
                    email: email.trim(),
                    token: otp,
                    type: "email",
                  });
                  if (result.error)
                    throw new AppError("Código inválido ou expirado.");
                  await app.refresh();
                  return "Conta autenticada.";
                })
              }
            />
          </>
        ) : null}
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
