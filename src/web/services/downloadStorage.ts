/**
 * Netflix-style Offline Media Vault
 *
 * Tier 1: Origin Private File System (OPFS) via `navigator.storage.getDirectory()`.
 *   Streams bytes directly to `<id>.mp4` on disk with zero RAM accumulation and
 *   byte-exact pause/resume offsets. Playback reads a disk-backed `File` handle.
 *
 * Tier 2: Chunked IndexedDB Vault (`hallyu-offline-media` v2).
 *   Fallback for environments without OPFS `createWritable`. Writes ~2 MB slice
 *   records into IndexedDB (`chunks` store) so downloads never buffer entire videos
 *   into JS heap arrays and can pause/resume via HTTP Range requests.
 */

const DB_NAME = "hallyu-offline-media";
const DB_VERSION = 2;
const LEGACY_BLOBS_STORE = "blobs";
const CHUNKS_STORE = "chunks";
const OPFS_DIR = "hallyu-vault";

export type VaultEngine = "OPFS Disk Vault" | "IndexedDB Vault";

export interface OfflineVaultCapabilities {
  engine: VaultEngine;
  persistent: boolean;
}

/** Build Range request headers for byte-exact HTTP resume. */
export function buildResumeHeaders(receivedBytes: number): Record<string, string> {
  if (receivedBytes > 0 && Number.isFinite(receivedBytes)) {
    return { Range: `bytes=${Math.floor(receivedBytes)}-` };
  }
  return {};
}

/**
 * Determine total byte size & starting offset from upstream HTTP response headers.
 * If server ignores Range and responds 200 instead of 206, we cleanly restart from byte 0.
 */
export function resolveRangeResponse(
  status: number,
  contentRange: string | null,
  contentLength: string | null,
  requestedOffset: number,
  fallbackTotal: number | null,
): { resumeFromOffset: number; totalBytes: number | null } {
  if (status === 206 && contentRange) {
    // Format: "bytes 1048576-5242879/5242880" or "bytes 1048576-5242879/*"
    const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(contentRange.trim());
    if (match) {
      const start = Number(match[1]);
      const fullTotal = match[3] === "*" ? fallbackTotal : Number(match[3]);
      return {
        resumeFromOffset: Number.isFinite(start) ? start : requestedOffset,
        totalBytes: fullTotal !== null && Number.isFinite(fullTotal) && fullTotal > 0 ? fullTotal : fallbackTotal,
      };
    }
  }

  const len = Number(contentLength);
  const full = Number.isFinite(len) && len > 0 ? len : fallbackTotal;
  if (status === 206 && requestedOffset > 0) {
    return {
      resumeFromOffset: requestedOffset,
      totalBytes: Number.isFinite(len) && len > 0 ? requestedOffset + len : fallbackTotal,
    };
  }
  return {
    resumeFromOffset: 0,
    totalBytes: full,
  };
}

let cachedOpfsSupport: boolean | null = null;

async function isOpfsWritableSupported(): Promise<boolean> {
  if (cachedOpfsSupport !== null) return cachedOpfsSupport;
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
      cachedOpfsSupport = false;
      return false;
    }
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    const testHandle = await dir.getFileHandle(".probe", { create: true });
    if (typeof testHandle.createWritable !== "function") {
      cachedOpfsSupport = false;
      return false;
    }
    await dir.removeEntry(".probe").catch(() => {});
    cachedOpfsSupport = true;
    return true;
  } catch {
    cachedOpfsSupport = false;
    return false;
  }
}

async function getOpfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

export async function requestPersistentVault(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage) return false;
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage.persist) return await navigator.storage.persist();
  } catch {}
  return false;
}

export async function detectVaultCapabilities(): Promise<OfflineVaultCapabilities> {
  const opfs = await isOpfsWritableSupported();
  let persistent = false;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persisted) {
      persistent = await navigator.storage.persisted();
    }
  } catch {}
  return {
    engine: opfs ? "OPFS Disk Vault" : "IndexedDB Vault",
    persistent,
  };
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_BLOBS_STORE)) {
        db.createObjectStore(LEGACY_BLOBS_STORE);
      }
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        const store = db.createObjectStore(CHUNKS_STORE, { keyPath: ["jobId", "idx"] });
        store.createIndex("byJob", "jobId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export interface MediaChunkWriter {
  engine: VaultEngine;
  append(chunk: Uint8Array, offset: number): Promise<void>;
  finalize(): Promise<void>;
  abort(): Promise<void>;
}

const IDB_FLUSH_THRESHOLD = 2 * 1024 * 1024; // 2 MB chunk slices in IndexedDB mode.

