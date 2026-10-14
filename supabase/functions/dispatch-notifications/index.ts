import {
  cors,
  eventAdmin,
  json,
  service,
  ProviderDefinitiveError,
  workerAuthorized,
} from "../_shared/http.ts";
import { provider, type ProviderResult } from "../_shared/providers.ts";
export function dispatchHandler(
  deps = { service, workerAuthorized, eventAdmin, provider },
) {
  return async (request: Request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return json({ error: "unauthorized" }, 401);
    }
    const worker = deps.workerAuthorized(request);
    let event: string | undefined, messageId: string | undefined;
    if (!worker) {
      try {
        const body = await request.json();
        event = body.event_id;
        messageId = body.message_id;
        if (
          typeof messageId !== "string" ||
          !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(messageId)
        )
          return json({ error: "invalid message" }, 400);
        if (typeof event !== "string") {
          return json({ error: "invalid event" }, 400);
        }
        await deps.eventAdmin(request, event);
      } catch {
        return json({ error: "unauthorized" }, 403);
      }
    }
    const db = deps.service();
    if (!worker) {
      const { data: message, error: messageError } = await db
        .from("messages")
        .select("id")
        .eq("event_id", event!)
        .eq("id", messageId!)
        .maybeSingle();
      if (messageError) return json({ error: "message lookup failed" }, 503);
      if (!message) return json({ error: "invalid message" }, 400);
    }
    if (worker) {
      const schedule = await db.rpc("schedule_notifications");
      if (schedule.error) return json({ error: "schedule failed" }, 500);
    }
    const { data: jobs, error } = await db.rpc(
      worker ? "claim_notifications" : "claim_event_notifications",
      {
        p_limit: 50,
        ...(event ? { p_event: event, p_message: messageId } : {}),
      },
    );
    if (error) return json({ error: "claim failed" }, 500);
    const counts = { sent: 0, skipped: 0, failed: 0, uncertain: 0 };
    const results: { channel: string; status: string; reason?: string }[] = [];
    for (const job of jobs || []) {
      const lease = {
        p_event: job.event_id,
        p_job: job.id,
        p_guest: job.guest_id,
        p_channel: job.channel,
        p_attempt: job.attempts,
        p_lease: job.locked_at,
      };
      let started = false;
      let admissionToken: string | null = null;
      const authorize = async (start: boolean) => {
        const check = await db.rpc("authorize_notification_attempt", {
          ...lease,
          p_start: start,
        });
        if (check.error) throw Error("Falha ao validar autorização de entrega");
        return check.data as {
          authorized: boolean;
          reason?: string;
          admission?: string;
        };
      };
      const finish = async (
        status: string,
        provider: string,
        providerId?: string,
      ) => {
        const done = await db.rpc("finish_notification_attempt", {
          p_event: job.event_id,
          p_job: job.id,
          p_attempt: job.attempts,
          p_lease: job.locked_at,
          p_status: status,
          p_provider: provider,
          p_provider_id: providerId || null,
          p_admission: admissionToken,
        });
        if (done.error || done.data !== true)
          throw Error("Resultado de entrega não registrado");
      };
      try {
        const initial = await authorize(false);
        if (!initial.authorized) {
          const status = initial.reason === "consent" ? "skipped" : "pending";
          if (status === "skipped") counts.skipped++;
          results.push({
            channel: job.channel,
            status,
            reason: "Entrega não autorizada ou em processamento",
          });
          continue;
        }
        const { data: contact, error: contactError } = await db
          .from("guest_contacts")
          .select("*")
          .eq("event_id", job.event_id)
          .eq("guest_id", job.guest_id)
          .maybeSingle();
        const { data: rule, error: ruleError } = job.rule_id
          ? await db
              .from("notification_rules")
              .select("*")
              .eq("id", job.rule_id)
              .single()
          : { data: null, error: null };
        const { data: message, error: messageError } = job.message_id
          ? await db
              .from("messages")
              .select("*")
              .eq("id", job.message_id)
              .single()
          : { data: null, error: null };
        if (contactError || ruleError || messageError) {
          throw Error("Falha ao carregar dados de entrega");
        }
        if (!rule && !message) throw Error("Conteúdo não disponível");
        const title =
            rule?.title || message?.notification_title || "Felipe & Laís",
          body =
            rule?.body ||
            (message?.notification_title &&
            job.channel !== "WHATSAPP" &&
            message.content.startsWith(message.notification_title + "\n")
              ? message.content.slice(message.notification_title.length + 1)
              : message?.content);
        let result: ProviderResult;
        const { data: tokens, error: tokenError } =
          job.channel === "PUSH"
            ? await db
                .from("device_push_tokens")
                .select("token")
                .eq("event_id", job.event_id)
                .eq("guest_id", job.guest_id)
                .eq("active", true)
            : { data: [], error: null };
        if (tokenError) throw Error("Falha ao carregar dispositivos");
        // Final SQL admission is immediately before the delivery operation.
        const admission = await authorize(true);
        if (!admission.authorized) {
          if (admission.reason === "consent") counts.skipped++;
          results.push({
            channel: job.channel,
            status: admission.reason === "consent" ? "skipped" : "pending",
            reason: "Entrega não autorizada ou em processamento",
          });
          continue;
        }
        if (
          typeof admission.admission !== "string" ||
          !Number.isFinite(Date.parse(admission.admission))
        )
          throw Error("Admissão de entrega inválida");
        admissionToken = admission.admission;
        started = true;
        if (job.channel === "IN_APP") {
          if (rule) {
            const { data: guest, error: gerr } = await db
              .from("guests")
              .select("invitation_id")
              .eq("id", job.guest_id)
              .single();
            if (gerr) throw Error("Destinatário ausente");
            const { data: thread, error: terr } = await db
              .from("message_threads")
              .upsert(
                {
                  event_id: job.event_id,
                  invitation_id: guest.invitation_id,
                },
                { onConflict: "event_id,invitation_id" },
              )
              .select("id")
              .single();
            if (terr) throw Error("Falha ao criar conversa");
            // A job UUID is the message ID: repeated attempts cannot create duplicate inbox entries.
            const { error: merr } = await db.from("messages").upsert(
              {
                id: job.id,
                event_id: job.event_id,
                thread_id: thread.id,
                invitation_id: guest.invitation_id,
                recipient_guest_id: job.guest_id,
                from_admin: true,
                content: `${title}\n${body}`,
              },
              { onConflict: "id" },
            );
            if (merr) throw Error("Falha ao criar aviso");
            const { error: recipientError } = await db
              .from("message_recipients")
              .upsert(
                {
                  event_id: job.event_id,
                  message_id: job.id,
                  guest_id: job.guest_id,
                },
                { onConflict: "message_id,guest_id" },
              );
            if (recipientError)
              throw Error("Falha ao registrar destinatário do aviso");
            const { error: aerr } = await db.from("announcements").upsert(
              {
                event_id: job.event_id,
                title,
                content: body,
                rule_id: rule.id,
              },
              { onConflict: "rule_id" },
            );
            if (aerr) throw Error("Falha ao criar destaque");
          }
          result = { status: "sent", provider: "in_app" };
        } else {
          result = await deps.provider(job.channel).send({
            id: job.id,
            key: job.idempotency_key,
            title,
            body,
            email: contact?.email || "",
            whatsapp: contact?.whatsapp || "",
            tokens: (tokens || []).map((t) => t.token),
          });
        }
        await finish(result.status, result.provider, result.providerId);
        counts[result.status]++;
        results.push({
          channel: job.channel,
          status: result.status,
          ...(result.reason ? { reason: result.reason } : {}),
        });
      } catch (error) {
        const uncertain =
          started &&
          job.channel !== "IN_APP" &&
          !(error instanceof ProviderDefinitiveError);
        const status = uncertain ? "uncertain" : "failed";
        // A failed result write leaves the admission marker, preventing automatic resend.
        try {
          await finish(status, job.channel);
        } catch {
          /* lease/result remains protected */
        }
        counts[status]++;
        results.push({
          channel: job.channel,
          status,
          reason: uncertain
            ? "Resultado externo não confirmado; não reenviar automaticamente"
            : "Falha de entrega",
        });
      }
    }
    if (event && messageId) {
      const current = await db
        .from("notification_jobs")
        .select("channel,status,last_error")
        .eq("event_id", event)
        .eq("message_id", messageId);
      if (current.error) return json({ error: "status lookup failed" }, 503);
      return json({
        ...counts,
        results: (current.data || []).map((j) => ({
          channel: j.channel,
          status: j.status,
          reason: j.last_error || undefined,
        })),
      });
    }
    return json({ ...counts, results });
  };
}
if (import.meta.main) Deno.serve(dispatchHandler());
