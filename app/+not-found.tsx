import React from "react";
import { router } from "expo-router";
import { Screen, Button } from "../src/components/ui";
export default function NotFound() {
  return (
    <Screen title="Este caminho não existe">
      <Button title="Voltar ao início" onPress={() => router.replace("/")} />
    </Screen>
  );
}
