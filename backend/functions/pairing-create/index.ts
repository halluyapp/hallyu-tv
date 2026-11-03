import { createAdminClient, json, sha256, requireAuth, corsHeaders } from "../_shared/auth.ts";

/**
 * Creates a short-lived pairing challenge.
 *
 * Called by:
 *  - The TV (unauthenticated): sends { origin: "tv", device_name, nonce }.
 *    The nonce binds this challenge to the specific TV instance; the TV must
 *    keep it locally until consumption. Response contains the human code.
 *  - The phone (authenticated): sends { origin: "phone" }. The phone shows the
 *    code for manual entry on the TV.
 *
 * The plaintext code is never stored — only its SHA-256 hash.
 */

const CODE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const MAX_PENDING_SESSIONS = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Invalid body" }, 400);

    const origin = (body as Record<string, unknown>).origin;
    if (origin !== "tv" && origin !== "phone") {
      return json({ error: "origin must be 'tv' or 'phone'" }, 400);
    }

    // Phone-generated codes require a signed-in user; TV challenges are anonymous
    // by design (the TV holds no user credentials until consumption).
    if (origin === "phone") {
      try {
        await requireAuth(req);
      } catch {
        return json({ error: "Sign in required to generate a pairing code" }, 401);
      }
    }

    const admin = createAdminClient();

    // Crude abuse cap: never keep more than MAX_PENDING_SESSIONS live challenges.
    const { count } = await admin
      .from("pairing_sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString());
    if ((count ?? 0) >= MAX_PENDING_SESSIONS) {
      return json({ error: "Too many pending pairing requests. Try again shortly." }, 429);
    }

    // Cryptographically secure 6-digit code (48 bits of the random source).
    const bytes = crypto.getRandomValues(new Uint32Array(1));
    const code = String(bytes[0]! % 1_000_000).padStart(6, "0");

    let nonceHash = "";
    if (origin === "tv") {
      const nonce = (body as Record<string, unknown>).nonce;
      if (typeof nonce !== "string" || nonce.length < 16) {
        return json({ error: "TV must supply a nonce of at least 16 random characters" }, 400);
      }
      nonceHash = await sha256(nonce);
    } else {
      nonceHash = await sha256(crypto.randomUUID() + crypto.randomUUID());
    }

    const deviceName =
      typeof (body as Record<string, unknown>).device_name === "string"
        ? String((body as Record<string, unknown>).device_name).slice(0, 80)
        : origin === "tv"
          ? "Android TV"
          : "Phone-generated code";

    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    const { error } = await admin.from("pairing_sessions").insert({
      code_hash: await sha256(code),
      challenge_nonce_hash: nonceHash,
      status: "pending",
      tv_device_name: deviceName,
      expires_at: expiresAt,
    });
    if (error) {
      console.error("pairing-create insert failed:", error.message);
      return json({ error: "Could not start pairing" }, 500);
    }

    return json({ code, expires_at: expiresAt, origin });
  } catch (err) {
    console.error("pairing-create failed:", err);
    return json({ error: "Internal server error" }, 500);
  }
});


