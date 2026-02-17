import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_ITEMS = 10;
const ITEM_TTL_MINUTES = 15;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { password } = await req.json();

    if (typeof password !== "string" || password.length === 0) {
      return new Response(JSON.stringify({ error: "Password is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ipHeader =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    const ip = ipHeader.split(",")[0].trim();

    const now = new Date().toISOString();
    const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const expectedPassword = Deno.env.get("ADMIN_PANEL_PASSWORD");
    const isCorrect = !!expectedPassword && password === expectedPassword;

    if (!isCorrect) {
      const { count: recentFailures } = await supabase
        .from("clipbeam_admin_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .eq("success", false)
        .gte("created_at", windowStart);

      if ((recentFailures ?? 0) >= 5) {
        await supabase.from("clipbeam_admin_attempts").insert({ ip, success: false });
        return new Response(
          JSON.stringify({ error: "Locked", message: "Too many attempts. Try again later." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    await supabase.from("clipbeam_admin_attempts").insert({ ip, success: isCorrect });

    if (!isCorrect) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cutoffIso = new Date(Date.now() - ITEM_TTL_MINUTES * 60 * 1000).toISOString();

    let totalDeletedItems = 0;
    let totalDeletedBytes = 0;
    let sessionsTouched = 0;

    // 1) Global TTL cleanup
    const { data: expiredItems, error: expiredError } = await supabase
      .from("clipbeam_items")
      .select("id, file_path, file_size")
      .lt("created_at", cutoffIso);

    if (!expiredError && expiredItems && expiredItems.length > 0) {
      const expiredPaths = expiredItems
        .map((i) => i.file_path)
        .filter((p): p is string => typeof p === "string" && p.length > 0);

      if (expiredPaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("clipbeam-items")
          .remove(expiredPaths);

        if (storageError) {
          console.error("Force cleanup: failed to delete expired storage files", storageError);
        }
      }

      const expiredIds = expiredItems.map((i) => i.id);
      const expiredBytes = expiredItems.reduce(
        (sum, i) => sum + (typeof i.file_size === "number" ? i.file_size : 0),
        0,
      );

      await supabase
        .from("clipbeam_items")
        .delete()
        .in("id", expiredIds);

      await supabase.from("clipbeam_cleanup_events").insert({
        deleted_items: expiredIds.length,
        deleted_bytes: expiredBytes,
      });

      totalDeletedItems += expiredIds.length;
      totalDeletedBytes += expiredBytes;
    }

    // 2) Per-session cap cleanup
    const { data: allItems, error: allItemsError } = await supabase
      .from("clipbeam_items")
      .select("id, session_id, file_path, file_size, created_at")
      .order("created_at", { ascending: false });

    if (allItemsError) {
      console.error("Force cleanup: failed to load items for per-session cap", allItemsError);
    } else if (allItems && allItems.length > 0) {
      const itemsBySession = new Map<string, typeof allItems>();

      for (const item of allItems) {
        const sid = item.session_id as string;
        if (!itemsBySession.has(sid)) {
          itemsBySession.set(sid, [] as any);
        }
        (itemsBySession.get(sid) as any[]).push(item);
      }

      for (const [sessionId, sessionItems] of itemsBySession.entries()) {
        if (sessionItems.length <= MAX_ITEMS) continue;

        sessionsTouched += 1;

        const toDelete = sessionItems.slice(MAX_ITEMS);
        const pathsToDelete = toDelete
          .map((i) => i.file_path)
          .filter((p): p is string => typeof p === "string" && p.length > 0);

        if (pathsToDelete.length > 0) {
          const { error: storageError } = await supabase.storage
            .from("clipbeam-items")
            .remove(pathsToDelete);

          if (storageError) {
            console.error("Force cleanup: failed to delete storage files for session", sessionId, storageError);
          }
        }

        const idsToDelete = toDelete.map((i) => i.id);
        const bytesToDelete = toDelete.reduce(
          (sum, i) => sum + (typeof i.file_size === "number" ? i.file_size : 0),
          0,
        );

        await supabase
          .from("clipbeam_items")
          .delete()
          .in("id", idsToDelete);

        await supabase.from("clipbeam_cleanup_events").insert({
          deleted_items: idsToDelete.length,
          deleted_bytes: bytesToDelete,
        });

        totalDeletedItems += idsToDelete.length;
        totalDeletedBytes += bytesToDelete;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        stats: {
          totalDeletedItems,
          totalDeletedBytes,
          sessionsTouched,
          itemTtlMinutes: ITEM_TTL_MINUTES,
          maxItemsPerSession: MAX_ITEMS,
          ranAt: now,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Admin force cleanup error", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
