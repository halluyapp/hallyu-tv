import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { useAuth } from "@/hooks/useAuth";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal, StyleSheet, Text, View, Pressable } from "react-native";
import { Lock, X } from "lucide-react-native";
import { Button } from "../ui/Button";

/**
 * Guest sign-in gate. Explains why sign-in is required, offers Google sign-in
 * and a clear return-to-browsing action. Preserves browsing context: the gate
 * is a sheet over whatever the guest was viewing. After sign-in, the pending
 * (non-playback) action is confirmed by the user or auto-completed; playback
 * is never auto-started — the user re-taps Play.
 */

interface GateRequest {
  title: string;
  message: string;
  /** Non-playback action to run after successful sign-in. */
  pendingAction?: () => void;
}

interface GateContextType {
  showGate: (req: GateRequest) => void;
}

const GateContext = createContext<GateContextType | null>(null);

export function GateProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<GateRequest | null>(null);
  const { user, signIn, isSigningIn, error, clearError } = useAuth();
  const pendingRef = useRef<(() => void) | undefined>(undefined);

  const showGate = useCallback((req: GateRequest) => {
    pendingRef.current = req.pendingAction;
    setRequest(req);
  }, []);

  const close = () => {
    pendingRef.current = undefined;
    setRequest(null);
    clearError();
  };

  const handleSignIn = async () => {
    const ok = await signIn("google");
    if (ok) {
      const action = pendingRef.current;
      pendingRef.current = undefined;
      setRequest(null);
      // Non-playback actions run automatically; playback stays user-confirmed.
      action?.();
    }
  };

  return (
    <GateContext.Provider value={{ showGate }}>
      {children}
      <Modal visible={request !== null} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.grabber} />
            <Pressable style={styles.close} onPress={close}>
              <X size={18} color={palette.textSecondary} />
            </Pressable>
            <View style={styles.iconWrap}>
              <Lock size={20} color={palette.accent} />
            </View>
            <Text style={styles.title}>{request?.title ?? ""}</Text>
            <Text style={styles.message}>{request?.message ?? ""}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label={user ? "Signed in" : "Continue with Google"}
              onPress={handleSignIn}
              loading={isSigningIn}
              disabled={user !== null}
              style={{ alignSelf: "stretch", marginTop: spacing.lg }}
            />
            <Button label="Not now" variant="quiet" onPress={close} style={{ alignSelf: "stretch" }} />
          </Pressable>
        </Pressable>
      </Modal>
    </GateContext.Provider>
  );
}

export function useGate() {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error("useGate must be used within GateProvider");
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: palette.scrim, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: palette.backgroundElevated,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderColor: palette.glassStroke,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    alignItems: "center",
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.glassStroke,
    marginBottom: spacing.lg,
  },
  close: { position: "absolute", top: spacing.lg, right: spacing.xl, padding: spacing.xs },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: { ...typeScale.title, color: palette.textPrimary, marginTop: spacing.sm, textAlign: "center" },
  message: {
    ...typeScale.body,
    color: palette.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  error: { color: palette.danger, fontSize: 13, marginTop: spacing.md, textAlign: "center" },
});
