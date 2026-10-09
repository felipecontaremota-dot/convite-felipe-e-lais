import { useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
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
import {
  Confirmation,
  IconButton,
  Select,
  SelectionCheckbox,
  Tag,
} from "../../components/adminUi";
import { useApp } from "../../lib/AppProvider";
import type { Guest } from "../../types/domain";
import { copyText } from "../../utils/externalLinks";
import {
  AccessControls,
  resolveAccessLink,
} from "../invitations/AccessControls";
import {
  GROUPS,
  RSVP_LABELS,
  brazilPhone,
  expectedGuests,
  formatPhone,
  guestContact,
  listGuests,
} from "./adminDomain";
function GuestForm({ guest, onClose }: { guest?: Guest; onClose: () => void }) {
  const app = useApp(),
    feedback = useFeedback();
  const contact = app.data?.contacts.find((c) => c.guest_id === guest?.id);
  const [expectedVersion] = useState(guest?.version);
  const [name, setName] = useState(guest?.name || ""),
    [child, setChild] = useState(!!guest?.is_child),
    [group, setGroup] = useState(guest?.group_label || ""),
    [phone, setPhone] = useState(formatPhone(contact?.whatsapp || "")),
    [email, setEmail] = useState(contact?.email || ""),
    [notes, setNotes] = useState(guest?.admin_notes || "");
  return (
    <Card>
      <Text style={styles.heading}>
        {guest ? "Editar convidado" : "Adicionar convidado"}
      </Text>
      <Field label="Nome" value={name} onChangeText={setName} maxLength={200} />
      <Toggle label="Criança (até 10 anos)" value={child} onChange={setChild} />
      <Select
        label="Grupo / vínculo"
        value={group}
        onChange={setGroup}
        options={[
          { value: "", label: "Não se aplica" },
          ...GROUPS.map((value) => ({ value, label: value })),
          ...(guest?.group_label && !GROUPS.includes(guest.group_label)
            ? [
                {
                  value: guest.group_label,
                  label: `${guest.group_label} (legado)`,
                },
              ]
            : []),
        ]}
      />
      <Field
        label="WhatsApp"
        value={phone}
        onChangeText={(value) => setPhone(formatPhone(value))}
        keyboardType="phone-pad"
      />
      <Field
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="fulano@gmail.com"
      />
      <Field
        label="Observações"
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={2000}
      />
      <Button
        title="Salvar"
        disabled={!name.trim()}
        onPress={() =>
          feedback.run(async () => {
            guestContact.parse({
              email: email.trim(),
              whatsapp: brazilPhone(phone),
            });
            await app.admin(guest ? "GUEST_UPDATE" : "GUEST_CREATE", {
              id: guest?.id || null,
              version: expectedVersion,
              name: name.trim(),
              is_child: child,
              group_label: group,
              whatsapp: brazilPhone(phone),
              email: email.trim(),
              admin_notes: notes,
            });
            onClose();
          })
        }
      />
      <Button secondary title="Cancelar" onPress={onClose} />
      {feedback.node}
    </Card>
  );
}
export function GuestsScreen() {
  const app = useApp(),
    feedback = useFeedback();
  const { guest: routeGuest, edit: routeEdit } = useLocalSearchParams<{
    guest?: string;
    edit?: string;
  }>();
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [form, setForm] = useState<string | null>(
      routeEdit === "true" && routeGuest ? routeGuest : null,
    ),
    [detail, setDetail] = useState(routeGuest || ""),
    [selected, setSelected] = useState<string[]>([]),
    [target, setTarget] = useState(""),
    [confirm, setConfirm] = useState<"delete" | "assign" | null>(null);
  const { width } = useWindowDimensions();
  const [confirmationPayload, setConfirmationPayload] = useState<
    Record<string, unknown>
  >({});
  const desktop = Platform.OS === "web" && width >= 768;
  const data = app.data;
  const guests = listGuests(data, search, filter);
  const current = data?.guests.find((g) => g.id === detail);
  const invitation = data?.invitations.find(
    (i) => i.id === current?.invitation_id,
  );
  const families =
    data?.invitations.filter(
      (i) => (i.kind || "FAMILY") === "FAMILY" && i.active && !i.archived_at,
    ) || [];
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  const prepare = (action: "delete" | "assign", ids = selected) => {
    if (!data) return;
    setConfirmationPayload({
      guests: expectedGuests(data, ids),
      target_id: target || null,
      target_version: families.find((i) => i.id === target)?.version,
      confirm_move: true,
    });
    setConfirm(action);
  };
  const closeDetail = () => {
    setDetail("");
    if (routeGuest) router.setParams({ guest: undefined });
  };
  return (
    <Screen section="admin" title="Convidados">
      <Field
        label="Buscar pessoa ou família"
        value={search}
        onChangeText={setSearch}
      />
      <Select
        label="Filtrar convidados"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "ALL", label: "Todos" },
          ...GROUPS.map((value) => ({ value, label: value })),
          { value: "CONFIRMED", label: "Confirmados" },
          { value: "DECLINED", label: "Não irão" },
          { value: "PENDING", label: "Pendentes" },
        ]}
      />
      <Button
        title="Adicionar convidado"
        onPress={() => {
          setForm("new");
          closeDetail();
        }}
      />
      {form !== null ? (
        <GuestForm
          key={form}
          guest={data?.guests.find((g) => g.id === form)}
          onClose={() => setForm(null)}
        />
      ) : null}
      {selected.length ? (
        <Card>
          <Text style={styles.heading}>{selected.length} selecionado(s)</Text>
          <Select
            label="Família de destino"
            value={target}
            onChange={setTarget}
            options={[
              { value: "", label: "Selecionar família" },
              ...families.map((i) => ({ value: i.id, label: i.name })),
            ]}
          />
          {target &&
          (!families.find((i) => i.id === target)?.pin ||
            !families.find((i) => i.id === target)?.link_active) ? (
            <Text style={styles.notice}>
              Configure a senha e gere o link da família antes de adicionar
              membros.
            </Text>
          ) : null}
          <Button
            title="Adicionar à família"
            disabled={
              !target ||
              !families.find((i) => i.id === target)?.pin ||
              !families.find((i) => i.id === target)?.link_active
            }
            onPress={() => prepare("assign")}
          />
          <Button
            secondary
            title="Excluir selecionados"
            onPress={() => prepare("delete")}
          />
          <Button
            secondary
            title="Cancelar seleção"
            onPress={() => {
              setSelected([]);
              setConfirm(null);
            }}
          />
        </Card>
      ) : null}
      {confirm ? (
        <Confirmation
          text={
            confirm === "delete"
              ? "Excluir definitivamente os convidados selecionados e seus dados relacionados? Esta ação não é remover da família."
              : "Adicionar os convidados selecionados à família? Os dispositivos anteriores serão revogados. Se houver membros de outra família, eles serão transferidos."
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            feedback.run(async () => {
              if (!data) return;
              await app.admin(
                confirm === "delete"
                  ? "GUEST_DELETE_BATCH"
                  : "GUEST_ASSIGN_FAMILY",
                confirmationPayload,
              );
              setSelected([]);
              setConfirm(null);
              closeDetail();
            })
          }
        />
      ) : null}
      {current && invitation && form === null ? (
        <Card>
          <Text style={styles.heading}>{current.name}</Text>
          <Text style={styles.text}>
            {current.is_child ? "Criança (até 10 anos)" : "Adulto"} ·{" "}
            {current.group_label || "Vínculo não informado"}
          </Text>
          <Text style={styles.text}>
            WhatsApp:{" "}
            {formatPhone(
              data?.contacts.find((c) => c.guest_id === current.id)?.whatsapp ||
                "",
            ) || "Não informado"}
          </Text>
          <Text style={styles.text}>
            E-mail:{" "}
            {data?.contacts.find((c) => c.guest_id === current.id)?.email ||
              "Não informado"}
          </Text>
          <Text style={styles.text}>
            Observações: {current.admin_notes || "Não informadas"}
          </Text>
          <Text style={styles.text}>
            {invitation.kind === "INDIVIDUAL"
              ? "Acesso individual"
              : `Acesso compartilhado pela família ${invitation.name}`}{" "}
            ·{" "}
            {
              RSVP_LABELS[
                data?.rsvps.find((r) => r.guest_id === current.id)?.status ||
                  "PENDING"
              ]
            }
          </Text>
          <AccessControls
            key={invitation.id}
            invitation={invitation}
            phone={
              data?.contacts.find(
                (c) => c.guest_id === invitation.primary_guest_id,
              )?.whatsapp
            }
          />
          <Button
            title="Editar convidado"
            onPress={() => setForm(current.id)}
          />
          <Button
            secondary
            title="Selecionar convidado"
            onPress={() => {
              toggle(current.id);
              closeDetail();
            }}
          />
          <Button secondary title="Fechar ficha" onPress={closeDetail} />
        </Card>
      ) : null}
      {guests.map((g) => {
        const unit = data?.invitations.find((i) => i.id === g.invitation_id),
          status =
            data?.rsvps.find((r) => r.guest_id === g.id)?.status || "PENDING";
        return (
          <View key={g.id} style={[styles.card, { padding: 14, gap: 8 }]}>
            <View style={styles.row}>
              {desktop || selected.length ? (
                <SelectionCheckbox
                  label={`Selecionar ${g.name}`}
                  value={selected.includes(g.id)}
                  onPress={() => toggle(g.id)}
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Abrir ficha de ${g.name}`}
                accessibilityHint="Pressione e segure para selecionar, ou selecione na ficha."
                accessibilityActions={[
                  { name: "select", label: "Selecionar convidado" },
                ]}
                onAccessibilityAction={() => toggle(g.id)}
                onLongPress={() => toggle(g.id)}
                onPress={() =>
                  selected.length && !desktop ? toggle(g.id) : setDetail(g.id)
                }
                style={{ flexGrow: 1, maxWidth: "100%" }}
              >
                <Text style={[styles.text, { fontWeight: "700" }]}>
                  {g.name}
                </Text>
              </Pressable>
              {g.group_label ? <Tag>{g.group_label}</Tag> : null}
              {unit && (unit.kind || "FAMILY") === "FAMILY" ? (
                <Tag>{unit.name}</Tag>
              ) : null}
              <Tag>{RSVP_LABELS[status]}</Tag>
              {g.is_child ? <Tag>Criança</Tag> : null}
              {g.admin_notes ? (
                <Text
                  accessibilityLabel="Possui observação administrativa"
                  style={styles.badge}
                >
                  !
                </Text>
              ) : null}
              <IconButton
                icon="copy"
                label={`Copiar link do convite de ${g.name}`}
                onPress={() =>
                  feedback.run(async () => {
                    if (unit)
                      await copyText(await resolveAccessLink(unit, app.scope));
                    return "Link copiado.";
                  })
                }
              />
              <IconButton
                icon="delete"
                label={`Excluir convidado ${g.name}`}
                onPress={() => {
                  setSelected([g.id]);
                  prepare("delete", [g.id]);
                }}
              />
            </View>
          </View>
        );
      })}
      {!guests.length ? (
        <Empty text="Nenhum convidado corresponde ao filtro." />
      ) : null}
      {feedback.node}
    </Screen>
  );
}
