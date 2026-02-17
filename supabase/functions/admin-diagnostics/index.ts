import { createClient } from "jsr:@supabase/supabase-js@2";

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

    // Always log attempts, but only lock out further WRONG guesses.
    // If the password is actually correct, allow it even after many failures.
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

    const itemTtlMinutes = 15;
    const maxItemsPerSession = 10;

    const { count: totalItems } = await supabase
      .from("clipbeam_items")
      .select("id", { count: "exact", head: true });

    const { data: sizeRows } = await supabase
      .from("clipbeam_items")
      .select("file_size");

    const totalBytes =
      sizeRows?.reduce((sum, row) => sum + (typeof row.file_size === "number" ? row.file_size : 0), 0) ?? 0;

    const { data: cleanupEvents } = await supabase
      .from("clipbeam_cleanup_events")
      .select("id, created_at, deleted_items, deleted_bytes")
      .order("created_at", { ascending: false })
      .limit(20);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: failedLastHour } = await supabase
      .from("clipbeam_admin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("success", false)
      .gte("created_at", oneHourAgo);

    const payload = {
      ok: true,
      diagnostics: {
        itemTtlMinutes,
        maxItemsPerSession,
        totalItems: totalItems ?? 0,
        approxStorageBytes: totalBytes,
        cleanupEvents: cleanupEvents ?? [],
        failedAttemptsLastHour: failedLastHour ?? 0,
        now,
      },
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Admin diagnostics error", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
