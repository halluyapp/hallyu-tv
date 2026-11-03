# MASTER BUILD PROMPT — STANDALONE REACT NATIVE STREAMING PLATFORM

**Document type:** Product specification + implementation contract for Rork  
**Project status:** Greenfield / new application  
**Primary platforms:** Android phones, Android tablets, Android TV  
**Required framework:** React Native + TypeScript  
**Streaming integration:** Zarhosting-hosted Moviebox-compatible API (details below are provisional and must be verified)  
**Repository status:** No repository exists yet. The user will create and connect a new, empty GitHub repository.  
**Working app name:** `[APP_NAME]` — do not invent or permanently establish the public brand without the user's approval.

---

# 0. YOUR ROLE AND THE NON-NEGOTIABLE MISSION

You are the lead product designer, senior React Native engineer, Android engineer, backend engineer, streaming-integration engineer, QA engineer and technical architect for this project.

Build a complete, production-minded, standalone streaming application from a clean start. The user expects a serious product, not a template, a web application inside a WebView, a visual prototype, or a collection of disconnected screens.

The product must have:

1. A genuinely premium, distinctive mobile UI and UX.
2. A real React Native application written in TypeScript.
3. Real Google authentication and persistent user sessions.
4. A real catalogue and search experience powered by the selected provider.
5. Working native video playback using verified stream responses.
6. Reliable device-managed downloads with background progress, interruption handling and resume where the server supports it.
7. Moviebox captions as the first subtitle source and OpenSubtitles as a fallback where credentials and provider terms permit it.
8. A proper Android TV experience with phone-to-TV pairing by QR code or manual code.
9. A small, secure backend for accounts, watch progress, watchlists and paired devices.
10. A tested release process and clear setup documentation.

The user has explicitly said that previous streaming projects failed. Treat reliability and verification as central product requirements. Do not optimise for the number of screens completed or for how impressive a demo looks. Optimise for complete, testable user journeys.

## Absolute rules

- **React Native is mandatory.** Do not build the product as React web, Next.js, a PWA, or an HTML app packaged as an APK. Do not use a WebView as the main application or as the video player.
- **Start from a clean project.** There is no legacy app, no existing backend, no existing codebase and no Hallyu application to reuse.
- **GitHub is the canonical source of truth.** The user will create an empty repository and connect it. Initialise and maintain the project directly in that connected repository. Do not create a separate Rork-hosted application/project as the real source of code. If the repository is not connected yet, stop before scaffolding and ask the user to connect the new repository. Do not silently create a parallel project.
- **No fake functionality.** No fake catalogue data in production, fake login, hard-coded demo stream URLs, fake download progress, fake subtitle tracks, fake QR pairing, or buttons that do nothing.
- **Never claim a feature works merely because its screen exists.** A feature is complete only after the real underlying flow has been exercised and its success and failure states have been tested.
- **Do not invent provider endpoints, response fields, headers, query parameters or credentials.** Verify them against the actual connected provider. If something cannot be verified, report the blocker and do not disguise it with a mock.
- **Keep the backend lean.** Do not build a social network, content-hosting service or video proxy. This is a streaming application with a small account and synchronisation backend.
- **Do not break legal or provider access controls.** Use only content and endpoints the operator is authorised to access. Do not bypass DRM, paywalls, authentication, access restrictions, rate limits or other technical protections. Do not reverse-engineer private credentials or embed secrets discovered in third-party applications. If the provider cannot lawfully or reliably supply a requested function, explain that limitation and stop that integration rather than bypassing it.
- **No secret in the mobile bundle.** API keys, OAuth client secrets, OpenSubtitles credentials, service-role keys and backend secrets must not be placed in source code, app assets or client-side environment variables that are bundled into the APK.
- Do not add unrequested features just to make the application look bigger. Finish the defined core product first.

---

# 1. PRODUCT CONCEPT AND EXPERIENCE PRINCIPLE

Create a standalone entertainment destination where a user can discover films and series, open detailed title pages, watch, download for offline viewing, select subtitles and continue watching across their signed-in devices.

The product should feel like a carefully art-directed streaming platform, not a generic list of posters. It should be calm, cinematic, tactile and confident. The experience must work on ordinary Android phones, including budget devices, while adapting properly to large Android TV screens and remote controls.

## The central experience

- On mobile, the user enters a rich cinematic discovery experience.
- A guest can explore the catalogue, search and inspect title details, but cannot use playback or personal/service actions.
- An authenticated user can watch, download, manage a watchlist, continue watching, choose subtitles and manage devices.
- On Android TV, the first-run experience is a pairing screen. The user connects the TV to an authenticated phone using a QR code or a short manual code. The TV does not pretend to be signed in before the pairing flow succeeds.
- The backend manages identity, user data and device pairing. Video bytes should normally travel from the authorised provider/CDN directly to the device, not through the app's account backend.

## Brand direction

The final public name and logo have not been supplied. Use a clearly labelled temporary app name in the development build. Keep branding in one central theme/configuration location so the real name, icon and package identity can be applied later without rewriting screens.

Do not use the names Hallyu or Veyra. Do not copy Moviebox branding, layouts, logos or proprietary artwork. Moviebox is the upstream content/API reference, not the identity of this product.

---

# 2. ACCESS MODEL: GUESTS CAN BROWSE, BUT NOTHING ELSE

This is a strict product rule, not a suggestion.

## Guest permissions

A guest may:

- Open the mobile app.
- Complete or skip introductory presentation screens.
- Browse the home catalogue and available content rows.
- Browse categories or supported catalogue sections.
- Search the catalogue and view search results.
- Open a movie or series details page.
- View available metadata, synopsis, poster, cast/genre/year information if supplied by the provider, and season/episode information if supplied.
- Navigate backwards and forwards through browsing screens.

A guest may **not**:

- Start playback, including an episode or film.
- Download any media or subtitle file.
- Add, remove or edit a watchlist item.
- Save playback progress or use Continue Watching.
- Use personal history, account settings or profile actions.
- Pair an Android TV.
- Access any other feature that performs an account-bound action or starts consumption of the service.

Search and opening a title's details are browsing. Playing, downloading, saving, pairing and other account actions require sign-in.

## Guest action behaviour

When a guest taps a locked action, show a polished sign-in gate explaining why sign-in is required. It must offer Google sign-in and a clear return-to-browsing action. Do not unexpectedly dump the user on the welcome screen or erase the current browsing position.

After successful authentication, return the user to the exact title, episode selector or action they originally tried to use, then continue only after the user confirms the action where appropriate. Do not automatically start playback just because a guest tapped Play before signing in; return to the title/player-ready screen and let the user tap Play again.

Do not make unauthenticated calls to stream-resolution or download endpoints. Enforce the restriction in the UI and in the relevant backend rules. Do not rely on a hidden button alone as the security boundary.

## Access matrix

| Capability | Guest | Signed-in user |
|---|---:|---:|
| Browse home/catalogue | Yes | Yes |
| Search and filter catalogue | Yes | Yes |
| View title details | Yes | Yes |
| View series seasons/episodes | Yes, if provider data permits | Yes |
| Play movie/episode | No | Yes |
| Download media | No | Yes |
| Add/remove watchlist | No | Yes |
| Continue watching / personal history | No | Yes |
| Select and use playback subtitles | No | Yes |
| Pair/manage Android TV | No | Yes |
| Account and device management | No | Yes |

---

# 3. PROVIDER DISCOVERY: ZARHOSTING / MOVIEBOX

