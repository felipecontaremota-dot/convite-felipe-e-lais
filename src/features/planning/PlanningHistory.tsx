import { Text } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Card, Empty, styles } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { planningHistory } from "../../repositories/api";
import { demoPlanning } from "./demo";
import { timestamp } from "./domain";
import { financialHistory, historyFields, historyLabel } from "./history";
export function PlanningHistory({ identifier }: { identifier?: string }) {
  const app = useApp();
  const history = useInfiniteQuery({
    queryKey: ["planning-history", app.scope, identifier || "global"],
    initialPageParam: null as { before: string; id: string } | null,
    queryFn: ({ pageParam }) => {
      if (!app.isDemo) return planningHistory(identifier, pageParam);
      const data = demoPlanning(app.data!.event.id);
      const ids = new Set([
        identifier,
        ...data.installments
          .filter((i) => i.entry_id === identifier)
          .map((i) => i.id),
        ...data.payments
          .filter((i) => i.entry_id === identifier)
          .map((i) => i.id),
        ...data.documents
          .filter(
            (i) => i.entry_id === identifier || i.supplier_id === identifier,
          )
          .map((i) => i.id),
      ]);
      return data.history
        .filter(
          (h) =>
            (!identifier || ids.has(h.entity_id)) &&
            (!pageParam ||
              h.created_at < pageParam.before ||
              (h.created_at === pageParam.before && h.id < pageParam.id)),
        )
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            b.id.localeCompare(a.id),
        )
        .slice(0, 100);
    },
    getNextPageParam: (last) =>
      last.length === 100
        ? {
            before: last[last.length - 1]!.created_at,
            id: last[last.length - 1]!.id,
          }
        : undefined,
    enabled: app.online && app.data?.role === "ADMIN",
    refetchInterval: app.online ? 30000 : false,
    retry: false,
  });
  const records = [
    ...new Map(
      (history.data?.pages.flat() || []).map((h) => [h.id, h]),
    ).values(),
  ];
  return (
    <>
      {history.isPending ? (
        <Text style={styles.small}>Carregando histórico…</Text>
      ) : null}
      {history.isError ? (
        <>
          <Text role="alert" style={styles.error}>
            Não foi possível carregar o histórico.
          </Text>
          <Button
            title="Carregar histórico novamente"
            secondary
            onPress={() => history.refetch()}
          />
        </>
      ) : null}
      {records.map((h) => (
        <Card key={h.id}>
          <Text style={styles.text}>{historyLabel(h.action)}</Text>
          <Text style={styles.small}>
            {timestamp(h.created_at)} · {h.actor_name || "Administrador"}
          </Text>
          {Array.isArray(h.metadata.changed_fields) &&
          h.metadata.changed_fields.length ? (
            <Text style={styles.small}>
              Campos alterados:{" "}
              {h.metadata.changed_fields
                .map((f) => historyFields[String(f)] || "Dados do registro")
                .join(", ")}
            </Text>
          ) : null}
          {["before", "after"].map((k) =>
            h.metadata[k] && Object.keys(h.metadata[k] as object).length ? (
              <Text key={k} style={styles.small}>
                {k === "before" ? "Antes" : "Depois"}:{" "}
                {financialHistory(h.metadata[k])}
              </Text>
            ) : null,
          )}
        </Card>
      ))}
      {!history.isPending && !history.isError && !records.length ? (
        <Empty text="Ainda não há alterações registradas." />
      ) : null}
      {history.hasNextPage ? (
        <Button
          title="Carregar mais histórico"
          secondary
          disabled={history.isFetchingNextPage}
          onPress={() => history.fetchNextPage()}
        />
      ) : null}
    </>
  );
}
