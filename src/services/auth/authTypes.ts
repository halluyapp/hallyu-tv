export interface CloudUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  provider: "google" | "guest";
  syncedAt: string | null;
}

export interface PairedDevice {
  id: string;
  name: string;
  platform: "tv" | "mobile" | "tablet";
  pairedAt: string;
  lastActive: string;
}

export interface TvPinSession {
  pin: string;
  expiresAt: number;
  pairedDeviceName?: string | null;
}

export interface AuthContextValue {
  user: CloudUser | null;
  isGuest: boolean;
  isSyncing: boolean;
  pairedDevices: PairedDevice[];
  activePinSession: TvPinSession | null;
  signInWithGoogle: (email?: string, name?: string) => Promise<CloudUser>;
  signOut: () => Promise<void>;
  syncCloudWatchlist: () => Promise<void>;
  generateTvPin: () => Promise<TvPinSession>;
  pairTvWithPin: (pin: string, deviceName?: string) => Promise<{ success: boolean; error?: string }>;
  unpairDevice: (id: string) => Promise<void>;
}
