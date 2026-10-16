import { createElement, useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useApp } from "../../lib/AppProvider";
import { Button, styles } from "../../components/ui";
import { useFxToast } from "../../components/FxToastProvider";
import { friendlyError } from "../../lib/errors";
import { RsvpFx } from "../rsvp/RsvpFx";
import { useParty } from "./PartyProvider";
import type { Promotion } from "./types";
import { theme } from "../../theme/tokens";
const gold = "#D6BC78",
  lightGold = "#F4E6BD";
const pageTitles: Record<string, string> = {
  dia: "O grande dia",
  traje: "Traje e orientações",
  cerimonia: "Organização da cerimônia",
  recado: "Recado dos noivos",
};
export function PartyScreen() {
  const party = useParty();
  const app = useApp();
  const identified =
    app.data?.role === "GUEST" &&
    !!app.data.profile_confirmation?.guest_id &&
    !!app.data.profile_confirmation.confirmed_at;
  const params = useLocalSearchParams<{ pagina?: string; surpresa?: string }>();
  const [checked, setChecked] = useState(false);
  const refresh = useRef(party.refresh);
  useEffect(() => {
    refresh.current = party.refresh;
  });
  useEffect(() => {
    if (!identified) return;
    let active = true;
    void refresh.current().finally(() => {
      if (active) setChecked(true);
    });
    return () => {
      active = false;
    };
  }, [params.pagina, params.surpresa, identified]);
  useEffect(() => {
    if (identified && checked && !party.loading && !party.state.promotion)
      router.replace("/inicio");
  }, [
    app.data?.role,
    identified,
    checked,
    party.loading,
    party.state.promotion,
  ]);
  if (!identified || !checked || party.loading || !party.state.promotion)
    return (
      <View
        style={{ flex: 1, backgroundColor: theme.colors.paper, padding: 24 }}
      >
        <Text style={styles.text}>Verificando acesso exclusivo…</Text>
        <Button
          secondary
          title="Voltar ao convite"
          onPress={() => router.replace("/")}
        />
      </View>
    );
  return (
    <PartyExperience
      key={`${party.state.promotion.cycle_id}:${params.surpresa === "1" ? "intro" : "menu"}`}
      promotion={party.state.promotion}
      page={params.pagina}
      surprise={params.surpresa === "1"}
    />
  );
}
function PartyExperience({
  promotion,
  page,
  surprise,
}: {
  promotion: Promotion;
  page?: string;
  surprise: boolean;
}) {
  const party = useParty(),
    app = useApp(),
    { reducedMotion } = useFxToast();
  const [stage, setStage] = useState<
    "envelope" | "pedido" | "pensar" | "aceito" | "menu"
  >(surprise && !promotion.completed_at ? "envelope" : "menu");
  const [opening, setOpening] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const guest = app.data?.guests.find((g) => g.id === promotion.guest_id);
  const name = guest?.name.trim().split(/\s+/)[0] || "";
  const act = async (action: "ACCEPT" | "COMPLETE") => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await party.respond(action);
      if (!alive.current) return;
      if (action === "ACCEPT") setStage("aceito");
      else {
        setStage("menu");
        router.replace("/padrinhos");
      }
    } catch (e) {
      if (alive.current) setError(friendlyError(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const openEnvelope = () => {
    if (opening) return;
    setOpening(true);
    timer.current = setTimeout(
      () => {
        setStage("pedido");
        setOpening(false);
      },
      reducedMotion ? 0 : 850,
    );
  };
  const heading = {
    envelope: "Você recebeu um convite especial",
    pedido: "Temos uma missão para você!",
    pensar: "Sem pressão!",
    aceito: "Agora é oficial!",
    menu: "Espaço dos Padrinhos",
  }[stage];
  const exclusivePage =
    stage === "menu" && page && pageTitles[page] ? page : null;
  const textStyle = {
    color: lightGold,
    fontSize: 18,
    lineHeight: 29,
    textAlign: "center" as const,
  };
  const event = app.data?.event;
  const fullDate = event
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: event.timezone,
      }).format(new Date(event.starts_at))
    : "Data a confirmar";
  const time = event
    ? new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: event.timezone,
      }).format(new Date(event.starts_at))
    : "Horário a confirmar";
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.ink }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        paddingVertical: 48,
        gap: 26,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {Platform.OS === "web" &&
        createElement(
          "style",
          null,
          `
    [data-party-stage] { animation: party-enter 500ms ease-out both; }
    [data-party-envelope] { animation: party-float 3.4s ease-in-out infinite; cursor:pointer; }
    [data-party-envelope][data-opening="true"] { animation:none; }
    [data-party-envelope][data-opening="true"] [data-party-flap] { transform:rotateX(180deg); }
    [data-party-flap] { clip-path:polygon(0 0,100% 0,50% 100%); border-radius:0!important; transform-origin:top; transition:transform 850ms cubic-bezier(.22,1,.36,1); }
    [data-party-card] { transition:background-color 180ms ease-out; }
    [data-party-celebration] { animation: party-enter 700ms ease-out both; }
    @keyframes party-float { 50% { transform: translateY(-8px); } }
    @keyframes party-enter { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    @media(prefers-reduced-motion:reduce) { [data-party-stage],[data-party-envelope],[data-party-celebration] { animation:none!important; } [data-party-flap], [data-party-card] { transition:none!important; } }
  `,
        )}
      {stage === "aceito" && Platform.OS === "web" ? (
        <RsvpFx status="CONFIRMED" />
      ) : null}
      <Text style={{ color: gold, letterSpacing: 2, textAlign: "center" }}>
        Felipe &amp; Laís • 15.12.2026
      </Text>
      <View
        {...(Platform.OS === "web" ? { dataSet: { partyStage: stage } } : {})}
        key={exclusivePage || stage}
        style={{
          width: "100%",
          maxWidth: 640,
          borderColor: gold,
          borderWidth: 1,
          borderRadius: 24,
          padding: 24,
          gap: 24,
          backgroundColor: theme.colors.primaryActive,
        }}
      >
        <Text style={{ color: gold, letterSpacing: 1.5, textAlign: "center" }}>
          {stage === "menu"
            ? "Acesso exclusivo"
            : stage === "pedido"
              ? "Um pedido do coração"
              : "Um convite do coração"}
        </Text>
        <Text
          accessibilityRole="header"
          style={{
            color: lightGold,
            fontFamily: "Georgia",
            fontSize: 30,
            lineHeight: 39,
            textAlign: "center",
          }}
        >
          {exclusivePage ? pageTitles[exclusivePage] : heading}
        </Text>
        {exclusivePage ? (
          <>
            {exclusivePage === "dia" ? (
              <>
                <Text style={textStyle}>{fullDate}</Text>
                <Text style={textStyle}>{time}</Text>
                <Text style={textStyle}>
                  {event?.venue_name || "Villarejo Eventos"}
                </Text>
                {event?.address && (
                  <Text style={textStyle}>{event.address}</Text>
                )}
              </>
            ) : null}
            {exclusivePage === "traje" ? (
              <Text style={textStyle}>
                {party.state.attire ||
                  "As orientações de traje serão compartilhadas aqui com carinho, assim que estiverem definidas."}
              </Text>
            ) : null}
            {exclusivePage === "cerimonia" ? (
              <Text style={textStyle}>
                {party.state.ceremony ||
                  "Em breve, os noivos compartilharão as orientações sobre chegada, cortejo e organização da cerimônia."}
              </Text>
            ) : null}
            {exclusivePage === "recado" ? (
              <Text style={textStyle}>{party.state.message}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar ao Espaço dos Padrinhos"
              onPress={() => router.replace("/padrinhos")}
              style={{
                alignSelf: "center",
                minWidth: 48,
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Svg width={26} height={26} viewBox="0 0 24 24">
                <Path
                  d="m15 18-6-6 6-6"
                  fill="none"
                  stroke={gold}
                  strokeWidth={2}
                />
              </Svg>
            </Pressable>
          </>
        ) : (
          <>
            {stage === "envelope" ? (
              <>
                <Text style={textStyle}>
                  Algumas pessoas não são apenas convidadas. Elas fazem parte da
                  nossa história.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Abrir convite especial"
                  disabled={opening}
                  onPress={openEnvelope}
                  {...(Platform.OS === "web"
                    ? {
                        dataSet: {
                          opening: String(opening),
                          partyEnvelope: "true",
                        },
                      }
                    : {})}
                  style={{
                    alignSelf: "center",
                    width: "100%",
                    maxWidth: 280,
                    height: 180,
                    backgroundColor: gold,
                    borderRadius: 12,
                    justifyContent: "center",
                    alignItems: "center",
                    marginVertical: 18,
                  }}
                >
                  <View
                    {...(Platform.OS === "web"
                      ? { dataSet: { partyFlap: "true" } }
                      : {})}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 90,
                      backgroundColor: lightGold,
                      borderBottomLeftRadius: 100,
                      borderBottomRightRadius: 100,
                    }}
                  />
                  <View
                    style={{
                      backgroundColor: theme.colors.ink,
                      width: 68,
                      height: 68,
                      borderRadius: 34,
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: 2,
                      borderColor: gold,
                    }}
                  >
                    <Text
                      style={{
                        color: lightGold,
                        fontFamily: "Georgia",
                        fontSize: 25,
                      }}
                    >
                      F&amp;L
                    </Text>
                  </View>
                </Pressable>
                <Text style={textStyle}>Toque no envelope para abrir</Text>
              </>
            ) : null}
            {stage === "pedido" ? (
              <>
                <Text style={textStyle}>
                  Entre tantas pessoas especiais, escolhemos você para estar
                  ainda mais perto de nós nesse dia inesquecível.
                </Text>
                <Text style={{ ...textStyle, fontWeight: "700", fontSize: 23 }}>
                  {name ? `${name}, ` : ""}
                  {promotion.role === "MADRINHA"
                    ? "aceita ser nossa madrinha?"
                    : "aceita ser nosso padrinho?"}
                </Text>
                <Button
                  title="💙 É claro que aceito!"
                  disabled={busy}
                  onPress={() => act("ACCEPT")}
                />
                <Button
                  secondary
                  title="Preciso pensar um pouquinho..."
                  disabled={busy}
                  onPress={() => setStage("pensar")}
                />
              </>
            ) : null}
            {stage === "pensar" ? (
              <>
                <Text style={textStyle}>
                  Sem pressão! Esse convite foi feito com carinho. Pense com
                  calma e volte quando quiser responder.
                </Text>
                <Button
                  title="Voltar ao pedido especial"
                  onPress={() => setStage("pedido")}
                />
              </>
            ) : null}
            {stage === "aceito" ? (
              <>
                <Text
                  {...(Platform.OS === "web"
                    ? { dataSet: { partyCelebration: "true" } }
                    : {})}
                  style={{ ...textStyle, fontSize: 38 }}
                >
                  💙 ✨ 💍
                </Text>
                <Text style={textStyle}>
                  Você acaba de ser promovido a uma das pessoas mais importantes
                  do nosso grande dia!
                </Text>
                <Text style={textStyle}>
                  Prometemos muitas emoções, boas risadas e uma missão especial:
                  ficar pertinho de nós no altar!
                </Text>
                <Button
                  title="Conhecer minha área especial →"
                  disabled={busy}
                  onPress={() => act("COMPLETE")}
                />
              </>
            ) : null}
            {stage === "menu" ? (
              <>
                <Text style={textStyle}>
                  Um cantinho reservado para quem estará ao nosso lado no altar.
                </Text>
                {Object.entries(pageTitles).map(([key, label]) => (
                  <PartyCard
                    key={key}
                    title={label}
                    onPress={() =>
                      router.push({
                        pathname: "/padrinhos",
                        params: { pagina: key },
                      })
                    }
                  />
                ))}
                <PartyCard
                  title="Convite"
                  description="Acesse seu convite completo."
                  onPress={() => router.replace("/inicio")}
                />
                <Button
                  secondary
                  title="Rever a surpresa ↺"
                  onPress={() => {
                    setOpening(false);
                    setStage("envelope");
                  }}
                />
              </>
            ) : null}
          </>
        )}
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={{ ...textStyle, color: lightGold }}
          >
            {error}
          </Text>
        )}
      </View>
      {stage !== "menu" && (
        <Button
          secondary
          title="Voltar ao convite"
          disabled={busy}
          onPress={() => router.replace("/inicio")}
        />
      )}
    </ScrollView>
  );
}

function PartyCard({
  title,
  description,
  onPress,
}: {
  title: string;
  description?: string;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      {...(Platform.OS === "web" ? { dataSet: { partyCard: "true" } } : {})}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: gold,
        borderRadius: 16,
        minHeight: 68,
        padding: 18,
        gap: 8,
        justifyContent: "center",
        backgroundColor:
          pressed || hovered ? `${gold}22` : theme.colors.primaryActive,
      })}
    >
      <Text
        style={{
          color: lightGold,
          fontFamily: "Georgia",
          fontSize: 20,
          lineHeight: 28,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            color: lightGold,
            fontSize: 16,
            lineHeight: 24,
            textAlign: "center",
          }}
        >
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}