This section is the starting technical lead from the user's previous testing and discussion. It is **not permission to assume the service is currently healthy**. Verify all details from the connected provider before making the integration a foundation of the app.

## 3.1 Provider identity and candidate base URL

The intended provider is the Zarhosting-hosted Moviebox-compatible API, previously identified in the user's work as:

```text
https://movieapi.zarhosting.dpdns.org/api/public/v1
```

Treat this URL as the starting base URL supplied by the user in the earlier project discussion. At the beginning of the project:

1. Confirm the host resolves and has a valid TLS certificate.
2. Confirm the API responds over HTTPS.
3. Confirm the actual API version and whether the base path is still correct.
4. Confirm whether an API key, token, account, allowlisted origin or other credential is now required. Earlier tests reportedly did not require an API key, but that must be rechecked.
5. Confirm the permitted use, access conditions, request limits and provider terms.
6. Save redacted real response examples and verified request details in `docs/provider-integration/`.
7. Do not put private credentials, session cookies or live signed media URLs in committed fixtures.

If the host is unavailable, has changed, is not authorised for this use, or cannot provide stable access, stop and report the exact evidence. Do not substitute a random Moviebox API found online and do not silently change providers.

## 3.2 Previously identified route map (provisional)

The following routes were identified in earlier testing. Verify the method, path, parameters, response shape, pagination and error format with actual requests:

```http
GET /home
GET /search?q={query}&page={page}
GET /detail/{detail_path}
GET /stream/{subject_id}
GET /stream/{subject_id}/captions
```

The prior integration notes also referred to these parameters where applicable:

```text
subject_id
 detail_path
 se          # season number
 ep          # episode number
 stream_id   # selected stream identifier, where supported
```

Do not assume every parameter is required on every route. Determine whether a movie uses a different request from a series episode. Determine the provider's actual season and episode numbering, including specials and season zero, before mapping it into the UI.

### Previous request-header lead

Earlier tests indicated that media CDN requests may require the following headers:

```http
Referer: https://www.moviebox.ph/
Origin: https://www.moviebox.ph
User-Agent: <normal supported client user agent, only if actually required>
```

`Referer` is the HTTP header spelling. Verify which requests require it: API request, media manifest, individual media segments, caption files, or some subset. Do not blindly attach browser headers to all requests. Do not claim a header is required unless a controlled test establishes that it is. Do not spoof an unrelated identity or use headers to bypass a provider's access restrictions.

Keep provider-specific headers inside the provider adapter. Do not scatter them across screen components or generic networking code.

## 3.3 Stream resolution findings to re-verify

Earlier tests described the stream route as returning actual signed CDN media URLs, with MP4 sources observed. Signed links may expire. Verify:

- Which stream formats are actually returned: MP4, HLS (`.m3u8`), MPEG-DASH (`.mpd`), or other formats.
- Whether the response includes a stream ID, quality, codec, file size, duration, expiry, caption references or required headers.
- Whether the URL is directly playable by a native Android media player.
- Whether seeking works, including seeking after a cold start.
- Whether Range requests work for the returned URL.
- Whether the CDN URL expires and how to resolve a fresh one.
- Whether the provider returns several qualities and whether each one is genuinely distinct.
- Whether the URL requires cookies or additional headers.
- Whether the provider allows direct streaming and local downloading for the intended use.

Do not assume every source is MP4. The player architecture must support the formats that the verified provider actually supplies. Prefer native Android playback using a maintained Media3/ExoPlayer-backed React Native integration. Do not use HTML video or a WebView as a workaround.

## 3.4 Download finding: no assumed dedicated download route

In earlier testing, a guessed route resembling the following reportedly returned 404:

```text
/api/public/v1/download/...
```

Therefore, do not build the project around an assumed server-side `/download` endpoint. The previous working direction was:

1. Request a fresh stream-resolution response.
2. Select a verified downloadable media URL and quality.
3. Download the media directly from the authorised CDN to the device.
4. Use HTTP Range/resume only when the CDN demonstrably supports it.
5. Resolve a fresh signed URL if the previous URL expires and the provider permits that workflow.

Re-test this entire path. A stream URL being playable does not automatically prove that the CDN allows a resumable file download. Do not use a backend video proxy to work around failed downloads. If direct download is not supported by the provider, report it clearly instead of simulating completion.

## 3.5 Provider test harness: build this before the screens depend on it

Create a small provider verification module or script under the repository's developer tooling. It should test, with safe timeouts and redacted output:

- Base URL reachability and TLS.
- Home response and response schema.
- Search response, pagination and empty search.
- A real title details response.
- A real movie stream-resolution response.
- A real series episode stream-resolution response, if series are supported.
- Captions response for the selected movie/episode.
- CDN HEAD or equivalent metadata request.
- A small authorised byte-range request, if supported.
- Actual playback in the Android player.
- A short controlled test download followed by local playback.

Use real content only where access is authorised. Never commit live signed URLs, cookies, tokens, user data or media files. Redact sensitive response fields in logs.

Create a provider contract document containing:

- Verified base URL and version.
- Route/method table.
- Required query parameters.
- Required headers by request type.
- Redacted sample response bodies.
- Typed response schemas.
- Pagination rules.
- Error and rate-limit behavior.
- Stream URL expiry behavior.
- Supported formats/codecs.
- Range-request behavior.
- Subtitle format and language metadata.
- Known limitations and the date each test was run.

Use runtime validation for external JSON. A provider response must never be trusted simply because TypeScript says it has a certain type.

---

# 4. TECHNICAL ARCHITECTURE

## 4.1 Framework and runtime

- React Native with TypeScript.
- Native Android application. A WebView is not the application architecture.
- Use a navigation solution that is actively maintained and compatible with the selected React Native setup.
- Use native-capable animation tooling for high-quality transitions.
- Use a native media playback engine with documented Android support.
- Use a native/background download solution, not a JavaScript loop that stops when the app is backgrounded.
- Use a secure credential store backed by Android Keystore for refresh tokens and sensitive local session material.
- Use local persistent storage for catalogue cache and user-facing settings.
- Keep API/network, authentication, playback, subtitles, downloads and device pairing in separate service modules.

Before choosing libraries, inspect their current official documentation, maintenance activity, React Native compatibility, Android API requirements, Android TV compatibility, licensing and known issues. Record the chosen versions and why they were selected. Do not choose a dependency only because a tutorial uses it.

### Expo vs bare/native setup

You may use Expo tooling only if the final product remains a real native React Native application and every selected native module works in the generated Android build. Expo Go is not an acceptable final runtime because this product needs native media playback, background downloads and Android TV support. If Expo prebuild or a custom development client is used, commit and maintain the native configuration. If the required TV or background capabilities cannot be supported cleanly, use the appropriate React Native native/bare architecture instead.

Do not create a web-only preview and call it the mobile app.

## 4.2 Suggested separation of responsibilities

Keep the codebase modular. Use a clear, conventional structure similar to the following, adjusting only when there is a documented reason:

```text
src/
  app/
  navigation/
  screens/
    onboarding/
    auth/
    home/
    discover/
    search/
    details/
    player/
    downloads/
    watchlist/
    profile/
    devices/
    tv/
  components/
    ui/
    cards/
    glass/
    player/
    feedback/
  design-system/
    tokens/
    typography/
    themes/
    motion/
  services/
    api/
    provider/
    auth/
    database/
    playback/
    downloads/
    subtitles/
    pairing/
  hooks/
  state/
  storage/
  types/
  utils/
  platform/
android/
backend/                 # or a clearly documented backend project location
supabase/                # only if Supabase is selected
  migrations/
  functions/
docs/
  architecture/
  provider-integration/
  backend/
  testing/
  release/
scripts/
```

