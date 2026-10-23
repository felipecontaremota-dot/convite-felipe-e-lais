import { useState } from "react";
import { View } from "react-native";
import { Card, Empty, Field, Screen } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { operationalGuests, OperationalGuest } from "./OperationalGuests";
export function PartyListScreen() {
  const app = useApp(),
    [search, setSearch] = useState("");
  const people = operationalGuests(app.data, search, "ALL", true);
  return (
    <Screen
      section={app.data?.role === "ADMIN" ? "admin" : "ceremonial"}
      title="Padrinhos"
    >
      <Field
        label="Buscar padrinho ou madrinha"
        value={search}
        onChangeText={setSearch}
      />
      {app.data?.capabilities?.ceremonial_portal === false ? (
        <Empty text="Atualize os dados para consultar as classificações." />
      ) : null}
      {people.map((g) => (
        <Card key={g.id}>
          <View testID="operational-party-guest">
            <OperationalGuest guest={g} data={app.data!} />
          </View>
        </Card>
      ))}
      {!people.length ? (
        <Empty text="Nenhum padrinho ou madrinha encontrado." />
      ) : null}
    </Screen>
  );
}
