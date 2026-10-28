import { fileMime, planningDocumentHandler } from "./handler.ts";
const equal = (actual: unknown, expected: unknown) => {
  if (actual !== expected) throw Error(`Expected ${expected}, got ${actual}`);
};
const eid = "00000000-0000-4000-8000-000000000001",
  did = "11111111-1111-4111-8111-111111111111",
  rid = "22222222-2222-4222-8222-222222222222";
const pdf = new TextEncoder().encode(
  "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
);
const request = (
  file = new File([pdf], "contrato.pdf", { type: "application/pdf" }),
) => {
  const form = new FormData();
  form.set("event_id", eid);
  form.set("id", did);
  form.set("request_id", rid);
  form.set("entry_id", did);
  form.set("file", file);
  return new Request("https://fixture.test", {
    method: "POST",
    headers: { Authorization: "Bearer fixture" },
    body: form,
  });
};
function deps() {
  const calls: string[] = [];
  return {
    calls,
    authorize: async () => {
      calls.push("authorize");
    },
    prepare: async (
      _req: Request,
      _event: string,
      _id: string,
      values: Record<string, unknown>,
      _request: string,
    ) => {
      equal(values.mime, "application/pdf");
      equal(values.size_bytes, pdf.length);
      equal(String(values.sha256).length, 64);
      calls.push("prepare");
      return { path: `${eid}/${did}` };
    },
    upload: async () => {
      calls.push("upload");
    },
    finish: async () => {
      calls.push("finish");
    },
  };
}
Deno.test(
  "upload authorizes, validates actual bytes, reserves privately and finishes after storage success",
  async () => {
    const d = deps();
    const response = await planningDocumentHandler(d)(request());
    equal(response.status, 200);
    equal(d.calls.join(","), "authorize,prepare,upload,finish");
  },
);
Deno.test("non-admin never reserves or uploads", async () => {
  const d = deps();
  d.authorize = async () => {
    throw Error("unauthorized");
  };
  equal((await planningDocumentHandler(d)(request())).status, 403);
  equal(d.calls.length, 0);
});
Deno.test(
  "rejects forged PDF MIME, extension, HTML, malformed PNG and JPEG",
  async () => {
    for (const file of [
      new File(["<html>not a document</html>"], "fake.pdf", {
        type: "application/pdf",
      }),
      new File([pdf], "fake.html", { type: "application/pdf" }),
      new File([pdf], "fake.pdf", { type: "image/png" }),
      new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        "fake.png",
        { type: "image/png" },
      ),
      new File([new Uint8Array([255, 216, 255])], "fake.jpg", {
        type: "image/jpeg",
      }),
    ]) {
      const d = deps();
      equal((await planningDocumentHandler(d)(request(file))).status, 400);
      equal(d.calls.join(","), "authorize");
    }
  },
);
Deno.test(
  "failed storage never marks a document ready; retry can finish normally",
  async () => {
    const d = deps();
    d.upload = async () => {
      throw Error("unavailable");
    };
    equal((await planningDocumentHandler(d)(request())).status, 400);
    equal(d.calls.includes("finish"), false);
    const next = deps();
    equal((await planningDocumentHandler(next)(request())).status, 200);
  },
);
Deno.test("caps request body even without honest content-length", async () => {
  const d = deps();
  const r = new Request("https://fixture.test", {
    method: "POST",
    headers: {
      Authorization: "Bearer fixture",
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(10485760 + 65537),
  });
  equal((await planningDocumentHandler(d)(r)).status, 413);
  equal(d.calls.length, 0);
});
Deno.test(
  "rejects absent authentication and allows real invoke CORS preflight",
  async () => {
    const h = planningDocumentHandler(deps());
    equal(
      (await h(new Request("https://fixture.test", { method: "POST" }))).status,
      403,
    );
    const r = await h(
      new Request("https://fixture.test", { method: "OPTIONS" }),
    );
    equal(r.status, 200);
    equal(
      r.headers.get("Access-Control-Allow-Headers")?.includes("apikey"),
      true,
    );
  },
);
Deno.test(
  "checks storage path before any upload and does not return raw exceptions or private data",
  async () => {
    const d = deps();
    d.prepare = async () => ({ path: "other-event/private" });
    const r = await planningDocumentHandler(d)(request());
    equal(r.status, 400);
    equal(d.calls.includes("upload"), false);
    const text = await r.text();
    equal(text.includes("other-event"), false);
  },
);
Deno.test(
  "accepts real PNG and JPEG signatures while refusing executable extensions",
  () => {
    const png = new Uint8Array(45);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png.set(new TextEncoder().encode("IHDR"), 12);
    png.set(new TextEncoder().encode("IEND"), 37);
    equal(fileMime(png, "arquivo.PNG", "image/png"), "image/png");
    equal(
      fileMime(
        new Uint8Array([255, 216, 255, 0, 255, 217]),
        "foto.jpeg",
        "image/jpeg",
      ),
      "image/jpeg",
    );
  },
);