Do not put all functionality in `App.tsx`. Do not put provider fetch calls in visual components. Do not let a component know how to construct a CDN URL.

## 4.3 Backend approach: small control plane, not a streaming server

The backend should handle only the responsibilities that require an account or secure server-side logic:

- Google authentication and user identity.
- User profile basics.
- Watch progress and Continue Watching synchronisation.
- Watchlist synchronisation.
- Paired TV device records and secure pairing.
- Optional secure OpenSubtitles API requests if a key is needed.

Do not upload or store movie/episode video files in the app backend. Do not proxy all stream traffic through the backend. Do not store full signed CDN URLs in the user's database. The backend is the control plane; the authorised provider/CDN is the media plane.

### Backend preference

Evaluate a minimal managed backend such as Supabase first because it can cover Google authentication, PostgreSQL, row-level security and realtime/polling needs without creating a custom server fleet. Verify current free-tier limits, availability, authentication configuration and likely costs before committing. If it is unsuitable, present the smallest viable alternative with the trade-offs. Use one primary backend, not Firebase plus Supabase plus a custom API by default.

Do not create a production dependency on a paid service without explicitly documenting the cost and asking the user to approve it. Keep the design compatible with a low/zero initial budget, while being honest about third-party API, hosting and OAuth requirements.

### Suggested logical data model

Implement only the tables/collections actually needed. A reasonable starting model is:

**profiles**
- `id` (same stable identity as auth user ID)
- `display_name`
- `avatar_url` (optional)
- `created_at`
- `updated_at`

**watch_progress**
- `id`
- `user_id`
- `subject_id`
- `detail_path` (if provider uses it)
- `media_type`
- `season_number` (nullable for movies)
- `episode_number` (nullable for movies)
- `position_seconds`
- `duration_seconds`
- `completed`
- `updated_at`
- unique key appropriate to user + title + season + episode

**watchlist**
- `id`
- `user_id`
- `subject_id`
- `detail_path` (optional)
- `media_type`
- `created_at`
- unique key on user + title

**devices**
- `id`
- `user_id`
- `device_type` (`android_phone`, `android_tablet`, `android_tv` or equivalent)
- `device_name`
- `platform_version`
- `created_at`
- `last_seen_at`
- `revoked_at` (nullable)
- store only the required secure device-session metadata; never expose raw refresh tokens to other users

**pairing_sessions**
- `id`
- `code_hash` or another safe verifier, not a reusable plaintext secret
- `challenge_nonce_hash`
- `status` (`pending`, `approved`, `consumed`, `expired`, `revoked`)
- `tv_device_id` (nullable until completed)
- `expires_at`
- `created_at`
- `approved_at` (nullable)
- one-time consumption information

Downloads should be managed locally on the device. Do not add a cloud-download database or upload video bytes. A small local SQLite record can track download state and file metadata.

### Backend security

- Enable row-level security for every user-owned table.
- Users can read/write only their own profile, watch progress, watchlist and devices.
- Pairing approval must be authenticated and validated server-side.
- A pairing code must be short-lived, rate-limited, single-use and bound to the intended TV challenge.
- Never trust `user_id` supplied by the client without deriving/checking it from the authenticated session.
- Never ship a service-role key in the APK.
- Add database migrations to GitHub.
- Add tests for cross-user isolation and unauthorised pairing.

---

# 5. AUTHENTICATION AND FIRST-RUN EXPERIENCE

## 5.1 Mobile first launch

Create a polished first-run journey:

1. Native splash/loading screen with the app mark and restrained motion.
2. A short, visually rich onboarding introduction that communicates discovery, watching and offline viewing without a long lecture.
3. Welcome/authentication screen with **Continue with Google** as the primary sign-in method.
4. **Explore as Guest** as the secondary path.
5. Optional minimal profile completion after first successful Google authentication, only if required.

Do not force users to create a password if Google sign-in is the approved account method. If an email/password flow is offered, implement it completely and only after the backend provider is configured. Do not show fake sign-in methods.

## 5.2 Google sign-in requirements

- Use the supported native Google Sign-In/OAuth flow for the chosen backend.
- Configure Android package name and SHA fingerprints correctly.
- Use the correct redirect/deep-link configuration.
- Handle cancelled login, network failures, invalid configuration and account errors clearly.
- Persist sessions securely and refresh them safely.
- Handle sign-out and token revocation correctly.
- Do not store passwords or tokens in plain AsyncStorage.
- Add an `.env.example` or equivalent containing placeholder variable names only.
- Document the exact Google Cloud and backend console steps the user must complete. Do not invent client IDs or secrets.

A first-time Google sign-in should create the user profile through the backend's supported flow. Returning users should be recognised without an unnecessary onboarding loop.

## 5.3 Session behavior

- A signed-in user remains signed in across ordinary app restarts.
- A network outage must not silently erase a valid local session.
- Expired sessions should refresh safely or show a clear sign-in recovery state.
- Sign-out must clear protected local session data and stop any active account-bound operation safely.
- Preserve guest browsing position during a sign-in gate.
- Do not repeatedly ask for sign-in after a successful session has been established.

---

# 6. DESIGN SYSTEM: ORIGINAL PREMIUM CINEMATIC GLASS

The visual quality is a top priority. Do not produce a generic streaming template with a black background and rows of rectangular posters. Do not interpret “glass” as placing blur on every element. Design a coherent, recognisable visual language.

## 6.1 Art direction: “Obsidian Glass / Emberlight”

Use a cinematic dark foundation with selective glass, controlled warm highlights and precise typography.

**Suggested starting palette (refine through actual screen design):**

| Token | Starting value | Purpose |
|---|---|---|
| `background` | `#080A0D` | Main deep-ink canvas |
| `backgroundElevated` | `#10151B` | Elevated screen regions |
| `surface` | `#151B22` | Solid cards and panels |
| `glassFill` | `rgba(225,235,245,0.055)` | Restrained translucent surfaces |
| `glassStroke` | `rgba(235,242,248,0.13)` | Hairline glass edge |
| `textPrimary` | `#F4F2ED` | Warm near-white typography |
| `textSecondary` | `#A4ADB8` | Secondary text |
| `textMuted` | `#6F7A86` | Low-priority metadata |
| `accent` | `#F07855` | Warm ember/coral action accent |
| `accentSoft` | `#65382F` | Muted accent surfaces |
| `success` | `#68B68D` | Confirmed success |
| `warning` | `#E5B35E` | Warnings |
| `danger` | `#E06B70` | Errors/destructive actions |

Treat these as design tokens, not colours to hard-code into each screen. Check real-world contrast. Do not introduce a purple AI gradient aesthetic, excessive neon, random blue glows or a rainbow of accent colours.

## 6.2 What “glass” should actually mean

Build believable layered glass surfaces:

- Translucent smoked-glass panels with a controlled blur and a subtle inner highlight.
- Very thin, low-contrast edge strokes rather than bright outlines.
- Soft ambient light behind important panels, not a giant glowing gradient behind every component.
- Small parallax/depth response where it improves interaction and remains performant.
- Floating bottom sheets, playback controls, search overlays and contextual panels can use glass.
- Main reading surfaces, long text and dense settings should remain clear and solid enough to read.
- Use real material hierarchy: background, artwork, content layer, floating glass layer and foreground controls.
- Avoid stacking multiple blur layers. Expensive blur must not cover the entire scrolling catalogue.

