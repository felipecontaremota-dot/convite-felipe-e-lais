import { useEffect, useState } from "react";
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
import { AppError } from "../../lib/errors";
import { readCache, writeCache } from "../../storage/driver";
import type { Invitation } from "../../types/domain";
import { copyText } from "../../utils/externalLinks";
import { invitationLink } from "../../utils/security";

function FamilyCard({ invitation: i }: { invitation: Invitation }) {
  const app = useApp(),
    feedback = useFeedback();
  const members =
    app.data?.guests.filter((g) => g.invitation_id === i.id) || [];
  const [name, setName] = useState(i.name),
    [active, setActive] = useState(i.active),
    [primary, setPrimary] = useState(i.primary_guest_id || ""),
    [target, setTarget] = useState(""),
    [split, setSplit] = useState<string[]>([]),
    [splitName, setSplitName] = useState(""),
    [code, setCode] = useState(""),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let active = true;
    void readCache<Record<string, string>>(`codes:${app.scope}`).then(
      (codes) => {
        if (active) setCode(codes?.[i.id] || "");
      },
    );
    return () => {
      active = false;
    };
  }, [app.scope, i.id]);
  return (
    <Card>
      <Text style={styles.heading}>{i.name}</Text>
      <Text style={styles.small}>
        {members.length} integrantes ·{" "}
        {
          members.filter((g) =>
            app.data?.rsvps.some(
              (r) => r.guest_id === g.id && r.status === "CONFIRMED",
            ),
          ).length
        }{" "}
        confirmados · Código: ********
      </Text>
      <Field label="Nome da família" value={name} onChangeText={setName} />
      <Toggle label="Família ativa" value={active} onChange={setActive} />
      <Text style={styles.small}>Contato principal</Text>
      <Choice
        value={primary}
        onChange={setPrimary}
        options={[
          { value: "", label: "Não definido" },
          ...members.map((g) => ({ value: g.id, label: g.name })),
        ]}
      />
      <Button
        title="Salvar família"
        disabled={!name.trim()}
        onPress={() =>
          feedback.run(() =>
            app.admin("INVITATION_SAVE", {
              id: i.id,
              version: i.version,
              name: name.trim(),
              active,
              primary_guest_id: primary || null,
            }),
          )
        }
      />
      <Button
        secondary
        title="Gerar / regenerar link"
        disabled={!i.active}
        onPress={() =>
          feedback.run(async () => {
            const result = await app.admin("CODE_ROTATE", {
              id: i.id,
              version: i.version,
            });
            setCode(String(result.code));
            const codes =
              (await readCache<Record<string, string>>(`codes:${app.scope}`)) ||
              {};
            await writeCache(`codes:${app.scope}`, {
              ...codes,
              [i.id]: String(result.code),
            });
            return "Novo código emitido. O anterior foi invalidado.";
          })
        }
      />
      {code ? (
        <>
          <Text style={styles.small}>
            Novo link pronto para copiar. O código não é registrado em logs.
          </Text>
          <Button
            title="Copiar link do convite"
            onPress={() =>
              feedback.run(async () => {
                const base = process.env.EXPO_PUBLIC_WEB_BASE_URL;
                if (!base)
                  throw new AppError(
                    "Configure EXPO_PUBLIC_WEB_BASE_URL para copiar o link HTTPS.",
                  );
                await copyText(invitationLink(base, code));
                return "Link copiado.";
              })
            }
          />
        </>
      ) : null}
      <Button
        secondary
        title="Bloquear código"
        onPress={() =>
          feedback.run(async () => {
            await app.admin("CODE_BLOCK", { id: i.id, version: i.version });
            setCode("");
            const codes =
              (await readCache<Record<string, string>>(`codes:${app.scope}`)) ||
              {};
            delete codes[i.id];
            await writeCache(`codes:${app.scope}`, codes);
          })
        }
      />
      <Text style={styles.small}>Juntar integrantes a outra família</Text>
      <Choice
        value={target}
        onChange={setTarget}
        options={
          app.data?.invitations
            .filter((x) => x.id !== i.id && x.active)
            .map((x) => ({ value: x.id, label: x.name })) || []
        }
      />
      <Toggle
        label="Confirmo a transferência ou desativação desta família"
        value={confirm}
        onChange={setConfirm}
      />
      <Button
        title="Juntar famílias"
        disabled={!target || !confirm}
        onPress={() =>
          feedback.run(() =>
            app.admin("FAMILY_MERGE", {
              id: i.id,
              target_id: target,
              version: i.version,
            }),
          )
        }
      />
      <Text style={styles.small}>
        Dividir: selecione os integrantes que formarão o novo convite
      </Text>
      {members.map((g) => (
        <Toggle
          key={g.id}
          label={g.name}
          value={split.includes(g.id)}
          onChange={(v) =>
            setSplit((xs) => (v ? [...xs, g.id] : xs.filter((x) => x !== g.id)))
          }
        />
      ))}
      <Field
        label={`Nome da família resultante de ${i.name}`}
        value={splitName}
        onChangeText={setSplitName}
      />
      <Button
        title="Dividir família"
        disabled={!split.length || !splitName.trim()}
        onPress={() =>
          feedback.run(() =>
            app.admin("FAMILY_SPLIT", {
              id: i.id,
              version: i.version,
              guest_ids: split,
              name: splitName.trim(),
            }),
          )
        }
      />
      <Button
        secondary
        title="Desativar família"
        disabled={!confirm}
        onPress={() =>
          feedback.run(() =>
            app.admin("INVITATION_DISABLE", { id: i.id, version: i.version }),
          )
        }
      />
      {feedback.node}
    </Card>
  );
}

export function FamiliesScreen() {
  const app = useApp(),
    feedback = useFeedback();
  const [name, setName] = useState(""),
    [search, setSearch] = useState("");
  return (
    <Screen section="admin" title="Famílias & convites">
      <Card>
        <Field
          label="Nome da nova família"
          value={name}
          onChangeText={setName}
        />
        <Button
          title="Criar família"
          disabled={!name.trim()}
          onPress={() =>
            feedback.run(async () => {
              await app.admin("INVITATION_SAVE", { name: name.trim() });
              setName("");
            })
          }
        />
        {feedback.node}
      </Card>
      <Field label="Buscar família" value={search} onChangeText={setSearch} />
      {app.data?.invitations
        .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
        .map((i) => (
          <FamilyCard key={i.id} invitation={i} />
        ))}
      {!app.data?.invitations.length ? (
        <Empty text="Crie o primeiro convite familiar." />
      ) : null}
    </Screen>
  );
}
