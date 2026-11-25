import { ActivityText } from "./ActivityText";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../../lib/AppProvider";
import { eventId, supabase } from "../../lib/supabase";
import { guestActivityHistory } from "../../repositories/api";
import { Button, styles } from "../../components/ui";
import { theme } from "../../theme/tokens";
import { GuestForm } from "../guests/AdminGuests";
import {
  orderedActivities,
  technicalDetails,
  type ActivityCursor,
} from "./domain";

export function Confirmations() {
  const app = useApp(),
    focused = useIsFocused(),
    client = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const active =
    focused && app.data?.role === "ADMIN" && app.online && !app.isDemo;
  const key = ["guest-activity", app.scope];
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as ActivityCursor | null,
    queryFn: ({ pageParam }) => guestActivityHistory(pageParam),
    getNextPageParam: (page) => page.next || undefined,
    enabled: active,
    staleTime: 10000,
    refetchInterval: () =>
      Platform.OS === "web" && document.hidden ? false : 30000,
    retry: 1,
  });
  useEffect(() => {
    if (!active || !supabase) return;
    const liveClient = supabase;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void client.invalidateQueries({
          queryKey: ["guest-activity", app.scope],
        });
      }, 400);
    };
    const channel = liveClient
      .channel(`guest-activity:${app.scope}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "audit_logs",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const row = payload.new;
          if (
            row.entity === "guest_activity" ||
            row.entity === "rsvps" ||
            row.action === "GUEST_RSVP_SET" ||
            row.action === "ACTIVATION"
          )
            refresh();
        },
      )
      .subscribe();
    const visible = () => {
      if (!document.hidden) refresh();
    };
    if (Platform.OS === "web")
      document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      if (Platform.OS === "web")
        document.removeEventListener("visibilitychange", visible);
      void liveClient.removeChannel(channel);
    };
  }, [active, app.scope, client]);
  if (app.data?.role !== "ADMIN") return null;
  const rows = orderedActivities(query.data?.pages || []);
  const editable = app.data.guests.find((g) => g.id === editing);
  return (
    <View
      testID="admin-confirmations"
      style={{
        borderTopWidth: 1,
        borderColor: theme.colors.line,
        paddingTop: 20,
        gap: 16,
      }}
    >
      <Text accessibilityRole="header" style={styles.heading}>
        Confirmações
      </Text>
      {query.isLoading && active ? (
        <Text style={styles.small}>Carregando confirmações…</Text>
      ) : null}
      {query.isError ? (
        <>
          <Text style={styles.small}>
            Não foi possível carregar as confirmações agora.
          </Text>
          <Button
            secondary
            title="Carregar confirmações novamente"
            onPress={() => void query.refetch()}
          />
        </>
      ) : null}
      {!query.isLoading && !query.isError && !rows.length ? (
        <Text style={styles.small}>Nenhuma atividade disponível.</Text>
      ) : null}
      {rows.map((a) => {
        const technical = technicalDetails(a);
        const canEdit =
          a.editable &&
          a.guest_id &&
          app.data?.guests.some((g) => g.id === a.guest_id);
        return (
          <View
            key={a.id}
            {...(Platform.OS === "web"
              ? { dataSet: { guestActivity: a.id } }
              : {})}
            style={{
              borderBottomWidth: 1,
              borderColor: theme.colors.line,
              paddingBottom: 14,
              gap: 4,
            }}
          >
            <ActivityText
              activity={a}
              canEdit={!!canEdit}
              onEdit={() => setEditing(a.guest_id)}
            />
            {technical ? (
              <Text style={[styles.small, { flexShrink: 1 }]}>{technical}</Text>
            ) : null}
          </View>
        );
      })}
      {query.hasNextPage ? (
        <Button
          secondary
          title="Carregar mais registros"
          disabled={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
      {editing && editable ? (
        <GuestForm
          key={editing}
          guest={editable}
          onClose={() => setEditing(null)}
          onSaved={() => void query.refetch()}
        />
      ) : null}
    </View>
  );
}