Glass should feel like a material with thickness and light, not a transparent white rectangle.

## 6.3 Artwork and poster presentation

- Use provider poster/artwork URLs when available and authorised.
- Handle missing images with designed fallbacks, not broken image icons or empty grey blocks.
- Use controlled poster cropping and image ratios by content type.
- Create an editorial hero treatment with artwork, title, concise metadata and deliberate contrast.
- Avoid placing too many tiny metadata labels over artwork.
- Do not fabricate ratings, genres, awards, cast details or content counts.
- Optimise image sizes, caching and memory use for low-end Android devices.
- Use lazy loading and pagination. Do not download every poster at once.

## 6.4 Typography and layout

- Use a strong editorial display style for key title moments and a highly readable sans-serif for navigation and controls.
- Bundle only fonts with licences that permit the intended use. Otherwise use high-quality system fonts.
- Create a spacing scale, type scale, radius scale and elevation/material scale.
- Maintain deliberate margins, balanced density, clean alignment and clear hierarchy.
- Use large title art direction sparingly so the app does not become difficult to scan.
- Design for narrow phones, large phones and tablets, then separately for TV.

## 6.5 Motion and transitions

Motion is part of the product, not decoration. Use a consistent timing and easing system.

- Micro-interactions: approximately 120–220 ms.
- Standard screen transitions: approximately 220–360 ms.
- Hero/detail transitions: approximately 300–480 ms where performance permits.
- Use spring motion sparingly for cards, sheets and focus states.
- Prefer shared-element-like continuity between poster cards and detail hero artwork where technically stable.
- Use subtle parallax and scale/opacity changes, not constant movement.
- Use polished skeleton shimmer, image reveal and loading state transitions.
- Buttons need convincing pressed/disabled/loading states.
- Back navigation should feel intentional and restore scroll position.
- Provide reduced-motion behavior and avoid animation that interferes with accessibility.
- Keep motion on the UI thread where supported. Do not animate huge images or multiple blur layers at high cost.

## 6.6 Component quality

Create reusable, production-quality components for:

- Glass panel and glass icon action.
- Primary, secondary, quiet and destructive buttons.
- Poster card and landscape feature card.
- Hero title section.
- Search field and filter/sort control.
- Metadata row and genre chips.
- Episode row and season selector.
- Bottom sheet and confirmation dialog.
- Loading skeleton and empty state.
- Network/offline/error banner.
- Authentication gate.
- Download progress row.
- Subtitle selector.
- TV focusable card and directional navigation state.

Each component must handle focus, loading, disabled and accessibility states. Avoid a different visual language on every screen.

---

# 7. MOBILE INFORMATION ARCHITECTURE AND SCREEN REQUIREMENTS

Create the actual navigation flow, not disconnected screenshots.

## 7.1 Suggested main navigation

Use a compact bottom navigation structure such as:

- **Home** — personalised/featured catalogue presentation, but do not claim personalisation for guests.
- **Discover** — browse categories and available catalogue sections.
- **Downloads** — visible to signed-in users; a guest tap opens the sign-in gate.
- **My Space** — watchlist, Continue Watching, history and profile/device settings; guest access opens the sign-in gate.

Search should be easy to reach from the home/discover experience. Refine the navigation only if usability testing demonstrates a clearer hierarchy. Do not create unnecessary tabs.

## 7.2 Splash and onboarding screens

- Native-feeling splash that loads quickly and does not hold the user on an artificial animation.
- Three or fewer concise onboarding steps unless research proves more are necessary.
- Strong, original visual compositions.
- Skip/continue controls that are obvious and accessible.
- Persist onboarding completion locally.
- Do not show onboarding on every launch.

## 7.3 Home screen

The home screen must feel curated and alive without inventing catalogue data.

Possible sections, only when provider data supports them:

- Featured title/hero.
- Trending/popular feed.
- Movies.
- Series.
- Recently added or latest, only if the source actually exposes a reliable meaning for it.
- Genre/category collections.
- Continue Watching for signed-in users only.
- Watchlist shortcuts for signed-in users only.

Requirements:

- Use a clear editorial hero, not a giant empty banner.
- Support pull-to-refresh where appropriate.
- Paginate or incrementally load large rows.
- Preserve horizontal and vertical scroll positions when navigating to details and back.
- Show accurate loading, error, empty and offline states.
- Do not invent a “Trending” label from arbitrary order. Map section labels from verified source semantics.
- Do not show duplicate cards just to fill space.

## 7.4 Discover / category browsing

- Provide clean category and genre browsing based on verified provider data.
- Use appropriate poster grids and content rails.
- Add filtering only when the underlying data supports it.
- Provide useful empty states if a category has no results.
- Guests can browse all available catalogue categories but cannot play or save content.

## 7.5 Search

- Responsive search field with debounced requests.
- Show useful initial state and recent searches only if stored locally or for the signed-in user as specified.
- Support pagination and loading-more behavior.
- Handle no results, network errors and cancelled requests.
- Avoid stale search results replacing a newer query.
- Search is a browsing action and is available to guests.
- Do not scrape an unrelated website to fill gaps.

## 7.6 Movie/series details

Create a polished details screen with:

- Artwork/hero image.
- Title and verified metadata.
- Synopsis with expand/collapse behavior.
- Genre/year/runtime/status only where supplied.
- Cast/crew only where supplied and useful.
- Clear primary Play or Resume action for signed-in users.
- Download action for signed-in users where a verified downloadable source exists.
- Watchlist action for signed-in users.
- Season/episode browser for series.
- Useful similar/recommended titles only if the provider supplies them reliably.

For guests, display the same browsing information but lock Play, Download and Save actions behind the sign-in gate.

Do not display fake ratings, fake episode counts, false quality labels, or fabricated content availability.

## 7.7 Series and episode selection

- Use the provider's real season and episode numbering.
- Clearly label season and episode titles if supplied.
- Show episode artwork where available; otherwise use a clean fallback.
- Show watched/progress state only for the authenticated user.
- Distinguish unavailable resources from loading failures.
- Do not silently substitute episode 1 when the user selected another episode.

## 7.8 Downloads screen

Signed-in users must be able to view:

- Active downloads and percentage/bytes progress.
- Paused downloads.
- Waiting/retrying downloads.
- Completed downloads.
- Failed downloads with a useful reason and Retry action.
- Local storage usage and available-space warnings.
- Delete action with confirmation.
- Offline playback action for completed and verified files.

Do not mark a download complete until the complete file has been validated and atomically moved to its final local path.

## 7.9 My Space / profile / settings

Include only the features required for a working streaming account:

- Basic profile identity from the authenticated account.
- Continue Watching.
- Watchlist.
- Viewing history if implemented with a clear delete/clear option.
- Paired devices list and revoke-device action.
- App preferences such as subtitle language, playback quality preference, Wi-Fi-only downloads and storage management where supported.
- Privacy/terms/about/version information.
- Sign out.

Do not add social feeds, likes, comments, follower systems or creator tools. They are outside this product scope.

---

# 8. NATIVE VIDEO PLAYER

The player is one of the most important parts of this application. It must use the native Android playback pipeline through a maintained React Native integration. Do not use a WebView.

## 8.1 Playback startup flow

1. Confirm the user is authenticated.
2. Validate that the selected title/episode has a real provider ID and required detail path.
3. Request a fresh stream resolution from the provider.
4. Validate the response and available media formats/qualities.
5. Select the user's explicit quality choice or the documented default/Auto behavior.
6. Pass the media URL and only its verified required headers to the native player.
7. Show a polished but informative loading state.
8. Start playback only when the native player confirms it is ready.
9. Start progress tracking after meaningful playback begins.
10. Recover from errors in a controlled way; do not endlessly retry a bad source.

