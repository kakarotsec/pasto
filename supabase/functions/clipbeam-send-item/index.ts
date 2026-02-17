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
    const { sessionCode, pin, type, text, fileName, fileSize, mimeType, filePath } = await req.json();
    if (!sessionCode || !pin || !type) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
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
      return new Response(JSON.stringify({ error: "Uploads are temporarily disabled by the admin." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    await supabase
      .from("clipbeam_sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", session.id);

    const cutoffIso = new Date(Date.now() - ITEM_TTL_MINUTES * 60 * 1000).toISOString();

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
          console.error("Failed to delete expired storage files", storageError);
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
    }

    const { data: existingItems } = await supabase
      .from("clipbeam_items")
      .select("id, file_path, file_size")
      .eq("session_id", session.id)
      .order("created_at", { ascending: false });

    if (existingItems && existingItems.length >= MAX_ITEMS) {
      const toDelete = existingItems.slice(MAX_ITEMS - 1);

      const pathsToDelete = toDelete
        .map((i) => i.file_path)
        .filter((p): p is string => typeof p === "string" && p.length > 0);

      if (pathsToDelete.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("clipbeam-items")
          .remove(pathsToDelete);

        if (storageError) {
          console.error("Failed to delete old storage files", storageError);
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
    }

    const dbType = type === "image" ? "file" : type;

    const { data: newItem, error } = await supabase
      .from("clipbeam_items")
      .insert({
        session_id: session.id,
        type: dbType,
        text_content: dbType === "text" ? text : null,
        file_name: fileName ?? null,
        file_size: fileSize ?? null,
        mime_type: mimeType ?? null,
        file_path: filePath ?? null,
      })
      .select("*")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ item: newItem }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send item error:", err);
    return new Response(JSON.stringify({ error: "Failed to send item" }), {
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
