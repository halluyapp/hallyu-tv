# Hallyu TV

A full-stack streaming web application built with Express, Vite, React, and Tailwind CSS, preserving Hallyu TV's **Obsidian Liquid Glass / Emberlight** aesthetic and live integration with the Zarhosting catalogue and stream API.

## Features

- **Home Showcase & Curated Rails**: Featured HeroStage carousel, quick world chips, Continue Watching, Hot Picks, Trending Now, genre collections, and local Watchlist rail.
- **Explore & Live Search**: Real-time title search with world, genre, and movie/series filters plus paginated browsing.
- **Title Details**: Cast, seasons & episodes, Watchlist bookmarking, expandable synopsis with Web Speech audio synopsis, and progressive MP4 download queueing.
- **Web Video Player**: direct CDN playback with Range-proxy fallback (`/api/proxy/media`), automatic SRT/VTT subtitle loading with timing offset & size controls, quality/speed pickers, Cinema shade, control lock, Picture-in-Picture, keyboard shortcuts, and automatic Next Episode countdown & prefetch.
- **Offline Downloads**: Browser IndexedDB MP4 caching (`Play offline`, `Save MP4`, pause/resume/retry/delete, batch actions) with a Device Storage meter.
- **My Space & Emberlight Audio**: Watchlist and viewing history stored locally (`localStorage`), Display Mode switcher (`Automatic`, `Cinema`, `Compact`), cache clearing, and 6-tone Emberlight UI sound engine (`assets/sounds/*.mp3`).

## Server & Provider Contract

The Express backend (`server.ts`) serves the React frontend and proxies provider API and CDN requests with required headers (`User-Agent`, `Referer`, `Origin`) and HTTP `Range` pass-through:

- `/api/health` — Server health check
- `/api/provider/*` — Zarhosting catalogue, search, detail, stream, and caption metadata proxy
- `/api/proxy/media?url=...` — Range-supporting MP4 streaming and download proxy
- `/api/proxy/caption?url=...` — Subtitle file proxy
- `/api/proxy/image?url=...` — Fallback poster/backdrop proxy

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Express + Vite dev server on port 3000
npm run build        # Build production frontend bundle to dist/
npm start            # Run production Express server
npm run lint         # TypeScript strict typecheck
npm test             # Run Node unit tests (tsx --test tests/web/*.test.ts)
```
