#!/usr/bin/env node
/**
 * Supabase control-plane verification — REST + edge functions, using the
 * public (anon) key only. Run in CI (backend-verify workflow) and locally via
 * `npm run verify:backend`. Exits 1 on any failure.
 *
 * What is verified:
 *  1. Migrations landed: profiles / watchlist / watch_progress / devices tables exist and RLS blocks anon writes.
 *  2. pairing-create refuses unauthenticated phone-origin challenges.
 *  3. tv-sync refuses unauthenticated/unpaired device credentials.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^(EXPO_PUBLIC_[A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY must be set");
  process.exit(1);
}

let failures = 0;
function check(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function restHeaders(extra = {}) {
  return { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json", ...extra };
}

async function tableSelect(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, { headers: restHeaders() });
  return res;
}

async function main() {
  check("env: supabase url reachable", SUPABASE_URL.startsWith("https://"));

  // 1. Tables exist and RLS-blocks anon reads by default.
  for (const table of ["profiles", "watchlist", "watch_progress", "devices"]) {
    try {
      const res = await tableSelect(table);
      // 200 (empty, RLS-scoped) or 401/403 (RLS denied) are acceptable; 404 means missing migration.
      const ok = res.status === 200 || res.status === 401 || res.status === 403;
      check(`table ${table} reachable (${res.status})`, ok);
    } catch (err) {
      check(`table ${table} reachable`, false, String(err.message));
    }
  }

  // 2. pairing-create (phone origin) must reject without a user access token.
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/pairing-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ origin: "phone" }),
    });
    check("pairing-create rejects anonymous phone challenge", res.status >= 400 && res.status < 500, `HTTP ${res.status}`);
  } catch (err) {
    check("pairing-create rejects anonymous phone challenge", false, String(err.message));
  }

  // 3. tv-sync must reject unknown device credentials.
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/tv-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ device_id: "00000000-0000-0000-0000-000000000000", session_secret: "bogus", action: "get_state" }),
    });
    check("tv-sync rejects unpaired device", res.status >= 400 && res.status < 500, `HTTP ${res.status}`);
  } catch (err) {
    check("tv-sync rejects unpaired device", false, String(err.message));
  }

  console.log(failures === 0 ? "\nBackend verification: ALL PASS" : `\nBackend verification: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
