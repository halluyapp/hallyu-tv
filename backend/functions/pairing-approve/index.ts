import { createAdminClient, json, requireAuth, AuthError, corsHeaders, sha256 } from "../_shared/auth.ts";

/**
 * Phone-side approval of a TV pairing challenge. The phone MUST be signed in.
 * Marks the pending challenge approved and registers the TV device row.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let user;
    try {
      user = await requireAuth(req);
    } catch {
      return json({ error: "Sign in required to approve a TV" }, 401);
    }

    const body = await req.json().catch(() => null);
    const code = body && typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code shown on the TV" }, 400);

    const admin = createAdminClient();
    const codeHash = await sha256(code);

    const { data: session, error: findError } = await admin
      .from("pairing_sessions")
      .select("id, status, expires_at, tv_device_name, tv_device_id")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (findError) {
      console.error("pairing-approve lookup failed:", findError.message);
      return json({ error: "Could not validate the code" }, 500);
    }
    if (!session || session.status !== "pending" || new Date(session.expires_at) < new Date()) {
      return json({ error: "This code is invalid, expired or already used" }, 400);
    }

    // Ensure a profile row exists for this user before referencing it.
    await admin.from("profiles").upsert({ id: user.userId, display_name: user.name ?? null });

    // Revoke any stale pending duplicate, then approve this one.
    const { error: approveError } = await admin
      .from("pairing_sessions")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: user.userId,
      })
      .eq("id", session.id)
      .eq("status", "pending");
    if (approveError) {
      console.error("pairing-approve update failed:", approveError.message);
      return json({ error: "Could not approve the pairing" }, 500);
    }

    // Register the TV device.
    const { data: device, error: deviceError } = await admin
      .from("devices")
      .insert({
        user_id: user.userId,
        device_type: "android_tv",
        device_name: session.tv_device_name || "Android TV",
        platform_version: "tv",
      })
      .select("id, device_name, device_type, created_at")
      .single();
    if (deviceError || !device) {
      console.error("pairing-approve device insert failed:", deviceError?.message);
      return json({ error: "Could not register the TV" }, 500);
    }

    await admin.from("pairing_sessions").update({ tv_device_id: device.id }).eq("id", session.id);

    return json({ device });
  } catch (err) {
    console.error("pairing-approve failed:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