Do not mark playback started when the API call merely returns HTTP 200.

## 8.2 Player interface

Create an immersive, minimal player with:

- Tap to reveal/hide controls.
- Central play/pause control.
- Seek bar with elapsed/remaining or elapsed/total time.
- 10-second rewind and forward controls.
- Quality selector based on real available streams.
- Subtitle selector.
- Audio-track selector only if multiple audio tracks are truly exposed and supported.
- Episode list/next episode for series where data supports it.
- Landscape/full-screen behavior.
- Buffering and reconnect states.
- Clear playback error state with Retry and Back actions.
- Correct Android Back behavior.
- Screen-awake handling while video is playing.
- System volume and brightness behavior without fighting Android's native controls.

Avoid heavy, long transitions over active playback. Keep overlay animations fast and lightweight.

## 8.3 Progress and Continue Watching

- Track playback position at sensible intervals and on pause, stop, app backgrounding and completion.
- Debounce writes to avoid sending a request every second.
- Store progress locally first where useful, then synchronise when online.
- Sync only the authenticated user's progress.
- Handle out-of-order updates and multiple devices safely. Use timestamps/versioning or a documented conflict rule.
- Resume from a valid previous position, not from the beginning when progress exists.
- Do not resume an item from the final few seconds if it is already considered completed.
- For series, track progress per episode and expose a clear Next Episode action.
- Make progress recovery resilient to app termination.

## 8.4 Stream URL and player error handling

Classify errors, at minimum:

- Provider unavailable.
- Title/episode has no stream.
- Stream resolver returned invalid data.
- Signed URL expired/unauthorised.
- CDN unavailable.
- Unsupported media format/codec.
- Network interruption.
- Decoder/player failure.
- User navigated away/cancelled.

For an expired signed URL, request a fresh resolution only when the provider supports it. Preserve current playback time when retrying if the new source permits it. Avoid infinite retry loops. Tell the user what happened in plain language without exposing internal URLs or stack traces.

---

# 9. DOWNLOAD SYSTEM: BACKGROUND, RESUMABLE AND HONEST

Downloads are a first-class native feature, not a small button that starts a foreground JavaScript fetch.

## 9.1 Required user behavior

A signed-in user can:

- Select a movie or episode.
- Select from actual provider qualities where available.
- See a realistic estimated file size only when the provider returns one or it can be reliably calculated.
- Start a download.
- See progress while remaining in the app.
- Leave the app or lock the screen while an eligible download continues.
- Receive an Android notification with real progress when the OS and permission settings allow it.
- Pause, resume, retry and cancel where supported.
- Return later and see a persisted download state.
- Play a completed download offline.
- Delete downloads and manage local storage.

## 9.2 Native implementation requirements

Evaluate and select a maintained native Android download mechanism suitable for long-running transfers. Depending on the chosen stack, this may use Android DownloadManager, WorkManager, a foreground service, or a dedicated native transfer module. Do not choose by name alone: verify that the selected approach supports the required pause/resume, progress, notification, app-restart and URL-header behavior.

If a long-running user-initiated transfer requires a foreground service under the targeted Android versions, implement the correct service type, notification channel and lifecycle. Request notification permission at an appropriate moment on Android versions that require it. If the user denies notifications, the download must still behave honestly and the UI must explain that notification progress is unavailable.

Use app-specific storage by default. Avoid requesting broad storage access without a real need. Do not write temporary files into cache directories that the OS may delete while a download is active.

## 9.3 Range and resume logic

Before promising resume, verify the CDN behavior:

- Check `Accept-Ranges` or test a small Range request.
- Observe `ETag` and/or `Last-Modified` if present.
- Confirm the CDN returns `206 Partial Content` with a correct `Content-Range` for a valid range request.
- Confirm the signed URL remains valid long enough or can be refreshed.
- Preserve only verified byte ranges.
- If the CDN does not support Range, do not pretend resume works. Provide a clear restart path and report the limitation.

For resumable downloads:

1. Store the download job metadata locally.
2. Write bytes into a `.part` file.
3. Persist byte count and validator metadata safely.
4. Resume with the correct Range/If-Range behavior when possible.
5. Detect expired signed links and resolve a fresh one if supported.
6. Verify the resulting file size/content type and any available checksum.
7. Move/rename the completed file atomically to its final location.
8. Mark complete only after validation succeeds.

Do not concatenate unrelated responses or append a full `200 OK` response to a partial file. Detect when a server ignored the Range header and restart safely.

## 9.4 Download state machine

Use a real persisted state model such as:

```text
queued
resolving
connecting
downloading
paused
waiting_for_network
retrying
verifying
completed
failed
cancelled
```

Define legal transitions and persist enough state to recover after app restart. Progress percentages must be based on actual transferred bytes and a known total length. If total length is unknown, show bytes transferred and an indeterminate progress indicator, not a fabricated percentage.

## 9.5 File and storage safety

- Use safe, sanitised filenames based on title/season/episode.
- Prevent path traversal and duplicate-name collisions.
- Store media in app-specific persistent storage.
- Keep a local database record mapping the file to provider subject/episode metadata.
- Detect missing, moved or corrupted files.
- Check available space before starting when the expected size is known.
- Limit concurrent downloads to a conservative number on budget devices.
- Never load an entire video into JavaScript memory.
- Clean temporary parts only after the user cancels or the recovery logic confirms they are unusable.
- On app update, do not delete completed user downloads accidentally.

## 9.6 Download acceptance tests

Test at minimum:

- Small known file completes and plays offline.
- Large file completes without the app remaining open, where Android permits it.
- App is backgrounded during transfer.
- Screen is locked during transfer.
- App process is killed and the job recovers where the native mechanism promises recovery.
- Wi-Fi/mobile data interruption occurs mid-download.
- User pauses and resumes.
- User cancels and the temporary file is cleaned safely.
- Signed URL expires mid-download.
- Range unsupported or ignored by server.
- Device has insufficient storage.
- Notification permission is denied.
- The completed file is not marked complete prematurely.

A download is not considered complete until it is played successfully from local storage without an internet connection.

---

# 10. SUBTITLE SYSTEM

## 10.1 Source priority

Use this order:

1. Captions returned by the verified Moviebox-compatible provider route.
2. OpenSubtitles search as a fallback if the first source has no acceptable match.

Previously identified candidate captions route:

```http
GET /stream/{subject_id}/captions
```

The prior notes mentioned `se`, `ep` and optionally `stream_id`. Verify the exact parameter requirements and response fields. Do not assume the endpoint returns the same shape for every title.

## 10.2 OpenSubtitles integration

The previous project discussion used the OpenSubtitles REST API shape, including:

```text
GET  https://api.opensubtitles.com/api/v1/subtitles
POST https://api.opensubtitles.com/api/v1/download
```

Re-check the current official OpenSubtitles API documentation, authentication requirements, rate limits, request headers, attribution rules and permitted usage before implementation.

- Keep the OpenSubtitles API key and any account token on the backend, never inside the APK.
- If an API key or account is required, create a documented server secret placeholder and tell the user exactly what configuration is needed.
- Do not bypass authentication or scrape private endpoints when a key is unavailable.
- Search by title, year, season, episode and external IDs where available.
- Rank results using metadata match, season/episode match, requested language, release/title match and subtitle format.
- Do not silently load a poor match. Present a small, understandable choice list when several candidates are credible.

