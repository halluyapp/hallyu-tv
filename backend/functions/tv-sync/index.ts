import { createAdminClient, json, corsHeaders, sha256 } from "../_shared/auth.ts";

/**
 * Device-authenticated sync for paired TVs.
 * The TV authenticates with { device_id, session_secret } (secret held in
 * SecureStore; only its hash is stored in the database). Revoked devices fail
 * verification and are instructed to de-pair.
 *
 * Actions:
 *  - "get_state":   returns { watchlist[], resume[], watch_progress[] } for the owning user
 *  - "upsert_progress": writes one watch_progress row
 *  - "toggle_watchlist": insert-or-delete one watchlist row
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Invalid body" }, 400);

    const deviceId = typeof body.device_id === "string" ? body.device_id : "";
    const secret = typeof body.session_secret === "string" ? body.session_secret : "";
    const action = typeof body.action === "string" ? body.action : "";
    if (!deviceId || !secret) return json({ error: "Missing device credentials" }, 401);

    const admin = createAdminClient();
    const secretHash = await sha256(secret);

    // session_secret_hash MUST be selected: the credential check below compares it.
    const { data: device } = await admin
      .from("devices")
      .select("id, user_id, device_name, revoked_at, session_secret_hash")
      .eq("id", deviceId)
      .maybeSingle();

    if (!device || device.revoked_at || device.session_secret_hash !== secretHash) {
      return json({ error: "unpaired", message: "This TV has been unpaired. Pair again." }, 401);
    }

    await admin.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);

    if (action === "get_state") {
      const [progress, watchlist] = await Promise.all([
        admin
          .from("watch_progress")
          .select("*")
          .eq("user_id", device.user_id)
          .order("updated_at", { ascending: false })
          .limit(100),
        admin
          .from("watchlist")
          .select("*")
          .eq("user_id", device.user_id)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      const progressRows = progress.data ?? [];
      return json({
        watch_progress: progressRows,
        watchlist: watchlist.data ?? [],
        // "resume" is what the TV home renders: unfinished progress rows.
        resume: progressRows.filter(
          (p: Record<string, unknown>) =>
            !p.completed && typeof p.position_seconds === "number" && p.position_seconds > 5,
        ),
      });
    }

    if (action === "upsert_progress") {
      const p = body.progress ?? {};
      if (typeof p.subject_id !== "string" || !p.subject_id) {
        return json({ error: "subject_id required" }, 400);
      }
      const { error } = await admin.from("watch_progress").upsert(
        {
          user_id: device.user_id,
          subject_id: p.subject_id,
          detail_path: p.detail_path ?? null,
          media_type: p.media_type === "series" ? "series" : "movie",
          title: p.title ?? "",
          poster_url: p.poster_url ?? null,
          season_number: p.season_number ?? null,
          episode_number: p.episode_number ?? null,
          position_seconds: Number(p.position_seconds) || 0,
          duration_seconds: Number(p.duration_seconds) || 0,
          completed: Boolean(p.completed),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id, subject_id, season_number, episode_number" },
      );
      if (error) {
        console.error("tv-sync upsert_progress failed:", error.message);
        return json({ error: "Could not save progress" }, 500);
      }
      return json({ ok: true });
    }

    if (action === "toggle_watchlist") {
      const w = body.item ?? {};
      if (typeof w.subject_id !== "string" || !w.subject_id) {
        return json({ error: "subject_id required" }, 400);
      }
      if (w.remove === true) {
        const { error } = await admin
          .from("watchlist")
          .delete()
          .eq("user_id", device.user_id)
          .eq("subject_id", w.subject_id);
        if (error) return json({ error: "Could not update watchlist" }, 500);
        return json({ ok: true, in_watchlist: false });
      }
      const { error } = await admin.from("watchlist").upsert(
        {
          user_id: device.user_id,
          subject_id: w.subject_id,
          detail_path: w.detail_path ?? null,
          media_type: w.media_type === "series" ? "series" : "movie",
          title: w.title ?? "",
          poster_url: w.poster_url ?? null,
        },
        { onConflict: "user_id, subject_id" },
      );
      if (error) return json({ error: "Could not update watchlist" }, 500);
      return json({ ok: true, in_watchlist: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("tv-sync failed:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
