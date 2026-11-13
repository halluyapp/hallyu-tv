/**
 * Safe key-value storage backed by localStorage in the browser and an in-memory
 * Map when running in Node (unit tests / SSR). Never throws.
 */

const memoryFallback = new Map<string, string>();

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

export const webStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (hasLocalStorage()) return window.localStorage.getItem(key);
      return memoryFallback.get(key) ?? null;
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (hasLocalStorage()) {
        window.localStorage.setItem(key, value);
        return;
      }
      memoryFallback.set(key, value);
    } catch {
      memoryFallback.set(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (hasLocalStorage()) {
        window.localStorage.removeItem(key);
        return;
      }
      memoryFallback.delete(key);
    } catch {
      memoryFallback.delete(key);
    }
  },
};