## 10.3 Subtitle player features

- Language selector.
- Off option.
- Accurate display names and hearing-impaired labels where supplied.
- Support verified formats such as SRT and WebVTT after testing the selected player integration.
- Parse/convert subtitle formats locally only when necessary and preserve timing.
- Subtitle delay/synchronisation adjustment.
- Text size and background/outline options.
- Download subtitle alongside an offline video only when permitted and supported.
- Cache subtitle files safely and associate them with the correct movie/episode.
- Keep subtitle loading independent from video resolution so a missing subtitle does not prevent playback.

## 10.4 Subtitle failure handling

Distinguish no subtitles available, provider caption endpoint failure, external service authentication/configuration failure, network error, invalid subtitle file and unsupported format. Do not show “English available” unless an actual matching track exists.

---

# 11. ANDROID TV: PAIRING-FIRST EXPERIENCE

Android TV is a separate interaction environment. Do not simply stretch the phone layout across a television.

## 11.1 Detecting a TV device

Detect Android TV/Leanback capability using supported native Android device/package features and current platform guidance. Do not infer TV mode only from screen width or device name.

- A phone or tablet starts in the mobile experience.
- An Android TV/Leanback build starts in the TV experience.
- Ensure the application manifest and launcher configuration allow the intended Android TV installation and remote navigation.
- Keep the same authenticated account model across devices.

Verify the chosen React Native version and native libraries support Android TV sufficiently. If a library breaks D-pad focus, playback, manifest configuration or TV installation, do not hide the incompatibility. Choose a compatible solution or clearly report the blocker before committing the architecture.

## 11.2 First TV launch

On a new/unpaired Android TV installation, do **not** drop the user into an ordinary streaming home screen as though the TV were authenticated. Show a dedicated, premium **Connect your TV** screen containing:

- Large QR code.
- Short human-readable pairing code.
- Clear instruction to open the mobile app and choose Add/Connect TV.
- Expiry countdown or refresh indicator.
- Manual code entry option on the TV for the phone-generated-code flow.
- A calm explanation that the phone must be signed in.
- Refresh-code action and clear error states.

Do not show a reusable permanent pairing QR or expose an account token in the QR code.

## 11.3 Support both pairing directions

Implement both of the following, converging on the same secure backend pairing protocol:

**Flow A — TV displays the code**

1. TV requests a new pairing challenge from the backend.
2. Backend creates a cryptographically random, short-lived challenge and human-readable code.
3. TV displays QR + code.
4. User opens the signed-in mobile app.
5. User scans the QR or manually enters the TV code.
6. Phone displays the TV/device name and asks the user to confirm linking.
7. Backend validates the authenticated user, challenge, expiry and single-use status.
8. TV receives a short-lived approval signal, exchanges the challenge for its own device session and completes pairing.
9. TV opens its signed-in home experience.

**Flow B — Phone generates a code**

1. Signed-in user opens Devices on the phone and chooses Add TV.
2. Phone asks the backend to create a pairing challenge.
3. Phone displays a short code intended for entry on the TV.
4. User selects Enter a code on the TV and types the phone-generated code using the remote.
5. TV and backend validate the challenge and device identity.
6. Phone confirms the TV link.
7. Backend completes one-time pairing and the TV receives its device session.

The precise sequence may be adjusted to avoid a race condition, but both directions must work and must use the same secure pairing service.

## 11.4 Pairing security

- Pairing codes must be generated with a cryptographically secure random source.
- Use adequate entropy and an expiry window, such as 2–5 minutes, selected after considering usability and brute-force risk.
- Store only hashed/verifiable code material where appropriate.
- Rate-limit attempts by device, IP and account.
- Bind the challenge to a TV-generated nonce/device instance.
- A pairing challenge is single-use.
- A phone must be authenticated before it approves a TV.
- Show the device name/type on the phone before approval.
- Do not put access or refresh tokens inside a QR code.
- The TV exchanges the approved one-time challenge for its own session through a protected backend call.
- Store TV credentials using an appropriate secure native store.
- Allow users to revoke a paired TV from mobile settings.
- A revoked TV must lose access on its next protected request and clear local session material.
- Expired, replayed, already-consumed or guessed codes must be rejected.

Use realtime subscription or safe polling for the TV's waiting state. Realtime disconnect must have a polling fallback. Stop polling after success, cancellation or expiry.

## 11.5 TV home and navigation after pairing

After successful pairing:

- Show the TV-specific home screen.
- Use a 10-foot UI with readable text, larger artwork and deliberate spacing.
- Support D-pad left/right/up/down, Enter/Select, Back and menu actions.
- Make the current focus state obvious and attractive.
- Do not rely on hover or touch gestures.
- Ensure focus cannot become trapped behind an overlay.
- Restore sensible focus after returning from details or playback.
- Support a physical remote and Android TV emulator testing.
- Use horizontal content rails only where they are easy to navigate.

TV playback controls must be remote-friendly. Include play/pause, seek, subtitles, quality where available, episode selection and exit/back behavior.

If a TV is unpaired or revoked, it returns to the pairing screen. Do not leave protected content playable from a stale local screen.

## 11.6 TV permissions and downloads

Do not request phone-only permissions on TV. Do not assume the TV has a camera. TV pairing must work through manual code entry even without a camera. TV-local download support is optional unless it can be implemented reliably with the device's storage and platform capabilities; phone downloads are the mandatory first target.

---

# 12. LOCAL DATA, CACHING AND LOW-END PERFORMANCE

The app must remain usable on budget Android hardware and unstable mobile networks.

## Performance rules

- Paginate data and avoid loading the entire catalogue at once.
- Use image caching and appropriately sized poster variants where available.
- Avoid memory-heavy blur across scrolling content.
- Avoid keeping multiple full-resolution hero images alive unnecessarily.
- Use list virtualization correctly.
- Cancel stale search and details requests when navigating away.
- Avoid re-rendering the entire home screen when download progress changes.
- Keep video bytes out of JavaScript memory.
- Avoid excessive analytics, background polling and repeated full catalogue refreshes.
- Handle app background/foreground transitions without restarting every screen.

## Local persistence

Use a reliable local persistence strategy for:

- Theme and subtitle preferences.
- Onboarding completion.
- Cached catalogue metadata with sensible expiry.
- Local download jobs and file paths.
- Playback recovery state needed when offline.
- Secure authentication/session data in a secure native store.

Do not store secrets in ordinary key/value preferences. Do not treat local cache as the source of truth for another user's private data.

## Network behavior

- Define timeouts by request type.
- Use bounded retries with exponential backoff and jitter for retryable requests.
- Do not retry non-idempotent operations blindly.
- Support cancellation.
- Show offline and reconnect states.
- Cache public catalogue data safely to improve repeat browsing.
- Never display stale stream URLs as if they were playable.
- Refresh signed media URLs only through the verified provider flow.

---

# 13. SECURITY, PRIVACY AND LEGAL IMPLEMENTATION RULES

- Use HTTPS for app/backend/provider communication.
- Keep all backend service keys and third-party API keys server-side.
- Validate provider JSON at runtime.
- Avoid logging full signed URLs, cookies, OAuth tokens, pairing codes or personal information.
- Scrub crash reports and analytics of secrets.
- Use row-level security and verify cross-account isolation.
- Protect deep links and pairing callbacks against replay and invalid redirects.
- Validate external URLs before passing them to the player or download manager. Restrict to expected HTTPS hosts/schemes established by provider responses and policy.
- Use secure file names and private app storage.
- Provide a privacy policy and terms-of-use placeholder that must be replaced with truthful, reviewed content before public release.
- Explain what account data is stored and how users can sign out/revoke devices.
- Do not scrape, redistribute or cache content in ways that violate the provider's terms or copyright rights.
- Do not implement DRM circumvention, paywall circumvention or access-control bypasses.

