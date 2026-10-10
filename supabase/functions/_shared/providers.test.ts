import {
  type Delivery,
  DisabledProvider,
  ExpoPushProvider,
  provider,
  ResendProvider,
  WhatsAppProvider,
} from "./providers.ts";
import { GoogleSheetsAdapter } from "./googleSheets.ts";
import { workerAuthorized } from "./http.ts";
function assert(value: unknown, label: string) {
  if (!value) throw Error(label);
}
const delivery: Delivery = {
  id: "job",
  key: "stable-key",
  title: "Título demo",
  body: "Mensagem demo",
  email: "person@example.com",
  whatsapp: "+5500000000000",
  tokens: [],
};
Deno.test("disabled provider never claims success", async () => {
  const result = await new DisabledProvider("demo").send(delivery);
  assert(result.status === "skipped", "must not be sent");
});
Deno.test("missing configuration disables external providers", () => {
  for (
    const key of [
      "EMAIL_PROVIDER",
      "EMAIL_API_KEY",
      "EMAIL_FROM",
      "WHATSAPP_ACCESS_TOKEN",
    ]
  ) Deno.env.delete(key);
  assert(provider("EMAIL") instanceof DisabledProvider, "email disabled");
  assert(provider("WHATSAPP") instanceof DisabledProvider, "whatsapp disabled");
});
Deno.test("Resend passes stable idempotency key and accepted response", async () => {
  Deno.env.set("EMAIL_API_KEY", "fake-test-key");
  Deno.env.set("EMAIL_FROM", "sender@example.com");
  const previous = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    assert(
      (init?.headers as Record<string, string>)["Idempotency-Key"] ===
        "stable-key",
      "idempotency key",
    );
    return Response.json({ id: "provider-test-id" });
  };
  try {
    const result = await new ResendProvider().send(delivery);
    assert(
      result.status === "sent" && result.providerId === "provider-test-id",
      "provider accepted",
    );
  } finally {
    globalThis.fetch = previous;
    Deno.env.delete("EMAIL_API_KEY");
    Deno.env.delete("EMAIL_FROM");
  }
});
Deno.test("provider HTTP errors fail rather than simulate delivery", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 401 });
  try {
    let failed = false;
    try {
      await new ResendProvider().send(delivery);
    } catch {
      failed = true;
    }
    assert(failed, "must throw");
  } finally {
    globalThis.fetch = previous;
  }
});
Deno.test("WhatsApp uses configured template and no unconfigured deep links", async () => {
  Deno.env.set("WHATSAPP_API_VERSION", "v-test");
  Deno.env.set("WHATSAPP_TEMPLATE_NAME", "approved_test");
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert(String(input).includes("/v-test/"), "configured version");
    const payload = JSON.parse(String(init?.body));
    assert(
      payload.type === "template" && payload.template.name === "approved_test",
      "approved template",
    );
    return Response.json({ messages: [{ id: "meta-test-id" }] });
  };
  try {
    assert(
      (await new WhatsAppProvider().send(delivery)).providerId ===
        "meta-test-id",
      "accepted response",
    );
  } finally {
    globalThis.fetch = previous;
    Deno.env.delete("WHATSAPP_API_VERSION");
    Deno.env.delete("WHATSAPP_TEMPLATE_NAME");
  }
});
Deno.test("push without tokens skipped and provider ticket error fails", async () => {
  assert(
    (await new ExpoPushProvider().send(delivery)).status === "skipped",
    "no tokens",
  );
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: [{ status: "error" }] });
  try {
    let failed = false;
    try {
      await new ExpoPushProvider().send({
        ...delivery,
        tokens: ["ExpoPushToken[test]"],
      });
    } catch {
      failed = true;
    }
    assert(failed, "push errors");
  } finally {
    globalThis.fetch = previous;
  }
});
Deno.test("worker authentication fails closed without configured secret", () => {
  Deno.env.delete("WORKER_SECRET");
  assert(
    !workerAuthorized(
      new Request("https://example.com", {
        headers: { "x-worker-secret": "test" },
      }),
    ),
    "no default secret",
  );
  Deno.env.set("WORKER_SECRET", "test-only-secret");
  assert(
    !workerAuthorized(new Request("https://example.com")),
    "missing secret",
  );
  Deno.env.delete("WORKER_SECRET");
});
Deno.test("Sheets mapping mismatch never rewrites header", async () => {
  Deno.env.set("GOOGLE_SHEETS_ID", "test-only");
  Deno.env.set("GOOGLE_SHEETS_TAB_GUESTS", "Convidados");
  const adapter = new GoogleSheetsAdapter();
  adapter.access = async () => ({
    Authorization: "test",
    "Content-Type": "application/json",
  });
  adapter.read = async () => ({ values: [["Nome antigo"]] });
  let wrote = false;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    wrote = true;
    return Response.json({});
  };
  try {
    let failed = false;
    try {
      await adapter.upsert({
        id: "guest",
        name: "Demo",
        family: "Demo",
        group: "",
        rsvp: "CONFIRMED",
        checkin: "NOT_ENTERED",
        entered: "",
        dietary: "",
        contact: "",
        note: "",
      });
    } catch {
      failed = true;
    }
    assert(failed && !wrote, "must refuse unknown mapping");
  } finally {
    globalThis.fetch = previous;
    Deno.env.delete("GOOGLE_SHEETS_ID");
    Deno.env.delete("GOOGLE_SHEETS_TAB_GUESTS");
  }
});
Deno.test("Sheets update finds stable UUID and preserves unmapped cells", async () => {
  Deno.env.set("GOOGLE_SHEETS_ID", "test-only");
  Deno.env.set("GOOGLE_SHEETS_TAB_GUESTS", "Convidados");
  const adapter = new GoogleSheetsAdapter();
  adapter.access = async () => ({
    Authorization: "test",
    "Content-Type": "application/json",
  });
  adapter.read = async () => ({
    values: [[
      "Convidado ID",
      "Nome completo",
      "Família/Convite",
      "Grupo/vínculo",
      "RSVP",
      "Check-in",
      "Horário de entrada",
      "Restrição alimentar",
      "Contato",
      "Observações",
      "Coluna extra",
    ], ["guest", "Antigo", "", "", "PENDING", "", "", "", "", "", "preservar"]],
  });
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert(
      init?.method === "POST" && String(input).endsWith("values:batchUpdate"),
      "stable update",
    );
    assert(
      JSON.parse(String(init?.body)).data.length === 10 &&
        JSON.parse(String(init?.body)).data.every((cell: { range: string }) =>
          !cell.range.includes("!K")
        ) && JSON.parse(String(init?.body)).valueInputOption === "RAW",
      "extra field preserved",
    );
    return Response.json({});
  };
  try {
    await adapter.upsert({
      id: "guest",
      name: "Demo",
      family: "Demo",
      group: "",
      rsvp: "CONFIRMED",
      checkin: "PRESENT",
      entered: "",
      dietary: "",
      contact: "",
      note: "",
    });
  } finally {
    globalThis.fetch = previous;
    Deno.env.delete("GOOGLE_SHEETS_ID");
    Deno.env.delete("GOOGLE_SHEETS_TAB_GUESTS");
  }
});
Deno.test("Resend supports invitation HTML without breaking plain text messages", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert(
      body.text === delivery.body && body.html === "<p>Provisório</p>",
      "text plus HTML",
    );
    return Response.json({ id: "html-provider-id" });
  };
  try {
    await new ResendProvider().send({ ...delivery, html: "<p>Provisório</p>" });
  } finally {
    globalThis.fetch = previous;
  }
});

