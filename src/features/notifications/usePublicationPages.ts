import { useState } from "react";
import { notificationFeed } from "../../repositories/api";
import type { NotificationPublication } from "../../types/domain";
export function usePublicationPages(
  first: NotificationPublication[],
  revision: number | string = 0,
) {
  const [cache, setCache] = useState<{
    revision: number | string;
    items: NotificationPublication[];
    end: boolean;
  }>({ revision, items: [], end: false });
  const [loading, setLoading] = useState(false);
  const older = cache.revision === revision ? cache.items : [];
  const items = [
    ...new Map([...older, ...first].map((p) => [p.id, p])).values(),
  ].sort(
    (a, b) =>
      b.published_at.localeCompare(a.published_at) || b.id.localeCompare(a.id),
  );
  return {
    items,
    loading,
    canLoadMore:
      first.length === 20 && !(cache.revision === revision && cache.end),
    markRead: (id: string) =>
      setCache((c) => ({
        ...c,
        items: c.items.map((p) =>
          p.id === id ? { ...p, viewer_read_at: new Date().toISOString() } : p,
        ),
      })),
    loadMore: async () => {
      if (loading || !items.length) return;
      setLoading(true);
      try {
        const last = items[items.length - 1]!,
          rows = await notificationFeed(last.published_at, last.id);
        setCache((c) => ({
          revision,
          items: [...(c.revision === revision ? c.items : []), ...rows],
          end: rows.length < 20,
        }));
      } finally {
        setLoading(false);
      }
    },
  };
}
