import { useState } from "react";
import { Text } from "react-native";
import {
  Button,
  Card,
  Choice,
  Empty,
  Field,
  Screen,
  Toggle,
  styles,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";

export function GuestsScreen() {
  const app = useApp(),
    feedback = useFeedback();
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [view, setView] = useState("PERSON"),
    [name, setName] = useState(""),
    [family, setFamily] = useState(""),
    [guestId, setGuestId] = useState(""),
    [guestVersion, setGuestVersion] = useState<number | undefined>(),
    [group, setGroup] = useState(""),
    [companion, setCompanion] = useState(""),
    [remove, setRemove] = useState(false);
  const families = app.data?.invitations.filter((i) => i.active) || [];
  const guests =
    app.data?.guests.filter(
      (g) =>
        (
          g.name +
          " " +
          app.data?.invitations.find((i) => i.id === g.invitation_id)?.name
        )
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === "ALL" ||
          app.data?.rsvps.some(
            (r) => r.guest_id === g.id && r.status === filter,
          )),
    ) || [];
  return (
    <Screen section="admin" title="Cada pessoa, um lugar na nossa história">
      <Card>
        <Field label="Nome do convidado" value={name} onChangeText={setName} />
        <Field label="Grupo / vínculo" value={group} onChangeText={setGroup} />
        <Choice
          value={family}
          onChange={setFamily}
          options={families.map((i) => ({ value: i.id, label: i.name }))}
        />
        <Text style={styles.small}>Acompanhante de</Text>
        <Choice
          value={companion}
          onChange={setCompanion}
          options={[
            { value: "", label: "Não se aplica" },
            ...(app.data?.guests
              .filter((g) => g.id !== guestId && g.invitation_id === family)
              .map((g) => ({ value: g.id, label: g.name })) || []),
          ]}
        />
        <Button
          title={guestId ? "Salvar / mover integrante" : "Adicionar integrante"}
          disabled={!family || !name.trim()}
          onPress={() =>
            feedback.run(async () => {
              await app.admin("GUEST_SAVE", {
                id: guestId || null,
                version: guestVersion,
                name: name.trim(),
                invitation_id: family,
                group_label: group,
                companion_of: companion || null,
              });
              setName("");
              setGuestId("");
            })
          }
        />
        {guestId ? (
          <>
            <Toggle
              label="Confirmo a remoção do integrante e seus dados relacionados"
              value={remove}
              onChange={setRemove}
            />
            <Button
              secondary
              title="Remover integrante"
              disabled={!remove}
              onPress={() =>
                feedback.run(async () => {
                  await app.admin("GUEST_REMOVE", {
                    id: guestId,
                    version: guestVersion,
                  });
                  setGuestId("");
                  setName("");
                  setRemove(false);
                })
              }
            />
            <Button
              secondary
              title="Cancelar edição"
              onPress={() => {
                setGuestId("");
                setName("");
              }}
            />
          </>
        ) : null}
        {feedback.node}
      </Card>
      <Field
        label="Buscar pessoa ou família"
        value={search}
        onChangeText={setSearch}
      />
      <Choice
        value={view}
        onChange={setView}
        options={[
          { value: "PERSON", label: "Por pessoa" },
          { value: "FAMILY", label: "Por família" },
        ]}
      />
      <Choice
        value={filter}
        onChange={setFilter}
        options={[
          { value: "ALL", label: "Todos" },
          { value: "CONFIRMED", label: "Confirmados" },
          { value: "DECLINED", label: "Não irão" },
          { value: "PENDING", label: "Pendentes" },
        ]}
      />
      {view === "FAMILY"
        ? families.map((i) => (
            <Card key={i.id}>
              <Text style={styles.heading}>{i.name}</Text>
              {guests
                .filter((g) => g.invitation_id === i.id)
                .map((g) => (
                  <Text key={g.id} style={styles.text}>
                    {g.name} ·{" "}
                    {app.data?.rsvps.find((r) => r.guest_id === g.id)?.status}
                  </Text>
                ))}
            </Card>
          ))
        : guests.map((g) => {
            const r = app.data?.rsvps.find((r) => r.guest_id === g.id),
              c = app.data?.contacts.find((c) => c.guest_id === g.id);
            return (
              <Card key={g.id}>
                <Text style={styles.heading}>{g.name}</Text>
                <Text style={styles.text}>
                  {
                    app.data?.invitations.find((i) => i.id === g.invitation_id)
                      ?.name
                  }{" "}
                  · {r?.status} ·{" "}
                  {app.data?.checkins.some((c) => c.guest_id === g.id)
                    ? "Presente"
                    : "Ainda não entrou"}
                </Text>
                <Text style={styles.small}>
                  Restrição: {r?.dietary || "Não informada"} · Contato:{" "}
                  {c?.email || c?.whatsapp || "Não informado"}
                </Text>
                <Button
                  secondary
                  title={`Editar ${g.name}`}
                  onPress={() => {
                    setGuestId(g.id);
                    setGuestVersion(g.version);
                    setName(g.name);
                    setFamily(g.invitation_id);
                    setGroup(g.group_label);
                    setCompanion(g.companion_of || "");
                    setRemove(false);
                  }}
                />
              </Card>
            );
          })}
      {!guests.length ? (
        <Empty text="Nenhum convidado corresponde ao filtro." />
      ) : null}
    </Screen>
  );
}
