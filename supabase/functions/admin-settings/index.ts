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

    const { password, settings } = await req.json();

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

    if (settings && typeof settings === "object") {
      const { lockdownEnabled, announcementEnabled, announcementTitle, announcementBody, announcementLink } = settings as {
        lockdownEnabled?: boolean;
        announcementEnabled?: boolean;
        announcementTitle?: string;
        announcementBody?: string;
        announcementLink?: string;
      };

      const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (typeof lockdownEnabled === "boolean") {
        updatePayload.lockdown_enabled = lockdownEnabled;
      }
      if (typeof announcementEnabled === "boolean") {
        updatePayload.announcement_enabled = announcementEnabled;
      }
      if (typeof announcementTitle === "string") {
        updatePayload.announcement_title = announcementTitle;
      }
      if (typeof announcementBody === "string") {
        updatePayload.announcement_body = announcementBody;
      }
      if (typeof announcementLink === "string") {
        updatePayload.announcement_link = announcementLink;
      }

      const { error: upsertError } = await supabase
        .from("clipbeam_admin_settings")
        .upsert({ id: 1, ...updatePayload }, { onConflict: "id" });

      if (upsertError) {
        console.error("Admin settings upsert error", upsertError);
        return new Response(JSON.stringify({ error: "Failed to update settings" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: row, error } = await supabase
      .from("clipbeam_admin_settings")
      .select("lockdown_enabled, announcement_enabled, announcement_title, announcement_body, announcement_link, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("Admin settings fetch error", error);
      return new Response(JSON.stringify({ error: "Failed to load settings" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = {
      ok: true,
      settings: {
        lockdownEnabled: row?.lockdown_enabled ?? false,
        announcementEnabled: row?.announcement_enabled ?? false,
        announcementTitle: row?.announcement_title ?? "",
        announcementBody: row?.announcement_body ?? "",
        announcementLink: row?.announcement_link ?? "",
        updatedAt: row?.updated_at ?? new Date().toISOString(),
      },
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Admin settings error", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
