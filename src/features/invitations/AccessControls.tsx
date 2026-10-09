import { useState } from "react";
import { Text } from "react-native";
import { generatePin } from "../../utils/password";
import { Button, Field, styles, useFeedback } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { AppError } from "../../lib/errors";
import type { Invitation } from "../../types/domain";
import { readCache } from "../../storage/driver";
import { copyText } from "../../utils/externalLinks";
import {
  invitationLink,
  invitationPin,
  suggestedPin,
} from "../../utils/security";
export { generatePin } from "../../utils/password";
export function accessLink(i: Invitation) {
  const base = process.env.EXPO_PUBLIC_WEB_BASE_URL;
  if (!base || !i.sharing_code || i.link_active === false)
    throw new AppError("O link do convite ainda não está disponível.");
  return invitationLink(base, i.sharing_code);
}
export async function resolveAccessLink(i: Invitation, scope: string) {
  if (i.link_active === false)
    throw new AppError("O link do convite está bloqueado.");
  const legacy = i.sharing_code
    ? null
    : await readCache<Record<string, string>>(`codes:${scope}`);
  return accessLink({ ...i, sharing_code: i.sharing_code || legacy?.[i.id] });
}
export function AccessControls({
  invitation: i,
  phone = "",
  onChanged,
}: {
  invitation: Invitation;
  phone?: string;
  onChanged?: (previous: number, next: number) => void;
}) {
  const app = useApp(),
    feedback = useFeedback();
  const [pin, setPin] = useState(i.pin || ""),
    [pinVersion, setPinVersion] = useState<number | null>(null);
  const pinValue = pinVersion === null ? i.pin || "" : pin;
  const changePin = (value: string) => {
    if (pinVersion === null) setPinVersion(i.version);
    setPin(value);
  };
  const action = async (name: string, extra: Record<string, unknown> = {}) => {
    const version = name === "PIN_SAVE" ? (pinVersion ?? i.version) : i.version;
    const result = await app.admin(name, { id: i.id, version, ...extra });
    if (name === "PIN_SAVE") setPinVersion(null);
    onChanged?.(version, version + 1);
    return result;
  };
  return (
    <>
      <Text style={styles.small}>
        {i.pin ? "Senha configurada" : "Senha não configurada"} ·{" "}
        {i.link_active ? "Link ativo" : "Link bloqueado"} ·{" "}
        {i.device_count || 0} dispositivo(s) ·{" "}
        {i.sent_at ? "Convite enviado" : "Convite não enviado"} ·{" "}
        {i.first_activated_at ? "Já ativado" : "Ainda não ativado"}
      </Text>
      <Field
        label={i.kind === "INDIVIDUAL" ? "Senha" : "Senha da família"}
        value={pinValue}
        onChangeText={changePin}
        keyboardType="number-pad"
        maxLength={4}
      />
      <Button
        secondary
        title="Gerar senha"
        onPress={() => changePin(generatePin())}
      />
      <Button
        secondary
        title="Sugerir senha pelo WhatsApp"
        disabled={!suggestedPin(phone)}
        onPress={() => changePin(suggestedPin(phone)!)}
      />
      <Button
        title="Salvar senha"
        disabled={!invitationPin.safeParse(pinValue).success}
        onPress={() =>
          feedback.run(() => action("PIN_SAVE", { pin: pinValue }))
        }
      />
      <Text style={styles.small}>
        Alterar a senha afeta novas ativações. Revogue os dispositivos para
        exigir nova ativação dos acessos atuais.
      </Text>
      {i.link_active ? (
        <>
          <Text selectable style={styles.small}>
            {process.env.EXPO_PUBLIC_WEB_BASE_URL && i.sharing_code
              ? accessLink(i)
              : "Se o código for antigo, o link estará disponível no dispositivo que o gerou."}
          </Text>
          <Button
            secondary
            title="Copiar link"
            onPress={() =>
              feedback.run(async () => {
                await copyText(await resolveAccessLink(i, app.scope));
                return "Link copiado.";
              })
            }
          />
          <Button
            secondary
            title="Copiar link + senha"
            disabled={!i.pin}
            onPress={() =>
              feedback.run(async () => {
                await copyText(
                  `${await resolveAccessLink(i, app.scope)}\nSenha: ${i.pin}`,
                );
                return "Link e senha copiados.";
              })
            }
          />
        </>
      ) : null}
      <Button
        secondary
        title="Regenerar link"
        disabled={!i.pin || !i.active}
        onPress={() =>
          feedback.run(async () => {
            await action("CODE_ROTATE");
            return "Novo link emitido. O anterior e os dispositivos foram revogados.";
          })
        }
      />
      <Button
        secondary
        title="Bloquear link"
        disabled={!i.link_active}
        onPress={() => feedback.run(() => action("CODE_BLOCK"))}
      />
      <Button
        secondary
        title="Revogar dispositivos"
        onPress={() => feedback.run(() => action("ACCESS_REVOKE"))}
      />
      {feedback.node}
    </>
  );
}
