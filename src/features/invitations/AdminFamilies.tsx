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
import * as Crypto from "expo-crypto";
import {
  invitationPin,
  suggestedPin,
  invitationLink,
} from "../../utils/security";

function generatePin() {
  const bytes = Crypto.getRandomBytes(2);
  return String(((bytes[0]! << 8) + bytes[1]!) % 10000).padStart(4, "0");
}

function FamilyCard({ invitation: i }: { invitation: Invitation }) {
  const app = useApp(),
    feedback = useFeedback();
  const members =
    app.data?.guests.filter((g) => g.invitation_id === i.id) || [];
  const [name, setName] = useState(i.name),
    [pin, setPin] = useState(i.pin || ""),
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
        if (active)
          setCode(
            i.link_active === false
              ? ""
              : i.sharing_code || codes?.[i.id] || "",
          );
      },
    );
    return () => {
      active = false;
    };
  }, [app.scope, i.id, i.sharing_code, i.link_active]);
  const primaryGuest = members.find((g) => g.id === primary);
  const phone =
    app.data?.contacts.find((c) => c.guest_id === primary)?.whatsapp || "";
  const pending = members.filter((g) =>
    app.data?.rsvps.some((r) => r.guest_id === g.id && r.status === "PENDING"),
  ).length;
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
        confirmados · {pending} pendentes
      </Text>
      <Text style={styles.small}>
        Responsável: {primaryGuest?.name || "Não definido"} · WhatsApp:{" "}
        {phone || "Não informado"}
      </Text>
      <Text style={styles.small}>
        Link: {i.link_active ? "ativo" : "não disponível"} · Ativação:{" "}
        {i.device_count || 0} dispositivo(s) · Envio:{" "}
        {i.sent_at ? "Enviado" : "Não enviado"} ·{" "}
        {i.first_activated_at ? "Já ativado" : "Ainda não ativado"}
      </Text>
      <Field
        label="PIN da família"
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        maxLength={4}
      />
      <Button
        secondary
        title="Sugerir pelo WhatsApp"
        disabled={!suggestedPin(phone)}
        onPress={() => setPin(suggestedPin(phone)!)}
      />
      <Button
        secondary
        title="Gerar PIN"
        onPress={() => setPin(generatePin())}
      />
      <Button
        title="Salvar PIN"
        disabled={!invitationPin.safeParse(pin).success}
        onPress={() =>
          feedback.run(() =>
            app.admin("PIN_SAVE", { id: i.id, version: i.version, pin }),
          )
        }
      />
      <Text style={styles.small}>
        Alterar o PIN afeta novas ativações. Para exigir nova ativação dos
        dispositivos atuais, revogue os acessos separadamente.
      </Text>
      <Button
        secondary
        title="Revogar dispositivos"
        onPress={() =>
          feedback.run(() =>
            app.admin("ACCESS_REVOKE", { id: i.id, version: i.version }),
          )
        }
      />
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
        disabled={!i.active || !i.pin}
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
          <Button
            title="Copiar link + PIN"
            disabled={!i.pin}
            onPress={() =>
              feedback.run(async () => {
                const base = process.env.EXPO_PUBLIC_WEB_BASE_URL;
                if (!base)
                  throw new AppError(
                    "Configure EXPO_PUBLIC_WEB_BASE_URL para copiar o link HTTPS.",
                  );
                await copyText(`${invitationLink(base, code)}\nPIN: ${i.pin}`);
                return "Link e PIN copiados.";
              })
            }
          />
        </>
      ) : (
        <Text style={styles.small}>
          Salve um PIN e gere o link. Links antigos só podem ser recuperados no
          dispositivo que os emitiu; regenerar invalida o anterior e os vínculos
          atuais.
        </Text>
      )}
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
    [primaryName, setPrimaryName] = useState(""),
    [pin, setPin] = useState(""),
    [search, setSearch] = useState("");
  return (
    <Screen section="admin" title="Famílias & convites">
      <Card>
        <Field
          label="Nome da nova família"
          value={name}
          onChangeText={setName}
        />
        <Field
          label="Nome do responsável inicial (opcional)"
          value={primaryName}
          onChangeText={setPrimaryName}
        />
        <Text style={styles.small}>
          Se informado, será cadastrado como integrante. Você também pode
          definir o responsável depois de cadastrar os convidados.
        </Text>
        <Field
          label="PIN inicial (opcional)"
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          maxLength={4}
        />
        <Button
          secondary
          title="Gerar PIN inicial"
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
                primary_name: primaryName.trim() || null,
                pin: pin || null,
              });
              setPrimaryName("");
              setPin("");
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
