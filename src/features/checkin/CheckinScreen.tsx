import { CameraView, useCameraPermissions } from "expo-camera";
import * as Crypto from "expo-crypto";
import { useFocusEffect, useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
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
import type { CheckinResult, Guest } from "../../types/domain";
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
  const [permission, request] = useCameraPermissions();
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
  const refresh = useRef(app.refresh);
  useEffect(() => {
    refresh.current = app.refresh;
  });
  // Postgres Changes is primary; bounded polling also covers reconnects and deployments
  // where realtime has not yet subscribed. Never poll while hidden or off this route.
  useEffect(() => {
    if (
      !focused ||
      !app.online ||
      !["ADMIN", "CEREMONIALIST"].includes(role || "")
    )
      return;
    const timer = setInterval(() => {
      if (Platform.OS !== "web" || document.visibilityState === "visible")
        void refresh.current().catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [focused, app.online, role]);
  useFocusEffect(useCallback(() => () => setCamera(false), []));
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
    setCamera(false);
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
    <Screen section={section} title="Dia do evento">
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
          onPress={() =>
            feedback.run(async () => {
              let allowed = permission;
              if (!allowed?.granted) {
                try {
                  allowed = await request();
                } catch {
                  throw new AppError(
                    "Câmera indisponível. Verifique a permissão e o dispositivo, ou use a busca manual.",
                  );
                }
              }
              if (!allowed.granted)
                throw new AppError(
                  "Câmera não autorizada ou indisponível. Libere o acesso nas configurações do navegador ou use a busca manual.",
                );
              setResult(null);
              setCamera(true);
              return "Aponte a câmera para o QR Code individual.";
            })
          }
        />
        {camera ? (
          <View>
            <CameraView
              facing="back"
              style={{ height: 280, width: "100%" }}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(value) =>
                void feedback.run(() => scan(value.data))
              }
              onMountError={() => {
                setCamera(false);
                void feedback.run(async () => {
                  throw new AppError(
                    "Não foi possível iniciar a câmera ou o leitor. Verifique a permissão e tente novamente, ou use a busca manual.",
                  );
                });
              }}
            />
            <Button
              secondary
              title="Fechar câmera e usar busca manual"
              onPress={() => setCamera(false)}
            />
          </View>
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
                title={`Registrar entrada manualmente: ${g.name}`}
                disabled={
                  busy || !!existing || !confirmed.some((p) => p.id === g.id)
                }
                onPress={() => {
                  feedback.clear();
                  setResult(null);
                  setManual(g);
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
      <Text style={styles.heading}>Últimas entradas</Text>
      {entries
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 15)
        .map((c) => (
          <Card key={c.id}>
            <Text style={styles.text}>
              {s?.guests.find((g) => g.id === c.guest_id)?.name || "Convidado"}{" "}
              · {time(c.created_at)} · {c.method}
            </Text>
            {role === "ADMIN" ? (
              <Button
                secondary
                title="Reverter entrada (corrigir registro)"
                onPress={() =>
                  feedback.run(() => app.admin("CHECKIN_REVERT", { id: c.id }))
                }
              />
            ) : null}
          </Card>
        ))}
    </Screen>
  );
}
