import { useState, useRef, useEffect } from "react";
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
import { AdminModal, SelectedChips } from "../../components/AdminModal";
import { useApp } from "../../lib/AppProvider";
import {
  lastInvitationDelivery,
  retainedInvitationRequest,
} from "./invitationDelivery";
import type { Guest } from "../../types/domain";
import * as Crypto from "expo-crypto";
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
function GuestForm({
  guest,
  onClose,
  onSaved,
}: {
  guest?: Guest;
  onClose: () => void;
  onSaved: () => void;
}) {
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
    <AdminModal
      title={guest ? "Editar convidado" : "Adicionar convidado"}
      onClose={onClose}
    >
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
            onSaved();
            onClose();
          })
        }
      />
      <Button secondary title="Cancelar" onPress={onClose} />
      {feedback.node}
    </AdminModal>
  );
}
export function GuestsScreen() {
  const [sendAllOpen, setSendAllOpen] = useState(false);
  const requests = useRef(new Map<string, string>());
  const acknowledged = useRef(new Set<string>());
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [overrideKey, setOverrideKey] = useState<string | null>(null);

  const app = useApp(),
    feedback = useFeedback();
  useEffect(() => {
    const history = app.data?.invitation_deliveries || [];
    for (const [key, request] of requests.current) {
      const rows = history.filter((d) => d.request_id === request);
      if (rows.length && rows.every((d) => d.status !== "pending"))
        requests.current.delete(key);
    }
    for (const delivery of history) {
      if (
        delivery.status !== "pending" ||
        !delivery.request_id ||
        acknowledged.current.has(delivery.request_id)
      )
        continue;
      const keys = (app.data?.guests || [])
        .filter(
          (g) =>
            g.id === delivery.guest_id ||
            (g.invitation_id === delivery.invitation_id &&
              app.data?.contacts.some(
                (c) =>
                  c.guest_id === g.id &&
                  c.email.trim().toLowerCase() === delivery.recipient_email,
              )),
        )
        .map((g) => g.id);
      if (delivery.bulk) keys.push("bulk");
      for (const key of keys)
        if (!requests.current.has(key))
          requests.current.set(key, delivery.request_id);
    }
    setPendingKeys([...requests.current.keys()]);
  }, [app.data]);
  const deliver = async (guest?: string) => {
    const key = guest || "bulk";
    if (!requests.current.has(key)) {
      if (guest && requests.current.has("bulk"))
        return "Há um envio em massa com resultado não confirmado. Use Tentar novamente nessa operação antes de iniciar um envio individual.";
      if (!guest && requests.current.size)
        return "Há convites individuais com resultado não confirmado. Verifique essas operações antes de iniciar um envio em massa.";
    }
    let result;
    try {
      result = await retainedInvitationRequest(
        requests.current,
        key,
        Crypto.randomUUID,
        (request) => app.sendInvitations(request, guest),
      );
    } finally {
      setPendingKeys([...requests.current.keys()]);
    }
    return result.message;
  };
  const activePeople = (app.data?.guests || []).filter((g) =>
    app.data?.invitations.some(
      (i) => i.id === g.invitation_id && i.active && !i.archived_at,
    ),
  );
  const sendable = activePeople.filter((g) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      app.data?.contacts.find((c) => c.guest_id === g.id)?.email.trim() || "",
    ),
  );
  const uniqueRecipients = new Set(
    sendable.map(
      (g) =>
        `${g.invitation_id}:${app.data?.contacts
          .find((c) => c.guest_id === g.id)
          ?.email.trim()
          .toLowerCase()}`,
    ),
  ).size;
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
  const [deleteGuestId, setDeleteGuestId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const routeKey = `${routeGuest || ""}:${routeEdit || ""}`;
  const [previousRoute, setPreviousRoute] = useState(routeKey);
  if (previousRoute !== routeKey) {
    setPreviousRoute(routeKey);
    setDetail(routeGuest || "");
    setForm(routeEdit === "true" && routeGuest ? routeGuest : null);
  }
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
    if (routeGuest) router.setParams({ guest: undefined, edit: undefined });
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
      <Button
        secondary
        title="Enviar todos os convites"
        onPress={() => setSendAllOpen(true)}
      />
      {pendingKeys.map((key) => (
        <Card key={`pending-${key}`}>
          <Text style={styles.text}>
            {key === "bulk"
              ? "Envio em massa"
              : `Convite de ${app.data?.guests.find((g) => g.id === key)?.name || "convidado"}`}
            : resultado não confirmado.
          </Text>
          <Button
            secondary
            title="Tentar novamente"
            onPress={() =>
              feedback.run(() => deliver(key === "bulk" ? undefined : key))
            }
          />
          <Button
            secondary
            title="Iniciar novo envio após verificação"
            onPress={() => setOverrideKey(key)}
          />
        </Card>
      ))}
      {overrideKey ? (
        <Confirmation
          text="O resultado do envio anterior não pôde ser confirmado. Um novo envio pode fazer o convidado receber o convite novamente. Deseja continuar?"
          confirmLabel="Reenviar mesmo assim"
          onCancel={() => setOverrideKey(null)}
          onConfirm={async () => {
            const key = overrideKey;
            const previous = requests.current.get(key);
            if (previous) acknowledged.current.add(previous);
            requests.current.set(key, Crypto.randomUUID());
            setOverrideKey(null);
            await feedback.run(() => deliver(key === "bulk" ? undefined : key));
          }}
        />
      ) : null}
      {sendAllOpen ? (
        <AdminModal
          title="Enviar todos os convites"
          onClose={() => setSendAllOpen(false)}
        >
          <Text style={styles.text}>
            {activePeople.length} convidados ativos · {sendable.length} com
            e-mail válido · {activePeople.length - sendable.length} sem e-mail
            válido.
          </Text>
          <Text style={styles.text}>
            {uniqueRecipients} convites serão enviados. E-mails iguais na mesma
            unidade recebem somente um convite neste envio.
          </Text>
          <Button
            title="Enviar"
            onPress={() =>
              feedback.run(async () => {
                const result = await deliver();
                setSendAllOpen(false);
                return result;
              })
            }
          />
          <Button
            secondary
            title="Cancelar"
            onPress={() => setSendAllOpen(false)}
          />
          {feedback.node}
        </AdminModal>
      ) : null}
      {notice ? (
        <Text role="status" style={styles.small}>
          {notice}
        </Text>
      ) : null}
      {form !== null ? (
        <GuestForm
          key={form}
          guest={data?.guests.find((g) => g.id === form)}
          onClose={() => {
            setForm(null);
            closeDetail();
          }}
          onSaved={() => setNotice("Convidado salvo.")}
        />
      ) : null}
      {selected.length ? (
        <Card>
          <Text style={styles.heading}>{selected.length} selecionado(s)</Text>
          <SelectedChips
            items={data?.guests.filter((g) => selected.includes(g.id)) || []}
            onRemove={toggle}
            onClear={() => setSelected([])}
          />
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
          confirmLabel={confirm === "delete" ? "Excluir" : "Adicionar"}
          destructive={confirm === "delete"}
          text={
            confirm === "delete"
              ? "Excluir definitivamente os convidados selecionados e seus dados relacionados? Esta ação não é remover da família."
              : "Adicionar os convidados selecionados à família? Os dispositivos anteriores serão revogados. Se houver membros de outra família, eles serão transferidos."
          }
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
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
          }}
        />
      ) : null}
      {deleteGuestId ? (
        <Confirmation
          text="Tem certeza que deseja excluir este convidado(a)? A ação não poderá ser desfeita e ele será removido da família que fizer parte."
          onCancel={() => setDeleteGuestId(null)}
          onConfirm={async () => {
            await app.admin("GUEST_DELETE", confirmationPayload);
            setSelected((ids) => ids.filter((id) => id !== deleteGuestId));
            if (detail === deleteGuestId) closeDetail();
            setDeleteGuestId(null);
          }}
        />
      ) : null}
      {current && invitation && form === null ? (
        <AdminModal title={current.name} onClose={closeDetail}>
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
            showUrl={false}
            invitation={invitation}
            phone={
              data?.contacts.find(
                (c) => c.guest_id === invitation.primary_guest_id,
              )?.whatsapp
            }
          />
          <Text style={styles.small}>
            {(() => {
              const last = lastInvitationDelivery(
                data?.invitation_deliveries,
                current.id,
                invitation.id,
                data?.contacts.find((c) => c.guest_id === current.id)?.email ||
                  "",
              );
              return last?.sent_at
                ? `Último convite enviado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(last.sent_at))}`
                : "Convite ainda não enviado";
            })()}
          </Text>
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
          <Button secondary title="Fechar" onPress={closeDetail} />
        </AdminModal>
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
              {g.admin_notes?.trim() ? (
                <Text
                  accessibilityLabel="Possui observação administrativa"
                  {...(Platform.OS === "web"
                    ? { title: "Possui observação" }
                    : {})}
                  style={{
                    color: "#FFFFFF",
                    backgroundColor: "#A2222C",
                    borderRadius: 14,
                    minWidth: 28,
                    textAlign: "center",
                    padding: 4,
                    fontWeight: "800",
                    fontSize: 17,
                  }}
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
                icon="send"
                label={`Enviar convite para ${g.name}`}
                onPress={() =>
                  feedback.run(async () => {
                    if (
                      !requests.current.has(g.id) &&
                      !data?.contacts
                        .find((c) => c.guest_id === g.id)
                        ?.email.trim()
                    )
                      return "Este convidado não possui e-mail cadastrado.";
                    return deliver(g.id);
                  })
                }
              />
              <IconButton
                icon="delete"
                label={`Excluir convidado ${g.name}`}
                onPress={() => {
                  if (!data) return;
                  setConfirmationPayload({
                    guests: expectedGuests(data, [g.id]),
                  });
                  setDeleteGuestId(g.id);
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
