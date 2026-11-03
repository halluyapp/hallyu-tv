import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { supabase } from "@/services/supabase";

/** Rork Auth provider — Google sign-in with secure (Keystore-backed) sessions. */

const AUTH_URL = process.env.EXPO_PUBLIC_RORK_AUTH_URL!;
const APP_KEY = process.env.EXPO_PUBLIC_RORK_APP_KEY!;
const PROJECT_ID = process.env.EXPO_PUBLIC_PROJECT_ID!;

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

function userFromToken(token: string): AuthUser | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = (parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return {
      id: payload.sub,
      email: payload.email ?? "",
      name: payload.name,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isSigningIn: boolean;
  error: string | null;
  signIn: (provider: "google") => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeVerifierRef = useRef<string | null>(null);

  function clearError() {
    setError(null);
  }

  useEffect(() => {
    checkAuth();
    const subscription = Linking.addEventListener("url", handleDeepLink);
    return () => subscription.remove();
  }, []);

  async function checkAuth() {
    try {
      const accessToken = await SecureStore.getItemAsync("access_token");
      if (!accessToken) {
        const refreshTokenStored = await SecureStore.getItemAsync("refresh_token");
        if (refreshTokenStored) await refreshToken();
        return;
      }
      const decoded = userFromToken(accessToken);
      if (decoded) {
        await adoptUser(decoded);
      } else {
        await refreshToken();
      }
    } catch (err) {
      console.error("Auth check failed:", err);
    } finally {
      setIsLoading(false);
    }
  }

  /** Keep the Supabase profile row in sync with the signed-in identity. */
  async function adoptUser(u: AuthUser) {
    setUser(u);
    try {
      await supabase
        .from("profiles")
        .upsert({ id: u.id, display_name: u.name ?? null, avatar_url: u.picture ?? null }, { onConflict: "id" });
    } catch (err) {
      console.error("Profile sync failed:", err);
    }
  }

  async function handleDeepLink(event: { url: string }) {
    try {
      const url = new URL(event.url);
      if (url.pathname === "/auth/callback") {
        const code = url.searchParams.get("code");
        if (code) await exchangeCode(code);
      }
    } catch (err) {
      console.error("Deep link handling failed:", err);
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  async function signIn(provider: "google"): Promise<boolean> {
    setIsSigningIn(true);
    setError(null);
    try {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      codeVerifierRef.current = verifier;

      const env = Platform.OS === "web" ? "preview" : "native";
      const response = await fetch(`${AUTH_URL}/oauth/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_key: APP_KEY, provider, code_challenge: challenge, target: "rn", env }),
      });

      if (!response.ok) {
        codeVerifierRef.current = null;
        const body = await response.json().catch(() => ({}));
        setError((body as any).error || `Sign in failed (${response.status})`);
        return false;
      }

      const { auth_url } = await response.json();

      if (Platform.OS === "web") {
        window.open(auth_url, "_blank");
        return false;
      }

      const result = await WebBrowser.openAuthSessionAsync(auth_url, `rork-${PROJECT_ID}://auth/callback`);
      if (result.type === "success") {
        const url = new URL(result.url);
        const code = url.searchParams.get("code");
        if (code) {
          await exchangeCode(code);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error("Sign in failed:", err);
      setError(err instanceof Error ? err.message : "Sign in failed");
      return false;
    } finally {
      setIsSigningIn(false);
    }
  }

  async function exchangeCode(code: string) {
    const verifier = codeVerifierRef.current;
    if (!verifier) return;
    codeVerifierRef.current = null;

    const response = await fetch(`${AUTH_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_key: APP_KEY, code, code_verifier: verifier }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError((body as any).error || `Token exchange failed (${response.status})`);
      return;
    }

    const { access_token, refresh_token, user: userData } = await response.json();
    await SecureStore.setItemAsync("access_token", access_token);
    await SecureStore.setItemAsync("refresh_token", refresh_token);
    if (userData) await adoptUser(userData);
    else if (access_token) {
      const decoded = userFromToken(access_token);
      if (decoded) await adoptUser(decoded);
    }
  }

  async function refreshToken() {
    const storedRefreshToken = await SecureStore.getItemAsync("refresh_token");
    if (!storedRefreshToken) {
      setUser(null);
      return;
    }
    const response = await fetch(`${AUTH_URL}/oauth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_key: APP_KEY, refresh_token: storedRefreshToken }),
    });
    if (!response.ok) {
      await signOut();
      return;
    }
    const { access_token } = await response.json();
    await SecureStore.setItemAsync("access_token", access_token);
    const decoded = userFromToken(access_token);
    if (decoded) await adoptUser(decoded);
  }

  async function signOut() {
    await SecureStore.deleteItemAsync("access_token");
    await SecureStore.deleteItemAsync("refresh_token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isSigningIn, error, signIn, signOut, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
