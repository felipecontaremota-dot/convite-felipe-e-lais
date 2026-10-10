import { expect, it, vi } from "vitest";
import {
  dispatchCommittedMessage,
  effectiveRecipients,
  recipientError,
} from "../src/features/messages/recipients";
import { MutationQueue } from "../src/storage/queue";
it.each([{}, { duplicate: true }, { id: null }, { id: "not-a-uuid" }])(
  "never dispatches historical/invalid receipt %j",
  async (result) => {
    const dispatch = vi.fn();
    await dispatchCommittedMessage(result, ["EMAIL"], dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  },
);
it("retry dispatches only the persisted committed ID", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const dispatch = vi.fn().mockResolvedValue("sent");
  expect(
    await dispatchCommittedMessage(
      { id, duplicate: true } as { id: string },
      ["EMAIL"],
      dispatch,
    ),
  ).toBe("sent");
  expect(dispatch).toHaveBeenCalledExactlyOnceWith(["EMAIL"], id);
});
it.each(["ALL", "FAMILY", "GUEST"])(
  "%s uses one deduplicated active list for count, validation and queued payload",
  async (target) => {
    for (const count of [0, 1, 500, 501]) {
      const people = Array.from({ length: count }, (_, i) => ({
        id: `person-${i}`,
        invitation_id: "family",
      }));
      const ids = effectiveRecipients(
        [...people, ...people],
        target,
        "family",
        [...people.map((g) => g.id), "removed"],
      );
      expect(ids).toHaveLength(count);
      const error = recipientError(target, ids.length);
      expect(!!error).toBe(count === 0 || count > 500);
      const values = new Map<string, string>();
      const queue = new MutationQueue(
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
      if (!error)
        await queue.enqueue({
          mutationId: "fixed",
          type: "MESSAGE_SEND_TO_GUESTS",
          payload: { recipient_guest_ids: ids },
          attempts: 0,
          lastError: null,
          createdAt: "now",
        });
      expect(await queue.list()).toHaveLength(error ? 0 : 1);
      if (!error)
        expect((await queue.list())[0].payload.recipient_guest_ids).toEqual(
          ids,
        );
    }
  },
);
it("zero recipients have target-specific errors, excessive count has no silent batching", () => {
  expect(recipientError("ALL", 0)).toBe(
    "Não há convidados ativos para receber esta mensagem.",
  );
  expect(recipientError("FAMILY", 0)).toBe(
    "Esta família não possui convidados ativos.",
  );
  expect(recipientError("GUEST", 0)).toBe("Selecione pelo menos uma pessoa.");
  expect(recipientError("ALL", 501)).toBe(
    "Esta mensagem possui mais de 500 destinatários. Reduza a seleção antes de enviar.",
  );
  expect(
    effectiveRecipients(
      [{ id: "a", invitation_id: "other" }],
      "FAMILY",
      "",
      [],
    ),
  ).toEqual([]);
});
