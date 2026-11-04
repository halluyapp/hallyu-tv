# Design System — "Deep Blue Liquid Glass"

The visual identity is one environment, one light source, one highlight.

| Layer | Colour | Role |
| --- | --- | --- |
| Environment | `#03050B` → `#050810` → `#0B1220` | The midnight room. Everything sits on it. |
| Light source | `#3D7BFF` (bright `#6FA0FF`, deep `#1B44B8`) | The electric blue that lights glass edges and primary actions. |
| Highlight | `#6FE3FF` | Icy cyan. Used sparingly: active state, focus, progress. |

Text is `#EAF2FF` / `#9FB2CC` / `#66799A`. Nothing in the app may introduce a
fourth hue family — status colours (`success`, `warning`, `danger`) are the only
exceptions, and they are used at low saturation inside tinted soft fills.

Everything lives in `src/design-system/`:

| File | Contents |
| --- | --- |
| `tokens.ts` | Palette, spacing, radius, `typeScale` / `tvTypeScale` / `typeScaleFor`, ratio, hit targets, TV safe area. No React Native import (unit tests depend on it). |
| `materials.ts` | The six glass material variants. |
| `gradients.ts` | Every gradient stop and chrome translucency in the app. |
| `fonts.ts` | Sora loading + family names. |
| `motion.ts` | Timing tiers, easing control points, scale constants, springs, idle timeouts. |

## Materials

| Name | Fill | Blur | Where |
| --- | --- | --- | --- |
| `primary` | `rgba(26,40,68,0.62)` | 26 | Tab bar, player chrome, hero info panel |
| `secondary` | `glassFill` | — | Chips, pills, icon buttons |
| `elevated` | `rgba(12,20,36,0.90)` | 18 | Sheets, dialogs, menus |
| `focused` | `rgba(61,123,255,0.14)` + 2 px `accentBright` | — | Focused TV tile / selected control |
| `subtle` | `rgba(120,170,255,0.03)` | — | Separators, inert containers |
| `solid` | `surface` | — | Text-heavy panels over unpredictable artwork |

Every material is a **fill + inner fill + 1 px edge light + border**. That
structure renders identically with or without blur, so a low-tier device sees
the same design, just without the refraction. A test asserts that only
`primary` and `elevated` carry a blur radius.

### Blur is rationed, not sprayed

`src/components/ui/BlurSurface.tsx` is the only component that creates a
`BlurView`. It:

- renders blur only when `effects().blur` is true;
- keeps a module-level counter of live surfaces and refuses to exceed
  `fx.blurSurfaces`, so a screen with many panels cannot spawn many GPU passes;
- always renders the tint, edge light and border underneath, so the fallback is
  structural rather than a degraded rectangle.

There are exactly three call sites: the tab bar, the player control shelf, and
picker sheets. Never inside a scrolling list.

## Device tiers

`src/hooks/useDeviceTier.ts` reads real total memory and CPU count from
`expo-device` — not the Android version — and derives `high` / `standard` / `low`.
Android version is only consulted when memory is unreadable, and then
conservatively.

| Tier | Blur | Ambience | Parallax | List window |
| --- | --- | --- | --- | --- |
| high (6 GB+) | yes | yes | yes | wide |
| standard (2.8–6 GB) | high-value surfaces only | yes | no | moderate |
| low (<2.8 GB) | no | no | no | trimmed |

The identity survives every tier; only the cost changes.

## Typography

- **Sora** (SIL OFL, bundled locally in `assets/fonts/`, licence alongside) for
  display, titles, headlines and micro labels: SemiBold 600, Bold 700,
  ExtraBold 800 only.
- **System font** for body and caption copy — better legibility at small sizes
  and no bundle cost.

TV uses `typeScaleFor(true)`: everything steps up roughly 35 % and gains line
height, because ten feet is not a finger's distance.

## Motion

| Tier | ms | Use |
| --- | --- | --- |
| `instant` | 120 | Press feedback, focus settle |
| `fast` | 180 | Chip selects, small reveals |
| `normal` | 260 | Screen transitions, sheets |
| `slow` | 420 | Hero crossfade, panel materialisation |
| `cinematic` | 680 | Rare opening flourish only |

`easing` is stored as plain bezier control points so `motion.ts` stays free of
React Native imports; consumers call `Easing.bezier(...)`. Reduce Motion is
honoured through `useReducedMotion` — every animated surface checks it.

Scale constants: press `0.97` on touch, `1.0` on TV (pressing a remote is not a
touch), focus `1.06` (hard ceiling `1.08`), poster lift `1.03`, sheets enter from
`0.96`.

## TV is its own product

Android TV is not a scaled phone screen. It has its own screens
(`TvHomeScreen`, `TvDetailsScreen`, `TvDownloadsScreen`, `TvSearchScreen`), its
own type scale, its own focus surface (`src/components/tv/TvFocusable.tsx`), its
own idle timeout (5 s vs 3.2 s) and its own destructive-flow pattern — deletion
uses an in-app confirmation because `Alert.alert` does not render on TV.

`Pressable`'s style callback has no `focused` field in React Native 0.81, so
focus styling always goes through `TvFocusable`. Focus is a **blue edge light**,
never a colour flood or a bounce.

## Rules enforced by tests

`tests/design-system.test.ts` fails the build when:

- a raw colour literal appears outside `src/design-system/` (the player is the
  single exemption, and only for pure-black letterboxing and the subtitle plate);
- a material has no documented `use`;
- a material blurs without declaring a blur method, or vice versa;
- anything other than `primary` / `elevated` blurs;
- motion tiers are out of order or exceed the cinematic ceiling;
- the TV focus scale leaves the comfortable range;
- the TV type scale is not larger than mobile at every size.
