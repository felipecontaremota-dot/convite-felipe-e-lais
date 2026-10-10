import { it, expect } from "vitest";
import { MutationQueue } from "../src/storage/queue";
import { AppError } from "../src/lib/errors";
import { mutationAction } from "../src/storage/syncLabels";
import type { OfflineMutation } from "../src/types/domain";
function queue() {
  const values = new Map<string, string>();
  return new MutationQueue(
    {
      getItem: async (k) => values.get(k) || null,
      setItem: async (k, v) => {
        values.set(k, v);
      },
      removeItem: async (k) => {
        values.delete(k);
      },
    },
    "queue",
  );
}
const mutation = (id: string): OfflineMutation => ({
  mutationId: id,
  type: "MESSAGE_SEND_TO_GUESTS",
  payload: { content: "Sensitive content" },
  attempts: 0,
  lastError: null,
  createdAt: "now",
});
it("empty queue reports no failure", async () => {
  expect(await queue().flushDetailed(async () => {})).toMatchObject({
    initial: 0,
    synced: 0,
    remaining: 0,
    firstFailure: null,
  });
});
it("failure reports attempts, preserves order and retries the original ID", async () => {
  const q = queue();
  await q.enqueue(mutation("a"));
  await q.enqueue(mutation("b"));
  const result = await q.flushDetailed(async () => {
    throw new AppError(
      "Selecione pessoas disponíveis neste evento e tente novamente.",
    );
  });
  expect(result).toMatchObject({
    initial: 2,
    synced: 0,
    remaining: 2,
    firstFailure: { mutationId: "a", attempts: 1 },
  });
  expect(mutationAction(result.firstFailure!.type)).toBe(
    "Falha ao enviar mensagem.",
  );
  const sent: string[] = [];
  expect(
    await q.flushDetailed(async (i) => {
      sent.push(i.mutationId);
    }),
  ).toMatchObject({ initial: 2, synced: 2, remaining: 0 });
  expect(sent).toEqual(["a", "b"]);
  expect(await q.list()).toEqual([]);
});
it("only explicit discard of a failed item unblocks following changes", async () => {
  const q = queue();
  await q.enqueue(mutation("a"));
  await q.enqueue(mutation("b"));
  await expect(q.discardFailed("a")).rejects.toThrow();
  await q.flushDetailed(async () => {
    throw Error("provider contained sensitive content");
  });
  expect((await q.list())[0].lastError).not.toContain("sensitive");
  await q.discardFailed("a");
  expect(await q.list()).toMatchObject([{ mutationId: "b", attempts: 0 }]);
  expect(await q.flushDetailed(async () => {})).toMatchObject({
    synced: 1,
    remaining: 0,
  });
});
