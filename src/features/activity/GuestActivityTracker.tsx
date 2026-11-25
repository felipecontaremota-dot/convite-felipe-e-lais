import { useEffect, useRef } from "react";
import { usePathname } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useApp } from "../../lib/AppProvider";
import { recordGuestActivity } from "../../repositories/api";
import { activityRoutes } from "./domain";

// One document-level tracker, not a listener on each Screen or render.
export function GuestActivityTracker() {
  const app = useApp();
  const path = usePathname();
  const last = useRef("");
  const guest = app.data?.profile_confirmation?.confirmed_at
    ? app.data.profile_confirmation.guest_id
    : null;
  useEffect(() => {
    if (app.loading) return;
    const key = `${app.scope}:${path}`;
    if (last.current === key) return;
    if (app.data?.role !== "GUEST") {
      last.current = "";
      return;
    }
    // Wait for individual identification; never choose a roster member here.
    if (!guest) return;
    last.current = key;
    if (app.online && !app.isDemo && activityRoutes[path])
      void recordGuestActivity(activityRoutes[path]!, randomUUID()).catch(
        () => undefined,
      );
  }, [
    app.loading,
    app.scope,
    app.data?.role,
    app.online,
    app.isDemo,
    guest,
    path,
  ]);
  return null;
}
