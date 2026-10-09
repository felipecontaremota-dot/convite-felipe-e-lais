import React from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider } from "../src/lib/AppProvider";
const query = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000 } },
});
export default function Layout() {
  return (
    <QueryClientProvider client={query}>
      <AppProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AppProvider>
    </QueryClientProvider>
  );
}
