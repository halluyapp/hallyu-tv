import { useFonts } from "expo-font";

/**
 * The display face: Sora (SIL Open Font License, bundled locally — see
 * assets/fonts/SORA-LICENSE.txt). Three static weights only: SemiBold for
 * labels and titles, Bold for section heads, ExtraBold for hero titles.
 *
 * Body copy stays on the system font: better legibility at small sizes, no
 * extra bundle weight, and it keeps text crisp on cheap panels.
 *
 * Fonts are loaded from the JS bundle (require) so there is no network fetch and
 * no flash of unstyled text after the first frame.
 */
export const FONT_FAMILY = {
  semibold: "Sora_600SemiBold",
  bold: "Sora_700Bold",
  extrabold: "Sora_800ExtraBold",
} as const;

/**
 * Fonts are cosmetic: if decoding fails we must open the app in the system face
 * rather than hold the splash forever. `useFonts` reports the failure through
 * its second tuple element, so a failed load counts as "ready".
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Sora_600SemiBold: require("../../assets/fonts/Sora_600SemiBold.ttf"),
    Sora_700Bold: require("../../assets/fonts/Sora_700Bold.ttf"),
    Sora_800ExtraBold: require("../../assets/fonts/Sora_800ExtraBold.ttf"),
  });
  return loaded || Boolean(error);
}
