import { cors, json, service, workerAuthorized } from "../_shared/http.ts";
import { provider, type ProviderResult } from "../_shared/providers.ts";
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (request.method !== "POST" || !workerAuthorized(request)) {
    return json({ error: "unauthorized" }, 401);
  }
  const db = service();
  const schedule = await db.rpc("schedule_notifications");
  if (schedule.error) return json({ error: "schedule failed" }, 500);
  const { data: jobs, error } = await db.rpc("claim_notifications", {
    p_limit: 50,
  });
  if (error) return json({ error: "claim failed" }, 500);
  const counts = { sent: 0, skipped: 0, failed: 0 };
  for (const job of jobs || []) {
    try {
      const { data: contact } = await db.from("guest_contacts").select("*").eq(
        "event_id",
        job.event_id,
      ).eq("guest_id", job.guest_id).maybeSingle();
      const { data: rule } = job.rule_id
        ? await db.from("notification_rules").select("*").eq("id", job.rule_id)
          .single()
        : { data: null };
      const { data: message } = job.message_id
        ? await db.from("messages").select("*").eq("id", job.message_id)
          .single()
        : { data: null };
      if (!rule && !message) throw Error("Conteúdo não disponível");
      const title = rule?.title || "Felipe & Laís",
        body = rule?.body || message?.content;
      let result: ProviderResult;
      const consent = job.channel === "IN_APP"
        ? (contact?.consent_in_app ?? true)
        : contact?.[`consent_${job.channel.toLowerCase()}`] === true;
      if (!consent || rule && !rule.active) {
        result = {
          status: "skipped",
          provider: job.channel,
          reason: "Consentimento ausente/revogado ou regra desativada",
        };
      } else if (job.channel === "IN_APP") {
        if (rule) {
          const { data: guest, error: gerr } = await db.from("guests").select(
            "invitation_id",
          ).eq("id", job.guest_id).single();
          if (gerr) throw Error("Destinatário ausente");
          const { data: thread, error: terr } = await db.from("message_threads")
            .upsert({
              event_id: job.event_id,
              invitation_id: guest.invitation_id,
            }, { onConflict: "event_id,invitation_id" }).select("id").single();
          if (terr) throw Error("Falha ao criar conversa");
          // A job UUID is the message ID: repeated attempts cannot create duplicate inbox entries.
          const { error: merr } = await db.from("messages").upsert({
            id: job.id,
            event_id: job.event_id,
            thread_id: thread.id,
            invitation_id: guest.invitation_id,
            recipient_guest_id: job.guest_id,
            from_admin: true,
            content: `${title}\n${body}`,
          }, { onConflict: "id" });
          if (merr) throw Error("Falha ao criar aviso");
          const { error: aerr } = await db.from("announcements").upsert({
            event_id: job.event_id,
            title,
            content: body,
            rule_id: rule.id,
          }, { onConflict: "rule_id" });
          if (aerr) throw Error("Falha ao criar destaque");
        }
        result = { status: "sent", provider: "in_app" };
      } else {
        const { data: tokens } = await db.from("device_push_tokens").select(
          "token",
        ).eq("event_id", job.event_id).eq("guest_id", job.guest_id).eq(
          "active",
          true,
        );
        result = await provider(job.channel).send({
          id: job.id,
          key: job.idempotency_key,
          title,
          body,
          email: contact?.email || "",
          whatsapp: contact?.whatsapp || "",
          tokens: (tokens || []).map((t) => t.token),
        });
      }
      const update = await db.from("notification_jobs").update({
        status: result.status,
        last_error: result.reason || null,
        locked_at: null,
      }).eq("id", job.id).eq("status", "processing");
      if (update.error) throw Error("Falha ao registrar resultado");
      await db.from("delivery_attempts").insert({
        event_id: job.event_id,
        job_id: job.id,
        status: result.status,
        provider: result.provider,
        error: result.reason || null,
        provider_id: result.providerId || null,
      });
      counts[result.status]++;
    } catch {
      const ambiguous = job.channel === "WHATSAPP" || job.channel === "PUSH";
      await db.from("notification_jobs").update({
        status: "failed",
        last_error: ambiguous
          ? "Falha ou resultado externo incerto; revisar antes de reenviar"
          : "Falha de entrega; tentativa registrada",
        locked_at: null,
        next_attempt_at: new Date(Date.now() + 300000).toISOString(),
        ...(ambiguous ? { attempts: 6 } : {}),
      }).eq("id", job.id);
      await db.from("delivery_attempts").insert({
        event_id: job.event_id,
        job_id: job.id,
        status: "failed",
        provider: job.channel,
        error:
          "Falha de entrega; consulte configuração do provider sem registrar dados pessoais",
      });
      counts.failed++;
    }
  }
  return json(counts);
});
