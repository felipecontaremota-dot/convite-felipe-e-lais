import { useRef, useState } from "react";
import { Text } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../../lib/AppProvider";
import { Button, styles } from "../../components/ui";
import { Select } from "../../components/adminUi";
import { ConfirmModal } from "../../components/AdminModal";
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
            onPress={() => change(role).catch(() => undefined)}
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
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
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
