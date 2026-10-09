import { cors, json, service, workerAuthorized } from "../_shared/http.ts";
import { GoogleSheetsAdapter } from "../_shared/googleSheets.ts";
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (request.method !== "POST" || !workerAuthorized(request)) {
    return json({ error: "unauthorized" }, 401);
  }
  if (
    ![
      "GOOGLE_SHEETS_ID",
      "GOOGLE_SHEETS_TAB_GUESTS",
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    ].every((k) => Deno.env.get(k))
  ) {
    return json({
      status: "disabled",
      reason: "Google provider not configured",
    });
  }
  const db = service(), sheet = new GoogleSheetsAdapter();
  const { data: jobs, error } = await db.rpc("claim_sheet_jobs", {
    p_limit: 25,
  });
  if (error) return json({ error: "claim failed" }, 500);
  let success = 0, failed = 0;
  for (const job of jobs || []) {
    try {
      const { data: g, error: gerr } = await db.from("guests").select("*").eq(
        "id",
        job.entity_id,
      ).eq("event_id", job.event_id).single();
      if (gerr) throw Error("Guest removed; sheet requires manual review");
      const [{ data: i }, { data: r }, { data: c }, { data: entry }] =
        await Promise.all([
          db.from("invitations").select("name").eq("id", g.invitation_id)
            .single(),
          db.from("rsvps").select("*").eq("guest_id", g.id).maybeSingle(),
          db.from("guest_contacts").select("email,whatsapp").eq(
            "guest_id",
            g.id,
          ).maybeSingle(),
          db.from("checkins").select("created_at").eq("guest_id", g.id)
            .maybeSingle(),
        ]);
      await sheet.upsert({
        id: g.id,
        name: g.name,
        family: i?.name || "",
        group: g.group_label,
        rsvp: r?.status || "PENDING",
        checkin: entry ? "PRESENT" : "NOT_ENTERED",
        entered: entry?.created_at || "",
        dietary: r?.dietary || "",
        contact: c?.email || c?.whatsapp || "",
        note: r?.note || "",
      });
      const done = await db.rpc("finish_sheet_job", {
        p_id: job.id,
        p_version: job.version,
        p_error: null,
      });
      if (done.error) throw Error("Failed to persist result");
      success++;
    } catch {
      await db.rpc("finish_sheet_job", {
        p_id: job.id,
        p_version: job.version,
        p_error:
          "Falha no provider, mapeamento ou entidade; revisar configuração e tentar novamente",
      });
      failed++;
    }
  }
  return json({ success, failed });
});
