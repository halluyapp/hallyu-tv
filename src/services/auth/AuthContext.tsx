import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthContextValue, CloudUser, PairedDevice, TvPinSession } from "./authTypes";

const USER_STORAGE_KEY = "@hallyu_auth_user";
const PAIRED_DEVICES_KEY = "@hallyu_paired_devices";
const PIN_SESSION_KEY = "@hallyu_tv_pin_session";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [activePinSession, setActivePinSession] = useState<TvPinSession | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const storedUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
        const storedDevices = await AsyncStorage.getItem(PAIRED_DEVICES_KEY);
        if (storedDevices) {
          setPairedDevices(JSON.parse(storedDevices));
        }
        const storedPin = await AsyncStorage.getItem(PIN_SESSION_KEY);
        if (storedPin) {
          const parsed: TvPinSession = JSON.parse(storedPin);
          if (parsed.expiresAt > Date.now()) {
            setActivePinSession(parsed);
          } else {
            await AsyncStorage.removeItem(PIN_SESSION_KEY);
          }
        }
      } catch (err) {
        console.warn("Auth state restore failed:", err);
      }
    })();
  }, []);

  const signInWithGoogle = useCallback(async (customEmail?: string, customName?: string) => {
    setIsSyncing(true);
    const email = customEmail || "hallyutv295@gmail.com";
    const name = customName || "Hallyu VIP";
    const cloudUser: CloudUser = {
      id: "usr_" + Math.random().toString(36).substring(2, 10),
      email,
      name,
      avatarUrl: null,
      provider: "google",
      syncedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(cloudUser));
    setUser(cloudUser);
    setIsSyncing(false);
    return cloudUser;
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  }, []);

  const syncCloudWatchlist = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    // Simulate cloud sync roundtrip
    await new Promise((resolve) => setTimeout(resolve, 600));
    const updated: CloudUser = {
      ...user,
      syncedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
    setUser(updated);
    setIsSyncing(false);
  }, [user]);

  const generateTvPin = useCallback(async (): Promise<TvPinSession> => {
    const rawPin = Math.floor(100000 + Math.random() * 900000).toString();
    const session: TvPinSession = {
      pin: rawPin,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      pairedDeviceName: null,
    };
    await AsyncStorage.setItem(PIN_SESSION_KEY, JSON.stringify(session));
    setActivePinSession(session);
    return session;
  }, []);

  const pairTvWithPin = useCallback(
    async (pinInput: string, deviceName = "Android TV Living Room"): Promise<{ success: boolean; error?: string }> => {
      const cleanPin = pinInput.replace(/\D/g, "");
      if (cleanPin.length !== 6) {
        return { success: false, error: "Please enter a valid 6-digit TV PIN." };
      }

      setIsSyncing(true);
      await new Promise((resolve) => setTimeout(resolve, 800));

      const newDevice: PairedDevice = {
        id: "dev_" + Math.random().toString(36).substring(2, 9),
        name: deviceName,
        platform: "tv",
        pairedAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
      };

      const updated = [newDevice, ...pairedDevices.filter((d) => d.name !== deviceName)];
      await AsyncStorage.setItem(PAIRED_DEVICES_KEY, JSON.stringify(updated));
      setPairedDevices(updated);

      if (activePinSession && activePinSession.pin === cleanPin) {
        const updatedSession = { ...activePinSession, pairedDeviceName: user?.name || "Mobile Phone" };
        await AsyncStorage.setItem(PIN_SESSION_KEY, JSON.stringify(updatedSession));
        setActivePinSession(updatedSession);
      }

      setIsSyncing(false);
      return { success: true };
    },
    [activePinSession, pairedDevices, user],
  );

  const unpairDevice = useCallback(
    async (id: string) => {
      const updated = pairedDevices.filter((d) => d.id !== id);
      await AsyncStorage.setItem(PAIRED_DEVICES_KEY, JSON.stringify(updated));
      setPairedDevices(updated);
    },
    [pairedDevices],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isGuest: user === null,
        isSyncing,
        pairedDevices,
        activePinSession,
        signInWithGoogle,
        signOut,
        syncCloudWatchlist,
        generateTvPin,
        pairTvWithPin,
        unpairDevice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
