import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { cors, eventAdmin, json, service } from "../_shared/http.ts";
const MAX = 10485760;
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function fileMime(
  bytes: Uint8Array,
  name: string,
  declared = "",
): string {
  const ext = name.split(".").pop()?.toLowerCase();
  let mime = "";
  if (
    ext === "pdf" &&
    bytes.length > 12 &&
    new TextDecoder()
      .decode(bytes.slice(0, 8))
      .match(/^%PDF-(?:1\.[0-7]|2\.0)/) &&
    new TextDecoder().decode(bytes.slice(-1024)).includes("%%EOF")
  )
    mime = "application/pdf";
  if (
    ext === "png" &&
    bytes.length >= 45 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
    new TextDecoder().decode(bytes.slice(12, 16)) === "IHDR" &&
    new TextDecoder().decode(bytes.slice(-8, -4)) === "IEND"
  )
    mime = "image/png";
  if (
    ["jpg", "jpeg"].includes(ext || "") &&
    bytes.length > 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  )
    mime = "image/jpeg";
  if (!mime || (declared && declared !== mime)) throw Error("invalid_file");
  return mime;
}
const digest = async (bytes: Uint8Array) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const defaults = {
  authorize: eventAdmin,
  prepare: async (
    req: Request,
    event: string,
    id: string,
    values: Record<string, unknown>,
    request: string,
  ) => {
    const user = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );
    const result = await user.rpc("planning_action", {
      p_event: event,
      p_kind: "DOCUMENT_PREPARE",
      p_id: id,
      p_version: null,
      p_values: values,
      p_request: request,
    });
    if (result.error) throw Error("prepare_failed");
    return result.data as { path: string };
  },
  upload: async (
    path: string,
    bytes: Uint8Array,
    mime: string,
    hash: string,
  ) => {
    const bucket = service().storage.from("wedding-planning");
    const { error } = await bucket.upload(path, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "0",
    });
    if (error) {
      if (
        !["409", "Duplicate"].includes(
          String((error as { statusCode?: string }).statusCode),
        ) &&
        !error.message.toLowerCase().includes("already exists")
      )
        throw Error("upload_failed");
      const existing = await bucket.download(path);
      if (
        existing.error ||
        !existing.data ||
        existing.data.size > MAX ||
        (await digest(new Uint8Array(await existing.data.arrayBuffer()))) !==
          hash
      )
        throw Error("upload_conflict");
    }
  },
  finish: async (event: string, id: string, hash: string) => {
    const { error } = await service().rpc("planning_document_finish", {
      p_event: event,
      p_id: id,
      p_sha256: hash,
    });
    if (error) throw Error("finish_failed");
  },
};
export function planningDocumentHandler(deps = defaults) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "method" }, 405);
    if (!req.headers.get("Authorization"))
      return json({ error: "unauthorized" }, 403);
    try {
      // Bounded body even with chunked transfer or a forged Content-Length.
      const reader = req.body?.getReader();
      if (!reader) return json({ error: "invalid_file" }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > MAX + 65536) {
          await reader.cancel();
          return json({ error: "file_too_large" }, 413);
        }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const form = await new Response(bytes, {
        headers: { "Content-Type": req.headers.get("Content-Type") || "" },
      }).formData();
      const event = String(form.get("event_id") || ""),
        id = String(form.get("id") || ""),
        request = String(form.get("request_id") || "");
      if (!uuid.test(event) || !uuid.test(id) || !uuid.test(request))
        return json({ error: "invalid_request" }, 400);
      try {
        await deps.authorize(req, event);
      } catch {
        return json({ error: "unauthorized" }, 403);
      }
      const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > MAX)
        return json({ error: "invalid_file" }, 400);
      const content = new Uint8Array(await file.arrayBuffer()),
        mime = fileMime(content, file.name, file.type),
        hash = await digest(content);
      const name = file.name
        .normalize("NFC")
        .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
        .slice(0, 200);
      const values: Record<string, unknown> = {
        name,
        mime,
        size_bytes: file.size,
        sha256: hash,
      };
      const targets = ["supplier_id", "entry_id", "payment_id"].filter((k) =>
        form.has(k),
      );
      if (targets.length !== 1 || !uuid.test(String(form.get(targets[0]))))
        return json({ error: "invalid_request" }, 400);
      values[targets[0]] = String(form.get(targets[0]));
      const reservation = await deps.prepare(req, event, id, values, request);
      if (reservation.path !== `${event}/${id}`) throw Error("invalid_path");
      await deps.upload(reservation.path, content, mime, hash);
      await deps.finish(event, id, hash);
      return json({ id });
    } catch {
      return json(
        {
          error:
            "Não foi possível validar ou salvar o documento. Use PDF, JPG ou PNG até 10 MB e tente novamente.",
        },
        400,
      );
    }
  };
}