---

# 14. TESTING AND DEFINITION OF DONE

A build is not production-ready merely because it compiles. Use automated tests where practical and real Android device/emulator testing for native behavior.

## 14.1 Required test layers

**Unit tests**
- Provider response parsers and validators.
- Quality/episode selection logic.
- Guest access gating.
- Progress calculations and completion thresholds.
- Download state transitions.
- Subtitle match ranking.
- Pairing code state validation.

**Integration tests**
- Authentication and session refresh.
- User data read/write and RLS isolation.
- Home/search/details provider requests.
- Stream resolution and player startup.
- Captions retrieval and subtitle loading.
- Download manager persistence/recovery.
- Pairing challenge/approval/consumption/revocation.

**End-to-end tests**
1. Fresh install → onboarding → Explore as Guest → browse → open details.
2. Guest taps Play → sign-in gate appears → Google sign-in → return to title details → user taps Play → actual video plays.
3. Signed-in user searches for a title → opens details → plays a movie.
4. Signed-in user opens a series → selects the correct season/episode → playback starts for that exact episode.
5. Playback pauses/resumes and Continue Watching stores meaningful progress.
6. App is closed/reopened → session persists → progress is restored.
7. User adds/removes a watchlist item and sees the state synchronised.
8. User downloads a real file → backgrounds app → transfer completes where supported → airplane mode → local file plays.
9. Download is interrupted → resume/retry path behaves honestly.
10. Moviebox caption loads; fallback search works when configured; subtitle sync adjustment works.
11. TV displays pairing QR/code → phone scans/enters code → user confirms → TV pairs.
12. Phone-generated pairing code can be entered on TV.
13. Expired/replayed/revoked pairing code is rejected.
14. Revoked TV cannot continue protected access after the session is invalidated.
15. TV remote navigates the home screen, details and player without touch.

## 14.2 Device and network matrix

Test on:

- At least one low-memory Android phone.
- At least one modern Android phone.
- At least one Android TV device or Android TV emulator.
- Different Android API levels supported by the selected libraries.
- Wi-Fi and slower mobile data.
- Network loss during browsing, playback, caption loading and downloading.
- App backgrounding and process recreation.
- Notification permission granted and denied.
- Device rotation and player orientation behavior.

Record actual devices, Android versions, app version, test date and outcome. Do not claim device coverage that was not tested.

## 14.3 Measurable acceptance criteria

- Guest cannot start playback, download, save or pair by using UI tricks or direct navigation.
- Signed-in user can complete the whole playback flow with a real provider stream.
- A movie and a series episode are tested separately.
- The player reports readiness only after the native player is ready.
- Playback errors are actionable and do not cause infinite retry loops.
- Download progress represents real byte transfer.
- A completed download survives app restart and plays offline.
- Resume is advertised only when Range behavior has been verified.
- Captions are actual tracks and load in the native player.
- Backend user data is isolated by authenticated user.
- TV pairing is time-limited, single-use and revocable.
- TV remote navigation is usable without a touchscreen.
- No secrets are committed to GitHub or embedded in the APK.
- No critical buttons are inert and no production screen depends on fake data.

---

# 15. BUILD AND IMPLEMENTATION ORDER

Work in the following sequence. The order is intentional: prove difficult integrations before investing heavily in dependent UI.

## Phase 1 — Repository and technical feasibility

1. Wait until the user's new empty GitHub repository is connected.
2. Initialise the project in that repository only.
3. Confirm Android build environment and native development workflow.
4. Research current React Native, Android TV, native media, download and authentication library compatibility.
5. Decide the project architecture and document the decision.
6. Create the initial project, TypeScript configuration, linting, formatting, test setup and CI build check.
7. Produce a working blank native Android build before proceeding.

**Exit condition:** The project builds as a native React Native Android app from the connected repository. The build is not a web wrapper.

## Phase 2 — Provider verification spike

1. Verify Zarhosting host, TLS, base path and API requirements.
2. Verify `/home`, `/search`, `/detail/{detail_path}`.
3. Verify `/stream/{subject_id}` for a real movie and real series episode, if supported.
4. Verify `/stream/{subject_id}/captions`.
5. Verify `Referer`/`Origin` needs by request type.
6. Inspect media format, codec, headers, signed URL expiry and seeking.
7. Test Range requests and direct local download.
8. Test at least one real stream in the proposed native player.
9. Record evidence and known limitations.

**Exit condition:** A verified provider contract exists. The team can play a real authorised test stream in the native Android player. Download and subtitle capabilities are classified as verified, partially supported or unavailable.

If this phase fails, do not spend time building fake playback screens. Report what failed and what exact user/provider configuration is required.

## Phase 3 — Backend and authentication foundation

1. Select and configure the minimal backend.
2. Add migrations, RLS policies and backend functions.
3. Configure Google OAuth using user-supplied credentials.
4. Implement secure session persistence and account lifecycle.
5. Implement the guest/signed-in access gate.
6. Test cross-account data isolation.

**Exit condition:** Google sign-in works with real configuration, sessions persist, and guest restrictions are enforced.

## Phase 4 — Design system and mobile shell

1. Implement tokens, typography, surfaces and glass material components.
2. Implement motion and navigation patterns.
3. Build splash, onboarding, welcome/auth and guest entry.
4. Build the mobile tab/navigation shell.
5. Build loading, empty, offline and error states.
6. Test performance on a low-memory device.

**Exit condition:** A polished, navigable mobile shell exists with a coherent visual language and no placeholder actions presented as functional.

## Phase 5 — Real catalogue and discovery

1. Implement provider adapter and typed schemas.
2. Build home sections from verified API data.
3. Add pagination and catalogue caching.
4. Build search and categories.
5. Build details and season/episode screens.
6. Apply guest restrictions to all consumption actions.

**Exit condition:** A guest can browse real content and inspect details; authenticated users see the same real catalogue with valid locked actions available.

## Phase 6 — Playback and subtitle system

1. Implement stream resolution and format validation.
2. Integrate the native player.
3. Implement player controls and orientation behavior.
4. Implement quality/episode/audio selection only where supported.
5. Implement Moviebox captions.
6. Add secure OpenSubtitles fallback if configured.
7. Implement progress tracking and Continue Watching.
8. Test real playback and recovery.

**Exit condition:** A signed-in user can watch a real movie and series episode, select a real subtitle track and resume progress.

## Phase 7 — Native download manager

1. Verify CDN Range behavior.
2. Choose and integrate the native background transfer approach.
3. Implement persisted job state and notification progress.
4. Implement pause/resume/retry/cancel.
5. Implement signed URL refresh only if provider supports it.
6. Implement local storage and offline player source.
7. Perform interruption and recovery tests.

**Exit condition:** A real downloaded file completes, survives app restart and plays offline. Resume claims match actual CDN support.

## Phase 8 — Android TV and secure pairing

1. Enable TV installation/launcher configuration.
2. Implement TV device detection and TV-specific navigation shell.
3. Implement pairing challenge creation, QR display and manual TV code entry.
4. Implement phone scan/manual-entry approval.
5. Implement phone-generated code flow.
6. Implement TV session issuance, refresh, revocation and expiry.
7. Build TV home/details/player layouts and D-pad focus management.
8. Test with a real TV/emulator and remote.

