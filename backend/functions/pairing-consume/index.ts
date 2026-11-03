import { createAdminClient, json, corsHeaders, sha256 } from "../_shared/auth.ts";

/**
 * TV-side consumption of an approved pairing challenge.
 * The TV presents { code, nonce } (both plaintext, held locally since creation).
 * Requirements enforced server-side:
 *  - code exists, is approved (never consumed/revoked/expired)
 *  - the nonce hash matches the challenge's challenge_nonce_hash
 *  - single use: consuming flips status to "consumed" atomically
 * Response returns a one-time device session secret (random); only its hash is stored.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => null);
    const code = body && typeof body.code === "string" ? body.code.trim() : "";
    const nonce = body && typeof body.nonce === "string" ? body.nonce : "";
    if (!/^\d{6}$/.test(code) || nonce.length < 16) {
      return json({ error: "Invalid pairing material" }, 400);
    }

    const admin = createAdminClient();
    const codeHash = await sha256(code);
    const nonceHash = await sha256(nonce);

    const { data: session } = await admin
      .from("pairing_sessions")
      .select("id, status, expires_at, tv_device_id")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (
      !session ||
      session.status !== "approved" ||
      new Date(session.expires_at) < new Date() ||
      !session.tv_device_id
    ) {
      return json({ error: "Pairing is not ready, has expired, or was already used" }, 400);
    }

    // Atomically consume: only succeeds exactly once.
    const { data: consumed, error: consumeError } = await admin
      .from("pairing_sessions")
      .update({ status: "consumed", consumed_at: new Date().toISOString() })
      .eq("id", session.id)
      .eq("status", "approved")
      .select("id")
      .maybeSingle();
    if (consumeError || !consumed) {
      return json({ error: "Pairing was already used" }, 400);
    }

    // Verify the challenge nonce belongs to this TV instance.
    const { data: verifyRow } = await admin
      .from("pairing_sessions")
      .select("challenge_nonce_hash")
      .eq("id", session.id)
      .maybeSingle();
    if (!verifyRow || verifyRow.challenge_nonce_hash !== nonceHash) {
      // Replay/forge attempt: revoke the pairing entirely.
      await admin.from("pairing_sessions").update({ status: "revoked" }).eq("id", session.id);
      return json({ error: "Device verification failed" }, 403);
    }

    // Mint the device session secret.
    const secret = crypto.randomUUID() + "." + crypto.randomUUID();
    const secretHash = await sha256(secret);

    const { error: deviceUpdateError } = await admin
      .from("devices")
      .update({ session_secret_hash: secretHash, last_seen_at: new Date().toISOString() })
      .eq("id", session.tv_device_id);
    if (deviceUpdateError) {
      console.error("pairing-consume device update failed:", deviceUpdateError.message);
      return json({ error: "Could not activate the TV session" }, 500);
    }

    return json({ device_id: session.tv_device_id, session_secret: secret });
  } catch (err) {
    console.error("pairing-consume failed:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
