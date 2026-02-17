// supabase/functions/clipbeam-expire-sessions/index.ts
// Scheduled cleanup job (every 5 min): deletes expired/ended sessions, their items, and storage files.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cleanup-secret",
};

const DEFAULT_TTL_MINUTES = 15;
const BATCH_SIZE = 200;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function removeFiles(
  // Avoid tight generic coupling across edge-runtime type versions
  supabase: any,
  filePaths: string[],
) {
  if (!filePaths.length) return;

  // Storage delete supports arrays; chunk to be safe.
  const chunkSize = 100;
  for (let i = 0; i < filePaths.length; i += chunkSize) {
    const chunk = filePaths.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from("clipbeam-items").remove(chunk);
    if (error) {
      // Not fatal: files might already be gone.
      console.warn("storage.remove error", { error, chunkSize: chunk.length });
    }
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // This endpoint is meant for scheduled invocations.
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const expectedSecret = Deno.env.get("CLEANUP_CRON_SECRET");
    if (!expectedSecret) {
      console.error("Missing CLEANUP_CRON_SECRET env var");
      return json({ error: "Server misconfigured" }, 500);
    }

    const providedSecret = req.headers.get("x-cleanup-secret") || "";
    if (providedSecret !== expectedSecret) {
      console.warn("Unauthorized cleanup attempt", { ip: getClientIp(req) });
      return json({ error: "Unauthorized" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRoleKey) {
      console.error("Missing backend env vars", {
        hasUrl: Boolean(url),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
      return json({ error: "Server misconfigured" }, 500);
    }

    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Use a fixed 15-minute TTL for aggressive cleanup
    const ttlMinutes = DEFAULT_TTL_MINUTES;

    const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);
    const cutoffIso = cutoff.toISOString();

    // Expire sessions that are explicitly ended OR inactive past cutoff
    const { data: sessions, error: sessionsErr } = await supabase
      .from("clipbeam_sessions")
      .select("id, code, ended_at, last_activity_at")
      .or(`ended_at.not.is.null,last_activity_at.lt.${cutoffIso}`)
      .limit(BATCH_SIZE);

    if (sessionsErr) {
      console.error("Failed to fetch expired sessions", sessionsErr);
      return json({ error: "Failed to fetch expired sessions" }, 500);
    }

    let deletedSessions = 0;
    let deletedItems = 0;
    let deletedBytes = 0;

    for (const session of sessions ?? []) {
      try {
        const { data: items, error: itemsErr } = await supabase
          .from("clipbeam_items")
          .select("id, file_path, file_size")
          .eq("session_id", session.id);

        if (itemsErr) {
          console.warn("Failed to fetch items for session", {
            sessionId: session.id,
            error: itemsErr,
          });
          continue;
        }

        const filePaths = (items ?? [])
          .map((i) => i.file_path)
          .filter((p): p is string => Boolean(p));

        await removeFiles(supabase, filePaths);

        // Delete items rows
        const { error: delItemsErr } = await supabase
          .from("clipbeam_items")
          .delete()
          .eq("session_id", session.id);

        if (delItemsErr) {
          console.warn("Failed to delete items for session", {
            sessionId: session.id,
            error: delItemsErr,
          });
          continue;
        }

        // Delete session row
        const { error: delSessionErr } = await supabase
          .from("clipbeam_sessions")
          .delete()
          .eq("id", session.id);

        if (delSessionErr) {
          console.warn("Failed to delete session", {
            sessionId: session.id,
            error: delSessionErr,
          });
          continue;
        }

        deletedSessions += 1;
        deletedItems += items?.length ?? 0;
        deletedBytes += (items ?? []).reduce(
          (sum, i) => sum + Number(i.file_size ?? 0),
          0,
        );
      } catch (err) {
        console.warn("Cleanup failed for session", { sessionId: session.id, err });
      }
    }

    // Log aggregate cleanup stats (same table used by manual cleanup)
    try {
      if (deletedSessions > 0 || deletedItems > 0 || deletedBytes > 0) {
        const { error: logErr } = await supabase
          .from("clipbeam_cleanup_events")
          .insert({
            deleted_items: deletedItems,
            deleted_bytes: deletedBytes,
          });
        if (logErr) console.warn("Failed to log cleanup event", logErr);
      }
    } catch (err) {
      console.warn("Unexpected logging error", err);
    }

    return json({
      ok: true,
      ttlMinutes,
      cutoff: cutoffIso,
      scannedSessions: sessions?.length ?? 0,
      deletedSessions,
      deletedItems,
      deletedBytes,
      batchSize: BATCH_SIZE,
    });
  } catch (err) {
    console.error("clipbeam-expire-sessions fatal", err);
    return json({ error: "Internal error" }, 500);
  }
});