**Exit condition:** Both pairing directions work, a paired TV can stream, and a revoked TV loses access.

## Phase 9 — Hardening and release preparation

1. Complete unit, integration and end-to-end tests.
2. Fix crashes, race conditions, memory leaks and navigation defects.
3. Check permissions, privacy, secrets and backend security.
4. Test low-memory and poor-network behavior.
5. Set app icon, splash assets, package ID and final brand only after user approval.
6. Configure release signing without committing keystores/passwords.
7. Produce signed APK/AAB as requested and provide exact install instructions.
8. Document versioning and update behavior.

**Exit condition:** Release candidate passes the definition-of-done checklist with a truthful report of any remaining limitations.

---

# 16. WORKING PRACTICES FOR THE AGENT

- Work autonomously through the agreed phases. Do not ask the user to re-explain requirements already written here.
- Do not ask for approval for every ordinary implementation decision. Make sensible engineering decisions and document them.
- Pause and ask only when a user-controlled secret, paid service, brand/package identity, provider permission or external account configuration is genuinely required.
- If a feature cannot be verified, say so clearly and continue with independent work that does not depend on the false assumption.
- Do not mark a phase complete until its exit condition is met.
- Keep commits small and logically grouped.
- Never force-push, delete the repository, rewrite the entire project or overwrite unrelated user work.
- Do not commit `.env`, credentials, signing keys, tokens, cookies, private response dumps, downloaded media or large binary test files.
- Include `.gitignore`, `.env.example` and setup documentation from the beginning.
- Run type checks, lint, tests and Android builds after meaningful changes.
- Fix root causes instead of adding layers of defensive code that hide an invalid architecture.
- Do not use `any` to silence type errors across provider or backend boundaries. Define and validate proper types.
- Do not suppress errors globally. Normalise and present meaningful errors.
- Do not generate screens with fake data and leave them in production paths. Any fixture data must be isolated to tests/development and clearly labelled.
- Do not create speculative endpoints or pretend a server function exists.
- Do not add unnecessary dependencies. Explain the purpose of significant native dependencies.
- Keep the README updated as commands and setup steps change.
- Report progress by phase, stating what is actually implemented, what was tested and what remains blocked.

## Required reporting format at each milestone

For every phase, provide:

1. **Completed:** exact code/functionality delivered.
2. **Verified:** commands, tests, devices and real flows executed.
3. **Not verified:** any behavior that remains unproven.
4. **Blockers:** credentials, provider failures, permissions or platform limitations.
5. **Repository changes:** important files and migrations added.
6. **Next phase:** the next concrete task.

Never write “everything works” without test evidence.

---

# 17. REQUIRED PROJECT DOCUMENTS AND DELIVERABLES

The repository must include and maintain:

- `README.md` — project overview, prerequisites, install/run/build commands.
- `docs/architecture/overview.md` — app, backend, provider and TV architecture.
- `docs/architecture/decisions/` — significant technical decisions and rejected alternatives.
- `docs/provider-integration/zarhosting-moviebox.md` — verified routes, parameters, headers, response examples and limitations.
- `docs/backend/schema.md` — database model, RLS and backend functions.
- `docs/tv/pairing-flow.md` — sequence and security behavior for both pairing directions.
- `docs/downloads/design.md` — state machine, resume support and native implementation details.
- `docs/subtitles/design.md` — provider captions, OpenSubtitles configuration and format handling.
- `docs/testing/test-matrix.md` — devices, OS versions, test dates and outcomes.
- `docs/release/release.md` — signing, build variants, versioning and release instructions.
- `.env.example` — placeholder variable names only.
- `.gitignore` — credentials, build outputs and local artifacts excluded.
- Database migrations and backend functions, if applicable.
- Automated tests for critical business logic.
- A working debug Android build and, after all required release gates pass, a release APK/AAB.

## Final handover must include

- GitHub repository structure and the exact branch used.
- React Native architecture and selected library versions.
- Backend provider and any ongoing costs/free-tier limits.
- Required user-supplied secrets/configuration, with setup steps.
- Verified Zarhosting/Moviebox endpoint contract.
- Playback format and tested devices.
- Whether direct downloads work and whether true resume works.
- Which subtitle sources work and any required OpenSubtitles credentials.
- Both TV pairing flows and their security behavior.
- Test summary with passed/failed/not-tested labels.
- Known limitations stated plainly.
- Exact build and install instructions.

---

# 18. FINAL PRODUCT CHECKLIST

Do not call this project complete until every applicable item below has a real result.

## Foundation
- [ ] Project lives in the user's connected GitHub repository.
- [ ] Native React Native Android build succeeds.
- [ ] TypeScript, linting, tests and CI checks are configured.
- [ ] No web wrapper or WebView-based main application.

## Authentication and access
- [ ] Google sign-in works with real credentials.
- [ ] Session persists securely.
- [ ] Guest can browse home, search and title details.
- [ ] Guest cannot play, download, save, continue watching or pair TV.
- [ ] Sign-in gate returns the user to the correct browsing context.

## Provider and catalogue
- [ ] Zarhosting base URL and current API behavior have been re-verified.
- [ ] Home catalogue works with real responses.
- [ ] Search and pagination work.
- [ ] Details and series episode data work.
- [ ] Provider schema is validated and errors are handled.

## Playback
- [ ] Real movie plays in native player.
- [ ] Real series episode plays in native player.
- [ ] Correct quality/source is selected.
- [ ] Seeking and recovery work where source supports them.
- [ ] Player controls and orientation work.
- [ ] Continue Watching stores and restores progress.

## Downloads
- [ ] A real file downloads to persistent device storage.
- [ ] Real byte progress is shown.
- [ ] Background behavior is tested.
- [ ] Interruption/retry behavior is tested.
- [ ] Resume behavior is tested and advertised only if verified.
- [ ] Completed file plays offline.
- [ ] Storage and deletion behavior work.

## Subtitles
- [ ] Moviebox caption endpoint is verified.
- [ ] A real caption track loads.
- [ ] OpenSubtitles fallback works when configured.
- [ ] Language selection and sync adjustment work.
- [ ] Missing/invalid caption states are honest and clear.

## Android TV
- [ ] TV/Leanback device detection works.
- [ ] First-run TV shows QR and manual code.
- [ ] TV-displayed code can be approved from phone.
- [ ] Phone-generated code can be entered on TV.
- [ ] Pairing expires, is single-use and resists replay.
- [ ] Device can be revoked from phone.
- [ ] TV remote navigation works.
- [ ] Paired TV can play an authorised real stream.

## Design and quality
- [ ] Design system is original and visually consistent.
- [ ] Glass is purposeful and performant, not applied indiscriminately.
- [ ] Transitions and micro-interactions are polished.
- [ ] Low-memory Android behavior is acceptable.
- [ ] Loading, offline, empty and error states are designed.
- [ ] Accessibility and reduced-motion behavior are addressed.

---

# 19. START HERE

Your first response after receiving this document must not be a generic description of what you intend to build.

First confirm whether the user's new GitHub repository is connected. If it is not connected, request that connection and do not create a separate Rork project or start an independent codebase.

Once the repository is connected, begin **Phase 1** and **Phase 2** in the order defined above. Provider verification is an early gate because the player, download manager and subtitle implementation depend on the actual responses.

Do not spend the first milestone producing a large set of static screens. Prove the native React Native foundation and the difficult provider/media paths early. Then build the premium product around real, verified behavior.

The goal is one coherent streaming application that works, not another attractive prototype with a non-functional Play button.
