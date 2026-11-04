import { materials } from "@/design-system/materials";
import { palette, radius, spacing, typeScale } from "@/design-system/tokens";
import { RotateCcw, TriangleAlert } from "lucide-react-native";
import React, { Component, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  children: ReactNode;
  /** Called when the user retries — remounts only the player subtree. */
  onRetry?: () => void;
  /** Called when the user backs out entirely. */
  onExit?: () => void;
}

interface State {
  error: Error | null;
  attempt: number;
}

/**
 * Local boundary around the video surface.
 *
 * A player fault used to bubble to the app-level boundary and destroy the whole
 * navigation tree. Playback failures are recoverable: this keeps the user on the
 * player, explains what happened in plain language, and offers a retry that
 * remounts only the video subtree.
 */
export class PlayerBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Player surface error:", error?.message ?? error);
  }

  private retry = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
    this.props.onRetry?.();
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.root}>
          <View style={styles.panel}>
            <TriangleAlert size={30} color={palette.warning} />
            <Text style={styles.title}>Playback stopped</Text>
            <Text style={styles.body}>
              The video engine closed unexpectedly. Retrying reloads this title from where you were.
            </Text>
            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={this.retry} accessibilityRole="button">
                <RotateCcw size={15} color={palette.textOnAccent} />
                <Text style={[styles.btnLabel, { color: palette.textOnAccent }]}>Retry</Text>
              </Pressable>
              {this.props.onExit ? (
                <Pressable style={styles.btn} onPress={this.props.onExit} accessibilityRole="button">
                  <Text style={styles.btnLabel}>Go back</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      );
    }

    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  panel: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.sheet,
    backgroundColor: materials.elevated.fill,
    borderWidth: 1,
    borderColor: materials.elevated.border,
    maxWidth: 460,
  },
  title: { ...typeScale.title, color: palette.textPrimary },
  body: { ...typeScale.caption, color: palette.textSecondary, textAlign: "center", lineHeight: 20 },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: radius.pill,
    backgroundColor: materials.secondary.fill,
    borderWidth: 1,
    borderColor: materials.secondary.border,
  },
  btnPrimary: { backgroundColor: palette.accent, borderColor: palette.accentBright },
  btnLabel: { ...typeScale.headline, color: palette.textPrimary },
});