export async function createVaultWriter(jobId: string, resumeOffset: number): Promise<MediaChunkWriter> {
  const opfsReady = await isOpfsWritableSupported();
  if (opfsReady) {
    const dir = await getOpfsDir();
    const fileHandle = await dir.getFileHandle(`${jobId}.mp4`, { create: true });
    const writable = await fileHandle.createWritable({ keepExistingData: resumeOffset > 0 });
    let closed = false;

    if (resumeOffset > 0) {
      await writable.seek(resumeOffset);
    }

    return {
      engine: "OPFS Disk Vault",
      async append(chunk: Uint8Array) {
        const copy = new Uint8Array(chunk.byteLength);
        copy.set(chunk);
        await writable.write(copy.buffer);
      },
      async finalize() {
        if (!closed) {
          closed = true;
          await writable.close();
        }
      },
      async abort() {
        if (!closed) {
          closed = true;
          try {
            // In OPFS, closing flushes kept chunks so resumeOffset matches disk bytes!
            await writable.close();
          } catch {}
        }
      },
    };
  }

  // IndexedDB Chunked Writer fallback.
  const db = await openMediaDb();
  let chunkIdx = 0;

  if (resumeOffset <= 0) {
    await clearIdbJobChunks(db, jobId);
    chunkIdx = 0;
  } else {
    chunkIdx = await countIdbJobChunks(db, jobId);
  }

  let pendingBuffers: Uint8Array[] = [];
  let pendingBytes = 0;

  const flush = async () => {
    if (pendingBytes === 0) return;
    const merged = new Blob(
      pendingBuffers.map((b) => {
        const copy = new Uint8Array(b.byteLength);
        copy.set(b);
        return copy.buffer;
      }),
      { type: "application/octet-stream" },
    );
    pendingBuffers = [];
    pendingBytes = 0;
    const idx = chunkIdx++;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHUNKS_STORE, "readwrite");
      tx.objectStore(CHUNKS_STORE).put({ jobId, idx, data: merged });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Chunk write failed"));
    });
  };

  return {
    engine: "IndexedDB Vault",
    async append(chunk: Uint8Array) {
      pendingBuffers.push(chunk);
      pendingBytes += chunk.byteLength;
      if (pendingBytes >= IDB_FLUSH_THRESHOLD) {
        await flush();
      }
    },
    async finalize() {
      await flush();
      db.close();
    },
    async abort() {
      try {
        await flush();
      } catch {}
      db.close();
    },
  };
}

async function countIdbJobChunks(db: IDBDatabase, jobId: string): Promise<number> {
  return new Promise((resolve) => {
    const tx = db.transaction(CHUNKS_STORE, "readonly");
    const index = tx.objectStore(CHUNKS_STORE).index("byJob");
    const req = index.count(IDBKeyRange.only(jobId));
    req.onsuccess = () => resolve(req.result ?? 0);
    req.onerror = () => resolve(0);
  });
}

async function clearIdbJobChunks(db: IDBDatabase, jobId: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const tx = db.transaction(CHUNKS_STORE, "readwrite");
    const store = tx.objectStore(CHUNKS_STORE);
    const index = store.index("byJob");
    const cursorReq = index.openKeyCursor(IDBKeyRange.only(jobId));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** Retrieve disk-backed File (OPFS) or assembled Blob (IndexedDB chunks / legacy blob). */
export async function readVaultMedia(jobId: string): Promise<Blob | null> {
  // 1. Check OPFS first (zero-RAM disk-backed File).
  if (await isOpfsWritableSupported()) {
    try {
      const dir = await getOpfsDir();
      const handle = await dir.getFileHandle(`${jobId}.mp4`, { create: false });
      const file = await handle.getFile();
      if (file.size > 0) return file;
    } catch {
      // Not in OPFS — check IndexedDB below.
    }
  }

  // 2. Check IndexedDB chunk store, then legacy single blob store.
  try {
    const db = await openMediaDb();
    const parts = await new Promise<Blob[]>((resolve, reject) => {
      const tx = db.transaction(CHUNKS_STORE, "readonly");
      const index = tx.objectStore(CHUNKS_STORE).index("byJob");
      const req = index.getAll(IDBKeyRange.only(jobId));
      req.onsuccess = () => {
        const rows = (req.result as { idx: number; data: Blob }[] | undefined) ?? [];
        rows.sort((a, b) => a.idx - b.idx);
        resolve(rows.map((r) => r.data));
      };
      req.onerror = () => reject(req.error ?? new Error("Chunk read failed"));
    });
    if (parts.length > 0) {
      db.close();
      return new Blob(parts, { type: "video/mp4" });
    }

    const legacy = await new Promise<Blob | null>((resolve) => {
      if (!db.objectStoreNames.contains(LEGACY_BLOBS_STORE)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(LEGACY_BLOBS_STORE, "readonly");
      const req = tx.objectStore(LEGACY_BLOBS_STORE).get(jobId);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
    db.close();
    return legacy;
  } catch {
    return null;
  }
}

/** Query exact on-disk size written so far for a paused/interrupted download so resume offset stays exact! */
export async function getVaultPartialSize(jobId: string): Promise<number> {
  if (await isOpfsWritableSupported()) {
    try {
      const dir = await getOpfsDir();
      const handle = await dir.getFileHandle(`${jobId}.mp4`, { create: false });
      const file = await handle.getFile();
      if (file.size > 0) return file.size;
    } catch {}
  }

  try {
    const db = await openMediaDb();
    const total = await new Promise<number>((resolve) => {
      const tx = db.transaction(CHUNKS_STORE, "readonly");
      const index = tx.objectStore(CHUNKS_STORE).index("byJob");
      const req = index.getAll(IDBKeyRange.only(jobId));
      req.onsuccess = () => {
        const rows = (req.result as { data: Blob }[] | undefined) ?? [];
        resolve(rows.reduce((sum, r) => sum + (r.data?.size ?? 0), 0));
      };
      req.onerror = () => resolve(0);
    });
    db.close();
    return total;
  } catch {
    return 0;
  }
}

export async function deleteVaultMedia(jobId: string): Promise<void> {
  if (await isOpfsWritableSupported()) {
    try {
      const dir = await getOpfsDir();
      await dir.removeEntry(`${jobId}.mp4`);
    } catch {}
  }
  try {
    const db = await openMediaDb();
    await clearIdbJobChunks(db, jobId);
    if (db.objectStoreNames.contains(LEGACY_BLOBS_STORE)) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(LEGACY_BLOBS_STORE, "readwrite");
        tx.objectStore(LEGACY_BLOBS_STORE).delete(jobId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    db.close();
  } catch {}
}
