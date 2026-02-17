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
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session } = await supabase
      .from("clipbeam_sessions")
      .select("id, pin_hash")
      .eq("code", sessionCode)
      .is("ended_at", null)
      .maybeSingle();

    if (!session) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pinHash = await hashPin(pin);
    if (pinHash !== session.pin_hash) {
      return new Response(JSON.stringify({ error: "Invalid PIN" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: itemsWithFiles } = await supabase
      .from("clipbeam_items")
      .select("file_path")
      .eq("session_id", session.id)
      .not("file_path", "is", null);

    if (itemsWithFiles && itemsWithFiles.length > 0) {
      const paths = itemsWithFiles
        .map((i) => i.file_path)
        .filter((p): p is string => typeof p === "string" && p.length > 0);

      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("clipbeam-items")
          .remove(paths);

        if (storageError) {
          console.error("Failed to delete storage files on session end", storageError);
        }
      }
    }

    await supabase
      .from("clipbeam_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", session.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("End session error:", err);
    return new Response(JSON.stringify({ error: "Failed to end session" }), {
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
