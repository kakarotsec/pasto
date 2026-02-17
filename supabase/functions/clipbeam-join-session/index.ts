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
    const { sessionCode, pin } = await req.json();
    if (!sessionCode || !pin) {
      return new Response(JSON.stringify({ error: "Session code and PIN required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await supabase
      .from("clipbeam_admin_settings")
      .select("lockdown_enabled")
      .limit(1)
      .maybeSingle();

    if (settings?.lockdown_enabled) {
      return new Response(JSON.stringify({ error: "Joining links is temporarily disabled by the admin." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientIp = getClientIp(req);
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();

    const { data: attempts } = await supabase
      .from("clipbeam_join_attempts")
      .select("success")
      .eq("ip", clientIp)
      .gte("created_at", oneMinuteAgo);

    const recentFailures = attempts?.filter((a) => !a.success).length ?? 0;
    if (recentFailures >= 5) {
      return new Response(JSON.stringify({ error: "Too many attempts, please try again later" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: session } = await supabase
      .from("clipbeam_sessions")
      .select("id, pin_hash, ended_at")
      .eq("code", sessionCode)
      .is("ended_at", null)
      .maybeSingle();

    if (!session) {
      await supabase.from("clipbeam_join_attempts").insert({
        session_code: sessionCode,
        ip: clientIp,
        success: false,
      });
      return new Response(JSON.stringify({ error: "Invalid session or PIN" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pinHash = await hashPin(pin);
    if (pinHash !== session.pin_hash) {
      await supabase.from("clipbeam_join_attempts").insert({
        session_code: sessionCode,
        ip: clientIp,
        success: false,
      });
      return new Response(JSON.stringify({ error: "Invalid session or PIN" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("clipbeam_sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", session.id);

    await supabase.from("clipbeam_join_attempts").insert({
      session_code: sessionCode,
      ip: clientIp,
      success: true,
    });

    return new Response(JSON.stringify({ sessionId: session.id, sessionCode }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Join session error:", err);
    return new Response(JSON.stringify({ error: "Failed to join session" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.headers.get("x-real-ip");
}
