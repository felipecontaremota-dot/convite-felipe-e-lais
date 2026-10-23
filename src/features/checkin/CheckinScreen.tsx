import * as Crypto from "expo-crypto";
import {
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
} from "expo-router";
import { CameraScanner } from "./CameraScanner";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Confirmation, Select } from "../../components/adminUi";
import {
  Button,
  Card,
  Empty,
  Field,
  Screen,
  styles,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { AppError } from "../../lib/errors";
import { hashToken } from "../../repositories/demo";
import type { CheckinResult, Guest, Checkin } from "../../types/domain";
import { ticketToken } from "../../utils/security";
import {
  operationalGuests,
  OperationalGuest,
} from "../ceremonial/OperationalGuests";
const time = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
export function CheckinScreen({ admin = false }: { admin?: boolean }) {
  const app = useApp(),
    feedback = useFeedback(),
    focused = useIsFocused();
  const { scanner } = useLocalSearchParams<{ scanner?: string }>();
  const [consumedScanner, setConsumedScanner] = useState<string | undefined>();
  const [removal, setRemoval] = useState<Checkin | null>(null);
  const [camera, setCamera] = useState(false),
    [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("CONFIRMED"),
    [token, setToken] = useState("");
  const [manual, setManual] = useState<Guest | null>(null),
    [result, setResult] = useState<CheckinResult | null>(null);
  const lock = useRef(false),
    scanning = useRef(false),
    requests = useRef(new Map<string, string>());
  const s = app.data,
    role = s?.role;
  const section =
    role === "CEREMONIALIST"
      ? "ceremonial"
      : admin || role === "ADMIN"
        ? "admin"
        : "ceremonial";
  useFocusEffect(useCallback(() => () => setCamera(false), []));
  const closeScanner = () => {
    setCamera(false);
    setConsumedScanner(scanner);
  };
  const scannerOpen =
    focused &&
    (camera || (!!scanner && scanner !== consumedScanner)) &&
    ["ADMIN", "CEREMONIALIST"].includes(role || "");
  const entries = s?.checkins.filter((c) => !c.local) || [];
  const people = operationalGuests(s, search, filter);
  const confirmed = operationalGuests(s, "", "CONFIRMED");
  const record = async (payload: Record<string, unknown>, key: string) => {
    if (lock.current) throw new AppError("Aguarde a conclusão do registro.");
    lock.current = true;
    setBusy(true);
    const id = requests.current.get(key) || Crypto.randomUUID();
    requests.current.set(key, id);
    try {
      const saved = await app.checkin(payload, id);
      setResult(saved);
      requests.current.delete(key);
      return saved;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const scan = async (value: string) => {
    if (scanning.current || lock.current) return "";
    scanning.current = true;
    closeScanner();
    setResult(null);
    try {
      const parsed = ticketToken(value);
      if (!parsed)
        throw new AppError(
          "QR Code inválido. Use o convite individual ou a busca manual.",
        );
      const hash = await hashToken(parsed);
      await record({ method: "QR", token_hash: hash }, `QR:${hash}`);
      return "";
    } finally {
      scanning.current = false;
    }
  };
  return (
    <Screen
      section={section}
      title={role === "CEREMONIALIST" ? "Lista de convidados" : "Dia do evento"}
    >
      <Card>
        <Text style={styles.title}>{entries.length} check-ins</Text>
        <Text style={styles.text}>
          {
            entries.filter((c) => confirmed.some((g) => g.id === c.guest_id))
              .length
          }{" "}
          / {confirmed.length} presentes
        </Text>
        <Text style={styles.text}>
          {
            confirmed.filter((g) => !entries.some((c) => c.guest_id === g.id))
              .length
          }{" "}
          confirmados aguardados
        </Text>
        <Button
          title="Preparar / atualizar cache offline"
          disabled={!app.online || busy}
          onPress={() =>
            feedback.run(async () => {
              await app.refresh();
              return "Base de consulta atualizada. A confirmação de entrada exige conexão com o servidor.";
            })
          }
        />
        {!app.online ? (
          <Text style={styles.notice}>
            Consulta offline disponível. Conecte-se para confirmar entradas;
            registros locais pendentes não são contados como presença.
          </Text>
        ) : null}
        <Button
          title="Ler QR Code"
          disabled={busy || !app.online}
          onPress={() => {
            setResult(null);
            feedback.clear();
            setCamera(true);
          }}
        />
        {scannerOpen ? (
          <CameraScanner
            onClose={closeScanner}
            onScan={(value) => void feedback.run(() => scan(value))}
          />
        ) : null}
        <Field
          label="Token ou conteúdo do QR (entrada acessível)"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
        />
        <Button
          secondary
          title="Validar convite"
          disabled={!token.trim() || busy || !app.online}
          onPress={() => feedback.run(() => scan(token.trim()))}
        />
        {feedback.node}
      </Card>
      {result ? (
        <Card>
          <Text accessibilityRole="header" style={styles.heading}>
            {s?.guests.find((g) => g.id === result.guest_id)?.name ||
              "Convidado"}
          </Text>
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {result.duplicate
              ? "Este convidado já teve sua entrada registrada."
              : "Entrada confirmada."}
          </Text>
          <Text style={styles.text}>
            Entrada: {time(result.created_at)} ·{" "}
            {result.method === "QR" ? "QR Code" : "Manual"}
          </Text>
          <Button
            secondary
            title="Próximo convidado"
            onPress={() => {
              setResult(null);
              setToken("");
              feedback.clear();
            }}
          />
        </Card>
      ) : null}
      <Field
        label="Buscar nome ou família"
        value={search}
        onChangeText={setSearch}
      />
      <Select
        label="Filtrar presença no evento"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "CONFIRMED", label: "Confirmados" },
          { value: "ALL", label: "Todos" },
          { value: "PENDING", label: "Pendentes" },
          { value: "DECLINED", label: "Não irão" },
          { value: "MAYBE", label: "Talvez" },
        ]}
      />
      {people.map((g) => {
        const existing = entries.find((c) => c.guest_id === g.id);
        return (
          <Card key={g.id}>
            <View testID="operational-guest">
              <OperationalGuest guest={g} data={s!} />
              {existing ? (
                <Text style={styles.text}>
                  Entrada: {time(existing.created_at)}
                </Text>
              ) : null}
              <Button
                secondary
                title={
                  existing
                    ? `Remover o registro de entrada: ${g.name}`
                    : `Registrar entrada manualmente: ${g.name}`
                }
                disabled={
                  busy || (!existing && !confirmed.some((p) => p.id === g.id))
                }
                onPress={() => {
                  feedback.clear();
                  setResult(null);
                  if (existing) setRemoval(existing);
                  else setManual(g);
                }}
              />
            </View>
          </Card>
        );
      })}
      {!people.length ? (
        <Empty text="Nenhum convidado corresponde à busca e ao filtro. Atualize os dados antes do evento." />
      ) : null}
      {manual ? (
        <Confirmation
          title="Confirmar entrada"
          text={`Deseja confirmar a entrada de ${manual.name}?`}
          confirmLabel="Confirmar"
          destructive={false}
          onCancel={() => setManual(null)}
          onConfirm={async () => {
            await record(
              { guest_id: manual.id, method: "MANUAL" },
              `MANUAL:${manual.id}`,
            );
            setManual(null);
          }}
        />
      ) : null}
      {removal ? (
        <Confirmation
          title="Remover registro de entrada"
          text={`Deseja remover o registro de entrada de ${s?.guests.find((g) => g.id === removal.guest_id)?.name || "Convidado"}?`}
          confirmLabel="Remover registro"
          onCancel={() => setRemoval(null)}
          onConfirm={async () => {
            const key = `REMOVE:${removal.id}`;
            const request = requests.current.get(key) || Crypto.randomUUID();
            requests.current.set(key, request);
            await app.removeCheckin(removal.id, request);
            requests.current.delete(key);
            setResult(null);
            setRemoval(null);
          }}
        />
      ) : null}
      <Text style={styles.heading}>Últimas entradas</Text>
      {(
        s?.checkin_history ||
        entries.map((c) => ({
          ...c,
          checkin_id: c.id,
          guest_name:
            s?.guests.find((g) => g.id === c.guest_id)?.name || "Convidado",
          action: "ENTRY" as const,
        }))
      )
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 15)
        .map((c) => (
          <Card key={c.id}>
            <Text style={styles.text}>
              {c.action === "REMOVAL"
                ? "Entrada removida"
                : "Entrada registrada"}{" "}
              — {c.guest_name} · {time(c.created_at)} · {c.method} · Operador:{" "}
              {c.actor_id}
            </Text>
            {role === "ADMIN" &&
            c.action === "ENTRY" &&
            entries.some((e) => e.id === c.checkin_id) ? (
              <Button
                secondary
                title="Reverter entrada (corrigir registro)"
                onPress={() => {
                  feedback.clear();
                  setResult(null);
                  setRemoval(entries.find((e) => e.id === c.checkin_id)!);
                }}
              />
            ) : null}
          </Card>
        ))}
    </Screen>
  );
}
