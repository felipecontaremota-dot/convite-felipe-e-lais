import { theme } from "../../theme/tokens";
import {
  router,
  useLocalSearchParams,
  usePathname,
  useIsFocused,
} from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text } from "react-native";
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
import { invitationPin, staffDestination } from "../../utils/security";
import { WeddingCountdown } from "../../components/WeddingCountdown";
import { WEDDING_START } from "../countdown/domain";
import { useInvitationEntry } from "./useInvitationEntry";
import { passwordLogin } from "./staffAuth";
import { HomeProposalVideo } from "../../components/HomeProposalVideo";
export function PublicHome() {
  const pathname = usePathname();
  const app = useApp();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const entry = useInvitationEntry();
  useEffect(() => {
    if (pathname === "/" && app.data?.role && !entry.busy && !entry.error)
      router.replace(staffDestination(app.data.role) || "/inicio");
  }, [app.data?.role, pathname, entry.busy, entry.error]);
  return (
    <HomeProposalVideo active={pathname === "/" && !app.data?.role}>
      {({ titleAccessory, video, headerAccessory }) => (
        <Screen
          title="Um novo capítulo, juntos."
          titleAccessory={titleAccessory}
          videoSlots={{ titleAccessory, video, headerAccessory }}
        >
          {video}
          <Card>
            <WeddingCountdown startsAt={WEDDING_START} />
            <Field
              label="Nome do convidado"
              value={name}
              onChangeText={(value) =>
                setName(value.toLocaleUpperCase("pt-BR"))
              }
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={200}
              editable={!entry.busy}
            />
            <Field
              label="Senha do convite"
              value={pin}
              onChangeText={(value) => setPin(value.replace(/[^0-9]/g, ""))}
              editable={!entry.busy}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
            />
            <Button
              title="Abrir convite"
              disabled={
                entry.busy ||
                !name.trim() ||
                !invitationPin.safeParse(pin).success
              }
              onPress={() => entry.run(() => app.enterByName(name, pin))}
            />
            {entry.error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {entry.error}
              </Text>
            ) : null}
            {entry.canResume ? (
              <Button
                secondary
                title="Carregar convite novamente"
                onPress={entry.resume}
              />
            ) : null}
          </Card>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Acesso dos noivos e cerimonial"
            onPress={() => router.push("/login")}
            style={{ alignSelf: "center", padding: 12, marginTop: 12 }}
          >
            <Text
              style={[
                styles.small,
                {
                  color: theme.colors.secondary,
                  textDecorationLine: "underline",
                },
              ]}
            >
              Acesso dos noivos e cerimonial
            </Text>
          </Pressable>
          {demoEnabled ? (
            <Card>
              <Text style={styles.heading}>Conhecer a demonstração</Text>
              <Text style={styles.small}>
                Somente em desenvolvimento. Nenhum acesso privilegiado ao
                Supabase.
              </Text>
              <Button
                title="Demo convidado"
                onPress={() => app.enter(DEMO_CODE, DEMO_PIN)}
              />
              <Button
                title="Demo noivos"
                onPress={() => app.demoLogin("ADMIN")}
              />
              <Button
                title="Demo cerimonial"
                onPress={() => app.demoLogin("CEREMONIALIST")}
              />
            </Card>
          ) : null}
        </Screen>
      )}
    </HomeProposalVideo>
  );
}
export function InvitationAccess() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const focused = useIsFocused();
  const app = useApp();
  const entry = useInvitationEntry();
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
            e instanceof AppError
              ? e.message
              : "Não foi possível carregar o convite agora. Tente novamente.",
          );
      });
    return () => {
      active = false;
    };
    // The lookup is tied to this URL. Auth-state re-renders must not repeat signup/lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  return (
    <HomeProposalVideo active={focused} origin="header">
      {({ headerAccessory, video }) => (
        <Screen
          title="Seu convite"
          videoPosition="header"
          videoSlots={{ titleAccessory: null, headerAccessory, video }}
        >
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
              disabled={entry.busy || !invitationPin.safeParse(pin).success}
              onPress={() => entry.run(() => app.enter(code, pin))}
            />
            {entry.error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {entry.error}
              </Text>
            ) : null}
            {entry.canResume ? (
              <Button
                secondary
                title="Carregar convite novamente"
                onPress={entry.resume}
              />
            ) : null}
            <Button
              secondary
              title="Voltar"
              onPress={() => router.replace("/")}
            />
          </Card>
        </Screen>
      )}
    </HomeProposalVideo>
  );
}
export function Login() {
  const pathname = usePathname();
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
    if (pathname === "/login" && path) router.replace(path);
  }, [app.data?.role, pathname]);
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
