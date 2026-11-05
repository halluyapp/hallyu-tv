import { palette, radius, spacing } from "@/design-system/tokens";
import { useSound } from "@/services/sound/SoundContext";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

interface GoogleSignInButtonProps {
  onPress: () => void;
  loading?: boolean;
  label?: string;
}

export function GoogleSignInButton({
  onPress,
  loading = false,
  label = "Sign in with Google",
}: GoogleSignInButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const { play } = useSound();

  return (
    <Pressable
      onPress={() => {
        if (!loading) {
          play("tap");
          onPress();
        }
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.button,
        pressed && styles.buttonPressed,
        focused && styles.buttonFocused,
      ]}
    >
      <View style={styles.iconContainer}>
        <GoogleLogo />
      </View>
      <Text style={styles.label}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={palette.accentBright} style={styles.spinner} />
      ) : null}
    </Pressable>
  );
}

function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill="#EA4335"
        d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z"
      />
      <Path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
      />
      <Path
        fill="#FBBC05"
        d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.2-2 .4-2.7L1.6 6.4C.6 8.4 0 10.6 0 12s.6 3.6 1.6 5.6l3.7-2.9z"
      />
      <Path
        fill="#34A853"
        d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 15.9C3.5 19.7 7.4 23 12 23z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    gap: 12,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  buttonFocused: {
    borderColor: palette.accentBright,
    backgroundColor: "rgba(255, 94, 58, 0.14)",
    shadowColor: palette.accent,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  spinner: {
    marginLeft: 6,
  },
});
