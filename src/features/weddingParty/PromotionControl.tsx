import { useRef, useState } from "react";
import { Text } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../../lib/AppProvider";
import { Button, Field, styles } from "../../components/ui";
import { Select } from "../../components/adminUi";
import { AdminModal, ConfirmModal } from "../../components/AdminModal";
import { friendlyError } from "../../lib/errors";
import * as api from "../../repositories/api";
import * as demo from "../../repositories/demo";
import type { Guest } from "../../types/domain";
import type { PartyRole } from "./types";
export function PromotionControl({
  guest,
  gender,
}: {
  guest?: Guest;
  gender: string;
}) {
  const app = useApp(),
    client = useQueryClient();
  const [explicit, setExplicit] = useState("");
  const [removing, setRemoving] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [editVersion, setEditVersion] = useState<{
    cycle: string | null;
    message: string | null;
    displayName: string | null;
    role: PartyRole;
  } | null>(null);
  const beginEdit = () => {
    const selected = query.data?.role || role;
    if (!selected) return;
    setEditVersion({
      cycle: query.data?.cycle_id || null,
      message: query.data?.personal_message ?? null,
      displayName: query.data?.display_name ?? null,
      role: selected,
    });
    setMessage(query.data?.personal_message || "");
    setDisplayName(query.data?.display_name || "");
    setError("");
    setEditing(true);
  };
  const lock = useRef(false);
  const key = ["party-admin", app.scope, guest?.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      app.isDemo
        ? demo.demoPartyAdminGet(guest!.id)
        : api.weddingPartyAdminGet(guest!.id),
    enabled: !!guest,
    retry: false,
  });
  const role: PartyRole | null =
    gender === "MASCULINE"
      ? "PADRINHO"
      : gender === "FEMININE"
        ? "MADRINHA"
        : explicit === "PADRINHO" || explicit === "MADRINHA"
          ? explicit
          : null;
  const change = async (value: PartyRole | null) => {
    if (lock.current || !guest) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await (app.isDemo
        ? demo.demoPartyAdminSet(guest.id, value, query.data?.cycle_id || null)
        : api.weddingPartyAdminSet(
            guest.id,
            value,
            query.data?.cycle_id || null,
          ));
      client.setQueryData(key, result);
      await client.invalidateQueries({ queryKey: ["party-state"] });
      setRemoving(false);
    } catch (e) {
      setError(friendlyError(e));
      await query.refetch();
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const saveMessage = async () => {
    if (lock.current || !guest || !editVersion) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const version = editVersion;
    try {
      const result = await (app.isDemo
        ? demo.demoPartyAdminSave(
            guest.id,
            version.role,
            version.cycle,
            message,
            version.message,
            displayName,
            version.displayName,
          )
        : api.weddingPartyAdminSaveDetails(
            guest.id,
            version.role,
            version.cycle,
            message,
            version.message,
            displayName,
            version.displayName,
          ));
      client.setQueryData(key, result);
      await client.invalidateQueries({ queryKey: ["party-state"] });
      setEditing(false);
    } catch (e) {
      setError(friendlyError(e));
      await query.refetch();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!guest)
    return (
      <Text style={styles.small}>
        Após salvar, abra a edição para promover este convidado a padrinho ou
        madrinha.
      </Text>
    );
  return (
    <>
      {query.data ? (
        <>
          <Text style={styles.text}>
            {query.data.role === "PADRINHO" ? "Padrinho" : "Madrinha"}
          </Text>
          <Button
            secondary
            title="Editar mensagem especial"
            disabled={busy || !app.online}
            onPress={beginEdit}
          />
          <Button
            secondary
            title="Remover promoção"
            disabled={busy || !app.online}
            onPress={() => setRemoving(true)}
          />
        </>
      ) : (
        <>
          {!gender && (
            <Select
              label="Classificação especial"
              value={explicit}
              onChange={setExplicit}
              options={[
                { value: "", label: "Selecione" },
                { value: "PADRINHO", label: "Padrinho" },
                { value: "MADRINHA", label: "Madrinha" },
              ]}
            />
          )}
          <Button
            secondary
            title={
              role === "MADRINHA"
                ? "Promover a madrinha"
                : "Promover a padrinho"
            }
            disabled={
              !role || busy || query.isPending || query.isError || !app.online
            }
            onPress={beginEdit}
          />
        </>
      )}
      {query.isError && (
        <Button
          secondary
          title="Carregar promoção novamente"
          onPress={() => query.refetch()}
        />
      )}
      {error && !editing && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {editing && (
        <AdminModal
          title={`Mensagem especial para ${guest.name}`}
          dismissible={!busy}
          onClose={() => setEditing(false)}
        >
          <Text style={styles.text}>
            Escreva a mensagem que aparecerá na carta exclusiva deste padrinho
            ou madrinha.
          </Text>
          <Field
            label="Nome ou apelido carinhoso"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={100}
            editable={!busy}
          />
          <Text style={styles.small}>
            Informe como deseja chamar essa pessoa na carta especial. Se deixar
            em branco, será utilizado o primeiro nome cadastrado.
          </Text>
          <Field
            label="Trecho personalizado"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={12000}
            style={[styles.input, { minHeight: 200, textAlignVertical: "top" }]}
            editable={!busy}
          />
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <Button
            title={
              editVersion?.cycle
                ? "Salvar mensagem"
                : "Salvar mensagem e promover"
            }
            disabled={
              busy ||
              (!message.trim() &&
                !(
                  editVersion?.cycle &&
                  editVersion.message == null &&
                  message === ""
                )) ||
              !app.online
            }
            onPress={saveMessage}
          />
          <Button
            secondary
            title="Cancelar"
            disabled={busy}
            onPress={() => setEditing(false)}
          />
        </AdminModal>
      )}
      {removing && (
        <ConfirmModal
          title="Remover promoção"
          text="Remover a promoção e revogar o acesso ao Espaço dos Padrinhos? Os demais dados serão preservados."
          confirmLabel="Remover promoção"
          onCancel={() => setRemoving(false)}
          onConfirm={() => change(null)}
        />
      )}
    </>
  );
}
