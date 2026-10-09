import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import {
  Button,
  Card,
  Empty,
  Field,
  Screen,
  Toggle,
  styles,
  useFeedback,
} from "../../components/ui";
import { Confirmation, IconButton, Select } from "../../components/adminUi";
import { useApp } from "../../lib/AppProvider";
import type { Invitation } from "../../types/domain";
import { invitationPin } from "../../utils/security";
import { AccessControls, generatePin } from "./AccessControls";
import { expectedGuests, formatPhone } from "../guests/adminDomain";
function FamilyCard({ invitation: i }: { invitation: Invitation }) {
  const app = useApp(),
    feedback = useFeedback();
  const data = app.data!;
  const members = data.guests.filter((g) => g.invitation_id === i.id),
    responsible = members.find((g) => g.id === i.primary_guest_id),
    phone =
      data.contacts.find((c) => c.guest_id === i.primary_guest_id)?.whatsapp ||
      "";
  const [editVersion, setEditVersion] = useState(i.version);
  const ownChange = (previous: number, next: number) =>
    setEditVersion((v) => (v === previous ? next : v));
  const [expanded, setExpanded] = useState(false),
    [name, setName] = useState(i.name),
    [active, setActive] = useState(i.active),
    [primary, setPrimary] = useState(i.primary_guest_id || ""),
    [adding, setAdding] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [confirm, setConfirm] = useState<"delete" | string | null>(null);
  const [confirmationPayload, setConfirmationPayload] = useState<
    Record<string, unknown>
  >({});
  const prepare = (action: string) => {
    setConfirmationPayload(
      action === "delete"
        ? { id: i.id, version: i.version }
        : { guests: expectedGuests(data, [action]) },
    );
    setConfirm(action);
  };
  const available = data.guests.filter(
    (g) =>
      data.invitations.find((u) => u.id === g.invitation_id)?.kind ===
      "INDIVIDUAL",
  );
  return (
    <Card>
      <View style={styles.row}>
        <Text style={[styles.heading, { flexGrow: 1 }]}>{i.name}</Text>
        <IconButton
          icon="edit"
          label={`Editar família ${i.name}`}
          onPress={() => {
            setExpanded((v) => !v);
            setEditVersion(i.version);
            setName(i.name);
            setActive(i.active);
            setPrimary(i.primary_guest_id || "");
          }}
        />
        <IconButton
          icon="delete"
          label={`Excluir família ${i.name}`}
          onPress={() => prepare("delete")}
        />
      </View>
      <Text style={styles.small}>
        {members.length} integrantes ·{" "}
        {
          members.filter((g) =>
            data.rsvps.some(
              (r) => r.guest_id === g.id && r.status === "CONFIRMED",
            ),
          ).length
        }{" "}
        confirmados ·{" "}
        {
          members.filter((g) =>
            data.rsvps.some(
              (r) => r.guest_id === g.id && r.status === "PENDING",
            ),
          ).length
        }{" "}
        pendentes
      </Text>
      <Text style={styles.small}>
        Responsável: {responsible?.name || "Não definido"} · WhatsApp:{" "}
        {formatPhone(phone) || "Não informado"}
      </Text>
      <Text style={styles.small}>
        {i.pin ? "Senha configurada" : "Senha não configurada"}
      </Text>
      <Text style={styles.small}>
        {i.link_active ? "Link ativo" : "Link bloqueado"} ·{" "}
        {i.device_count || 0} dispositivo(s) ·{" "}
        {i.sent_at ? "Convite enviado" : "Convite não enviado"}
      </Text>
      {confirm ? (
        <Confirmation
          text={
            confirm === "delete"
              ? "Excluir esta família? Seus membros serão preservados com links e senhas individuais. Os dispositivos da família serão revogados."
              : "Remover este membro da família? Seu cadastro, RSVP e contatos serão preservados com acesso individual. Os dispositivos da família serão revogados."
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            feedback.run(async () => {
              await app.admin(
                confirm === "delete"
                  ? "FAMILY_DELETE"
                  : "GUEST_REMOVE_FROM_FAMILY",
                confirmationPayload,
              );
              if (confirm !== "delete") ownChange(i.version, i.version + 1);
              setConfirm(null);
            })
          }
        />
      ) : null}
      {expanded ? (
        <>
          <Field label="Nome da família" value={name} onChangeText={setName} />
          <Toggle label="Família ativa" value={active} onChange={setActive} />
          <Select
            label="Responsável"
            value={primary}
            onChange={setPrimary}
            options={[
              { value: "", label: "Não definido" },
              ...members.map((g) => ({ value: g.id, label: g.name })),
            ]}
          />
          <Text style={styles.small}>
            WhatsApp do responsável:{" "}
            {formatPhone(
              data.contacts.find((c) => c.guest_id === primary)?.whatsapp || "",
            ) || "Não informado"}
          </Text>
          <Button
            title="Salvar família"
            disabled={!name.trim()}
            onPress={() =>
              feedback.run(async () => {
                await app.admin("INVITATION_SAVE", {
                  id: i.id,
                  version: editVersion,
                  name: name.trim(),
                  active,
                  primary_guest_id: primary || null,
                });
                ownChange(editVersion, editVersion + 1);
              })
            }
          />
          <AccessControls
            invitation={i}
            onChanged={ownChange}
            phone={data.contacts.find((c) => c.guest_id === primary)?.whatsapp}
          />
          <Text style={styles.heading}>Membros</Text>
          {members.map((g) => (
            <View key={g.id} style={styles.row}>
              <Text style={[styles.text, { flexGrow: 1 }]}>{g.name}</Text>
              <Button
                secondary
                title={`Abrir ficha de ${g.name}`}
                onPress={() =>
                  router.push({
                    pathname: "/convidados",
                    params: { guest: g.id },
                  })
                }
              />
              <IconButton
                icon="edit"
                label={`Editar convidado ${g.name}`}
                onPress={() =>
                  router.push({
                    pathname: "/convidados",
                    params: { guest: g.id, edit: "true" },
                  })
                }
              />
              <Button
                secondary
                title={`Remover da família: ${g.name}`}
                onPress={() => prepare(g.id)}
              />
            </View>
          ))}
          <IconButton
            icon="add"
            label="Adicionar membro à família"
            onPress={() => setAdding((v) => !v)}
          />
          {adding ? (
            <Card>
              <Text style={styles.text}>Convidados com acesso individual</Text>
              {!i.pin || !i.link_active ? (
                <Text style={styles.notice}>
                  Configure a senha e gere o link da família antes de adicionar
                  membros.
                </Text>
              ) : null}
              {available.map((g) => (
                <Toggle
                  key={g.id}
                  label={g.name}
                  value={selected.includes(g.id)}
                  onChange={(v) =>
                    setSelected((ids) =>
                      v ? [...ids, g.id] : ids.filter((id) => id !== g.id),
                    )
                  }
                />
              ))}
              {!available.length ? (
                <Empty text="Nenhum convidado individual disponível." />
              ) : null}
              <Button
                title="Adicionar membros"
                disabled={!selected.length || !i.pin || !i.link_active}
                onPress={() =>
                  feedback.run(async () => {
                    await app.admin("FAMILY_ADD_MEMBERS", {
                      target_id: i.id,
                      target_version: i.version,
                      guests: expectedGuests(data, selected),
                    });
                    ownChange(i.version, i.version + 1);
                    setSelected([]);
                    setAdding(false);
                  })
                }
              />
            </Card>
          ) : null}
          <Button
            secondary
            title="Fechar edição"
            onPress={() => setExpanded(false)}
          />
        </>
      ) : null}
      {feedback.node}
    </Card>
  );
}
export function FamiliesScreen() {
  const app = useApp(),
    feedback = useFeedback();
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [pin, setPin] = useState(""),
    [search, setSearch] = useState("");
  const families = (app.data?.invitations || [])
    .filter(
      (i) =>
        (i.kind || "FAMILY") === "FAMILY" &&
        !i.archived_at &&
        i.name
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return (
    <Screen section="admin" title="Famílias">
      <Field label="Buscar família" value={search} onChangeText={setSearch} />
      <Button title="Adicionar família" onPress={() => setCreating(true)} />
      {creating ? (
        <Card>
          <Field
            label="Nome da nova família"
            value={name}
            onChangeText={setName}
          />
          <Field
            label="Senha inicial (opcional)"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Button
            secondary
            title="Gerar senha inicial"
            onPress={() => setPin(generatePin())}
          />
          <Button
            title="Criar família"
            disabled={
              !name.trim() || (!!pin && !invitationPin.safeParse(pin).success)
            }
            onPress={() =>
              feedback.run(async () => {
                await app.admin("INVITATION_SAVE", {
                  name: name.trim(),
                  pin: pin || null,
                });
                setName("");
                setPin("");
                setCreating(false);
              })
            }
          />
          <Button
            secondary
            title="Cancelar"
            onPress={() => setCreating(false)}
          />
          {feedback.node}
        </Card>
      ) : null}
      {families.map((i) => (
        <FamilyCard key={i.id} invitation={i} />
      ))}
      {!families.length ? <Empty text="Crie a primeira família." /> : null}
    </Screen>
  );
}
