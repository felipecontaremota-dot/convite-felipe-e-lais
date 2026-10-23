import { useState } from "react";
import { router } from "expo-router";
import { AdminModal } from "../../components/AdminModal";
import { Button, Card, Screen } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { WeddingOverview } from "../guests/HomeScreen";
export function CeremonialHome() {
  const app = useApp(),
    [invitation, setInvitation] = useState(false);
  return (
    <Screen section="ceremonial" title="Bem-vindo ao nosso dia">
      <Card>
        <WeddingOverview startsAt={app.data?.event.starts_at} />
        <Button title="Ler convite" onPress={() => setInvitation(true)} />
        <Button
          secondary
          title="Ver informações"
          onPress={() => router.push("/informacoes")}
        />
        <Button
          secondary
          title="Lista de padrinhos"
          onPress={() => router.push("/padrinhos")}
        />
      </Card>
      {invitation ? (
        <AdminModal
          title="Felipe & Laís — Nosso convite"
          onClose={() => setInvitation(false)}
          captureKeyboard
        >
          <WeddingOverview startsAt={app.data?.event.starts_at} />
        </AdminModal>
      ) : null}
    </Screen>
  );
}
