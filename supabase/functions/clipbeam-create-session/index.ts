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
    const { pin } = await req.json();
    if (!pin || typeof pin !== "string" || pin.length < 4) {
      return new Response(JSON.stringify({ error: "Invalid PIN" }), {
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
      return new Response(JSON.stringify({ error: "New links are temporarily disabled by the admin." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const code = Array.from({ length: 3 })
      .map(() => Math.random().toString(36).substring(2, 6))
      .join("-");

    const pinHash = await hashPin(pin);
    const createdIp = getClientIp(req);

    const { data, error } = await supabase
      .from("clipbeam_sessions")
      .insert({
        code,
        pin_hash: pinHash,
        created_ip: createdIp,
      })
      .select("id, code")
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ sessionId: data.id, sessionCode: data.code }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Create session error:", err);
    return new Response(JSON.stringify({ error: "Failed to create session" }), {
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
