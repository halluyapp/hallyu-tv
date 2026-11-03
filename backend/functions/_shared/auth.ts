import { jwtVerify, createRemoteJWKSet } from "https://deno.land/x/jose@v5.2.0/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JWKS = createRemoteJWKSet(new URL("https://api.rork.com/.well-known/jwks.json"));

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthUser {
  userId: string;
  email?: string;
  name?: string;
}

export async function requireAuth(req: Request): Promise<AuthUser> {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) throw new Error("Missing token");

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: "https://api.rork.com",
      audience: "__RORK_PROJECT_ID__",
    });
    return {
      userId: payload.sub!,
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
    };
  } catch (err) {
    throw new AuthError(err instanceof Error ? err.message : "Authentication failed");
  }
}

export function createUserClient(req: Request) {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  });
}

export function createAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** SHA-256 hex digest of a string. */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
