import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Text, View } from "react-native";
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
import type { Checkin } from "../../types/domain";
import { ticketToken } from "../../utils/security";
import { validateCredential } from "./domain";
export function CheckinScreen({ admin = false }: { admin?: boolean }) {
  const app = useApp(),
    feedback = useFeedback();
  const [permission, request] = useCameraPermissions(),
    [camera, setCamera] = useState(false),
    [search, setSearch] = useState(""),
    [token, setToken] = useState(""),
    [preview, setPreview] = useState<{
      guest: string;
      hash?: string;
      method: "QR" | "MANUAL";
    } | null>(null);
  const s = app.data;
  const local: Checkin[] = app.pending
    .filter((m) => m.type === "CHECKIN_CREATE")
    .map((m) => ({
      id: m.mutationId,
      event_id: s?.event.id || "",
      guest_id: String(m.payload.guest_id),
      mutation_id: m.mutationId,
      method: m.payload.method === "QR" ? "QR" : "MANUAL",
      actor_id: "Este dispositivo",
      created_at: m.createdAt,
      local: true,
    }));
  const checkins = [
    ...(s?.checkins || []),
    ...local.filter((c) => !s?.checkins.some((x) => x.guest_id === c.guest_id)),
  ];
  const confirmed = s?.guests || [];
  const scan = async (value: string) => {
    setCamera(false);
    const parsed = ticketToken(value);
    if (!parsed) throw new AppError("QR inválido. Use a busca manual.");
    const hash = await hashToken(parsed);
    const validation = validateCredential(hash, s?.credentials || [], checkins);
    if (validation.status === "invalid")
      throw new AppError(
        "Convite inválido, revogado ou ausente no cache. Sincronize ou busque pelo nome.",
      );
    setPreview({ guest: validation.credential.guest_id, hash, method: "QR" });
    return validation.status === "used"
      ? "Convidado já registrado. Confira abaixo."
      : "Convite localizado. Confira o nome e confirme a entrada.";
  };
  const existing = checkins.find((c) => c.guest_id === preview?.guest);
  const person = s?.guests.find((g) => g.id === preview?.guest);
  return (
    <Screen
      section={admin ? "admin" : "ceremonial"}
      title={admin ? "Dia do evento" : "Check-in"}
    >
      <Card>
        <Text style={styles.title}>
          {
            checkins.filter((c) => confirmed.some((g) => g.id === c.guest_id))
              .length
          }{" "}
          / {confirmed.length} presentes
        </Text>
        <Text style={styles.text}>
          {
            confirmed.filter((g) => !checkins.some((c) => c.guest_id === g.id))
              .length
          }{" "}
          convidados aguardados
        </Text>
        <Button
          title="Preparar / atualizar cache offline"
          disabled={!app.online}
          onPress={() =>
            feedback.run(async () => {
              await app.refresh();
              return "Base local atualizada. Este dispositivo pode validar os convites conhecidos sem conexão.";
            })
          }
        />
        <Button
          title="Abrir leitor QR"
          onPress={() =>
            feedback.run(async () => {
              const result = permission?.granted ? permission : await request();
              if (!result.granted)
                throw new AppError(
                  "Permissão de câmera não concedida. Use a busca manual.",
                );
              setCamera(true);
              return "Aponte a câmera para o convite.";
            })
          }
        />
        {camera ? (
          <View>
            <CameraView
              style={{ height: 280, width: "100%" }}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(result) =>
                void feedback.run(() => scan(result.data))
              }
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
          disabled={!token.trim()}
          onPress={() => feedback.run(() => scan(token.trim()))}
        />
        {feedback.node}
      </Card>
      {preview ? (
        <Card>
          <Text style={styles.badge}>
            {existing ? "CONVIDADO JÁ REGISTRADO" : "CONFIRMAR ENTRADA"}
          </Text>
          <Text style={styles.heading}>{person?.name}</Text>
          <Text style={styles.text}>
            {s?.invitations.find((i) => i.id === person?.invitation_id)?.name}
          </Text>
          {existing ? (
            <Text style={styles.text}>
              Entrada:{" "}
              {new Date(existing.created_at).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}{" "}
              · Responsável: {existing.actor_id}
              {existing.local ? " · aguardando sincronização" : ""}
            </Text>
          ) : (
            <Button
              title="Confirmar entrada"
              onPress={() =>
                feedback.run(async () => {
                  const result = await app.send("CHECKIN_CREATE", {
                    guest_id: preview.guest,
                    method: preview.method,
                    token_hash: preview.hash || null,
                  });
                  setPreview(null);
                  return result;
                })
              }
            />
          )}
          <Button
            secondary
            title="Fechar conferência"
            onPress={() => setPreview(null)}
          />
        </Card>
      ) : null}
      <Field
        label="Buscar nome ou família"
        value={search}
        onChangeText={setSearch}
      />
      {confirmed
        .filter((g) =>
          (
            g.name +
            " " +
            s?.invitations.find((i) => i.id === g.invitation_id)?.name
          )
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .map((g) => (
          <Card key={g.id}>
            <Text style={styles.heading}>{g.name}</Text>
            <Text style={styles.text}>
              {s?.invitations.find((i) => i.id === g.invitation_id)?.name} ·{" "}
              {checkins.some((c) => c.guest_id === g.id)
                ? "Presente"
                : "Aguardado"}
            </Text>
            <Button
              secondary
              title={`Registrar entrada manualmente: ${g.name}`}
              onPress={() => setPreview({ guest: g.id, method: "MANUAL" })}
            />
          </Card>
        ))}
      {!confirmed.length ? (
        <Empty text="Não há convidados na base local. Atualize o cache antes do evento." />
      ) : null}
      <Text style={styles.heading}>Últimas entradas</Text>
      {checkins
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 15)
        .map((c) => (
          <Card key={c.id}>
            <Text style={styles.text}>
              {s?.guests.find((g) => g.id === c.guest_id)?.name} ·{" "}
              {new Date(c.created_at).toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}{" "}
              · {c.method}
              {c.local ? " · salvo neste dispositivo" : ""}
            </Text>
            {admin && !c.local ? (
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
      <Text style={styles.small}>
        Dois celulares offline não conhecem instantaneamente as entradas um do
        outro. O servidor detecta duplicidades na sincronização. Convites
        revogados depois do último cache exigem conferência online.
      </Text>
    </Screen>
  );
}
