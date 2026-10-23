import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { Button, Card, Screen } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { WeddingOverview } from "../guests/HomeScreen";
export function CeremonialHome() {
  const app = useApp();
  return (
    <Screen section="ceremonial" title="Bem-vindo ao nosso dia">
      <Card>
        <WeddingOverview startsAt={app.data?.event.starts_at} />
        <Button
          title="Ler convite"
          disabled={!app.online}
          onPress={() =>
            router.push({
              pathname: "/dia-do-evento",
              params: { scanner: Crypto.randomUUID() },
            })
          }
        />
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
    </Screen>
  );
}
