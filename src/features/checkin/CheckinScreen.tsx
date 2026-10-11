import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
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
import { familyTicketToken, ticketToken } from "../../utils/security";
import { validateCredential } from "./domain";
export function CheckinScreen({ admin = false }: { admin?: boolean }) {
  const app = useApp(),
    feedback = useFeedback();
  const [permission, request] = useCameraPermissions(),
    [camera, setCamera] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [token, setToken] = useState(""),
    [preview, setPreview] = useState<{
      guest?: string;
      family?: string;
      hash?: string;
      method: "QR" | "MANUAL";
    } | null>(null);
  const s = app.data;
  const local: Checkin[] = app.pending.flatMap((m) => {
    const ids =
      m.type === "CHECKIN_CREATE"
        ? [String(m.payload.guest_id)]
        : m.type === "CHECKIN_FAMILY_CREATE" &&
            Array.isArray(m.payload.guest_ids)
          ? m.payload.guest_ids.map(String)
          : [];
    return ids.map((guest) => ({
      id: `${m.mutationId}:${guest}`,
      event_id: s?.event.id || "",
      guest_id: guest,
      mutation_id: m.mutationId,
      method:
        m.payload.method === "MANUAL" ? ("MANUAL" as const) : ("QR" as const),
      actor_id: "Este dispositivo",
      created_at: m.createdAt,
      local: true,
    }));
  });
  const checkins = [
    ...(s?.checkins || []),
    ...local.filter((c) => !s?.checkins.some((x) => x.guest_id === c.guest_id)),
  ];
  const confirmed =
    s?.guests.filter((g) =>
      s.rsvps.some((r) => r.guest_id === g.id && r.status === "CONFIRMED"),
    ) || [];
  const scan = async (value: string) => {
    setCamera(false);
    const familyToken = familyTicketToken(value);
    if (familyToken) {
      const hash = await hashToken(familyToken);
      const credential = (s?.family_credentials || []).find(
        (c) => c.token_hash === hash && !c.revoked_at,
      );
      const unit = s?.invitations.find(
        (i) =>
          i.id === credential?.invitation_id &&
          i.kind === "FAMILY" &&
          i.active &&
          !i.archived_at,
      );
      if (!unit)
        throw new AppError(
          "Convite familiar inválido, revogado ou ausente no cache.",
        );
      setSelected(
        confirmed
          .filter(
            (g) =>
              g.invitation_id === unit.id &&
              !checkins.some((c) => c.guest_id === g.id),
          )
          .map((g) => g.id),
      );
      setPreview({ family: unit.id, hash, method: "QR" });
      return "Convite familiar localizado. Confira quem está presente.";
    }
    const parsed = ticketToken(value);
    if (!parsed) throw new AppError("QR inválido. Use a busca manual.");
    const hash = await hashToken(parsed);
    const validation = validateCredential(hash, s?.credentials || [], checkins);
    if (validation.status === "invalid")
      throw new AppError(
        "Convite inválido, revogado ou ausente no cache. Sincronize ou busque pelo nome.",
      );
    const holder = confirmed.find(
      (g) => g.id === validation.credential.guest_id,
    );
    const unit = s?.invitations.find((i) => i.id === holder?.invitation_id);
    if (!holder || !unit?.active || unit.archived_at)
      throw new AppError(
        "Este convite não possui presença confirmada ou acesso ativo.",
      );
    setPreview({ guest: validation.credential.guest_id, hash, method: "QR" });
    return validation.status === "used"
      ? "Convidado já registrado. Confira abaixo."
      : "Convite localizado. Confira o nome e confirme a entrada.";
  };
  const existing = checkins.find((c) => c.guest_id === preview?.guest);
  const person = s?.guests.find((g) => g.id === preview?.guest);
  const family = s?.invitations.find((i) => i.id === preview?.family);
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
          confirmados aguardados
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
      {preview?.family && family ? (
        <Card>
          <Text style={styles.heading}>
            {s?.guests.find((g) => g.id === family.primary_guest_id)?.name ||
              family.name}{" "}
            e Família — Presentes:
          </Text>
          {s?.guests
            .filter((g) => g.invitation_id === family.id)
            .map((g) => {
              const registered = checkins.find((c) => c.guest_id === g.id);
              const eligible = confirmed.some((c) => c.id === g.id);
              const label = `${g.name}${g.id === family.primary_guest_id ? " — Responsável" : ""}`;
              return (
                <View key={g.id}>
                  {eligible && !registered ? (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityLabel={label}
                      accessibilityState={{ checked: selected.includes(g.id) }}
                      aria-checked={selected.includes(g.id)}
                      style={[
                        styles.nav,
                        selected.includes(g.id) && styles.selected,
                      ]}
                      onPress={() =>
                        setSelected((ids) =>
                          ids.includes(g.id)
                            ? ids.filter((id) => id !== g.id)
                            : [...ids, g.id],
                        )
                      }
                    >
                      <Text style={styles.text}>
                        {selected.includes(g.id) ? "☑" : "☐"} {label}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.text}>
                      {label} ·{" "}
                      {registered
                        ? `Presente${registered.local ? " · aguardando sincronização" : ""}`
                        : "RSVP não confirmado"}
                    </Text>
                  )}
                </View>
              );
            })}
          <Button
            title="Confirmar"
            disabled={!selected.length}
            onPress={() =>
              feedback.run(async () => {
                const result = await app.send("CHECKIN_FAMILY_CREATE", {
                  invitation_id: family.id,
                  guest_ids: selected,
                  token_hash: preview.hash,
                });
                setPreview(null);
                return result;
              })
            }
          />
          <Button secondary title="Cancelar" onPress={() => setPreview(null)} />
        </Card>
      ) : preview ? (
        <Card>
          <Text style={styles.badge}>
            {existing ? "CONVIDADO JÁ REGISTRADO" : "CONFIRMAR ENTRADA"}
          </Text>
          <Text style={styles.heading}>
            Convite individual — {person?.name}
          </Text>
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
                    guest_id: preview.guest!,
                    method: preview.method,
                    token_hash: preview.hash || null,
                  });
                  setPreview(null);
                  return result;
                })
              }
            />
          )}
          <Button secondary title="Cancelar" onPress={() => setPreview(null)} />
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
        <Empty text="Não há confirmados na base local. Atualize o cache antes do evento." />
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