Deno.test("Resend distinguishes definitive rejection from uncertain transport without sensitive errors", async () => {
  const { ProviderDefinitiveError, ProviderUncertainError } = await import(
    "./http.ts"
  );
  const previous = globalThis.fetch;
  try {
    for (
      const [status, code, uncertain] of [
        [400, "rejected", false],
        [401, "auth", false],
        [403, "auth", false],
        [408, "timeout", true],
        [429, "rate", true],
        [500, "server", true],
        [503, "server", true],
        [409, "concurrent_idempotent_requests", true],
        [409, "invalid_idempotent_request", false],
      ] as const
    ) {
      globalThis.fetch = async () =>
        Response.json({
          name: code,
          message: "API key, person@example.com, password 0047",
        }, { status });
      let caught: unknown;
      try {
        await new ResendProvider().send(delivery);
      } catch (error) {
        caught = error;
      }
      assert(
        caught instanceof
          (uncertain ? ProviderUncertainError : ProviderDefinitiveError),
        `${status}/${code} classification`,
      );
      assert(
        !String(caught).includes("0047") && !String(caught).includes("person@"),
        "sanitized error",
      );
    }
    for (
      const failure of [
        new DOMException("sensitive", "TimeoutError"),
        new DOMException("sensitive", "AbortError"),
        new TypeError("sensitive network"),
      ]
    ) {
      globalThis.fetch = async () => {
        throw failure;
      };
      try {
        await new ResendProvider().send(delivery);
        throw Error("expected uncertain");
      } catch (error) {
        assert(error instanceof ProviderUncertainError, "network uncertainty");
      }
    }
    globalThis.fetch = async () => Response.json({});
    try {
      await new ResendProvider().send(delivery);
      throw Error("missing provider ID accepted");
    } catch (error) {
      assert(
        error instanceof ProviderUncertainError,
        "2xx without ID is not confirmed",
      );
    }
  } finally {
    globalThis.fetch = previous;
  }
});

Deno.test("payload hash covers exactly from/to/subject/text/html, not reservation key", async () => {
  const { resendPayloadHash } = await import("./providers.ts");
  const before = Deno.env.get("EMAIL_FROM");
  Deno.env.set("EMAIL_FROM", "sender@example.test");
  try {
    const original = { ...delivery, html: "<p>Invitation</p>" };
    const hash = await resendPayloadHash(original);
    assert(
      hash.length === 64 && hash === await resendPayloadHash(original),
      "deterministic SHA256",
    );
    for (
      const altered of [
        { ...original, email: "different@example.test" },
        { ...original, title: "changed" },
        { ...original, body: "changed" },
        { ...original, html: "changed" },
      ]
    ) {
      assert(
        hash !== await resendPayloadHash(altered),
        "every POST field guarded",
      );
    }
    assert(
      hash === await resendPayloadHash({ ...original, key: "other-operation" }),
      "key excluded from payload",
    );
    Deno.env.set("EMAIL_FROM", "other@example.test");
    assert(hash !== await resendPayloadHash(original), "sender guarded");
  } finally {
    if (before === undefined) Deno.env.delete("EMAIL_FROM");
    else Deno.env.set("EMAIL_FROM", before);
  }
});
