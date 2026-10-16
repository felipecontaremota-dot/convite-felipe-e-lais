import { PartyProvider } from "../src/features/weddingParty/PartyProvider";
import { ProfileConfirmationGate } from "../src/features/guests/ProfileConfirmationGate";
import { FxToastProvider } from "../src/components/FxToastProvider";
import { InstallProvider } from "../src/features/install/InstallProvider";
import { ThemeStyles } from "../src/components/ThemeStyles";
import React from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider } from "../src/lib/AppProvider";
import { FloatingMessages } from "../src/components/FloatingMessages";
import { MessageCenterProvider } from "../src/features/messages/MessageCenterContext";
import { FloatingAdminMessages } from "../src/components/FloatingAdminMessages";
const query = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000 } },
});
export default function Layout() {
  return (
    <QueryClientProvider client={query}>
      <AppProvider>
        <InstallProvider>
          <FxToastProvider>
            <ThemeStyles />
            <PartyProvider>
              <MessageCenterProvider>
                <Stack screenOptions={{ headerShown: false }} />
                <FloatingMessages />
                <FloatingAdminMessages />
                <ProfileConfirmationGate />
              </MessageCenterProvider>
            </PartyProvider>
          </FxToastProvider>
        </InstallProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}
