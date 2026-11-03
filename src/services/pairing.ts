import { supabase } from "./supabase";

/**
 * TV pairing client. All security-sensitive operations happen in the deployed
 * edge functions (pairing-create / pairing-approve / pairing-consume / tv-sync).
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

async function callFunction<T>(name: string, body: unknown, accessToken?: string | null): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error ?? `Pairing request failed (${res.status})`);
  }
  return data as T;
}

export interface PairingChallenge {
  code: string;
  expires_at: string;
}

/** TV: request a new challenge (shows QR + code). */
export function createTvChallenge(deviceName: string, nonce: string) {
  return callFunction<PairingChallenge>("pairing-create", { origin: "tv", device_name: deviceName, nonce });
}

/** Phone: generate a code for manual entry on the TV. */
export function createPhoneChallenge(accessToken: string) {
  return callFunction<PairingChallenge>("pairing-create", { origin: "phone" }, accessToken);
}

/** Phone: approve the code shown on the TV. Returns the registered TV device. */
export function approvePairing(accessToken: string, code: string) {
  return callFunction<{ device: { id: string; device_name: string; device_type: string } }>(
    "pairing-approve",
    { code },
    accessToken,
  );
}

/** TV: exchange code + nonce for a device session secret (single-use). */
export function consumePairing(code: string, nonce: string) {
  return callFunction<{ device_id: string; session_secret: string }>("pairing-consume", { code, nonce });
}

/** TV-side authenticated sync (device session credentials). */
export function tvSync<T = any>(
  deviceId: string,
  sessionSecret: string,
  action: "get_state" | "upsert_progress" | "toggle_watchlist",
  payload?: Record<string, unknown>,
): Promise<T> {
  return callFunction<T>("tv-sync", { device_id: deviceId, session_secret: sessionSecret, action, ...payload });
}
