# Bland2Grand — Web Frontend

React + TypeScript touch UI for the Bland2Grand spice dispenser. Designed as a full-screen mobile-first kiosk app — dark luxury aesthetic, GSAP animations, real-time SSE dispensing progress.

---

## Overview

The frontend is a single-page application that proxies all API calls to the Flask backend. It never communicates directly with the Arduino.

**Tech stack:** React 18 · TypeScript · Vite · Tailwind CSS · GSAP · Font Awesome

---

## Project Structure

```
bland2grand-frontend/
├── src/
│   ├── App.tsx                       # Root component — screen router, idle timer, dispense lifecycle
│   ├── main.tsx                      # React entry point
│   ├── index.css                     # Global styles, CSS variables, utility classes
│   │
│   ├── types/
│   │   └── index.ts                  # All shared types, SSE event union, spice constants
│   │
│   ├── hooks/
│   │   ├── useDebounce.ts            # Generic debounce hook
│   │   └── useDispenseStream.ts      # SSE connection manager + session state reducer
│   │
│   ├── components/
│   │   ├── Header.tsx                # Animated header with back button + screen title
│   │   ├── Bowl.tsx                  # SVG bowl with layered spice grain simulation
│   │   ├── SlotRow.tsx               # Per-spice progress row with animated bar
│   │   └── SpiceCard.tsx             # Recipe card with spice bar and category badge
│   │
│   └── screens/
│       ├── IdleScreen.tsx            # Screensaver — ambient orbs, tap-to-wake, idle timer hook
│       ├── SearchScreen.tsx          # Search bar, featured blends, cuisine grid, AI loading state
│       ├── ResultsScreen.tsx         # Search results list
│       ├── ServingScreen.tsx         # Serving-count picker + spice breakdown
│       ├── DispensingScreen.tsx      # Live bowl fill + slot rows during active session
│       ├── CompleteScreen.tsx        # Post-dispense summary with accuracy indicators
│       ├── CustomRecipeScreen.tsx    # Per-slot amount builder with unit conversion
│       └── lib/
│           └── api.ts                # Typed fetch wrapper for all backend endpoints
│
├── public/
│   └── logo.png                      # App logo (used in header + idle screen)
├── index.html
├── tailwind.config.js
├── vite.config.ts                    # Dev server with /api proxy → localhost:5000
├── postcss.config.js
└── tsconfig.app.json
```

---

## Screen Flow

```
IdleScreen (overlay, z-40)
      │ tap anywhere
      ▼
SearchScreen ──────────────────────────────┐
      │ search / featured / category        │
      ▼                                     │
ResultsScreen                              │
      │ select recipe                       │
      ▼                                     │
ServingScreen ◄──────────────────────────── ┘
      │ dispense                            (custom recipe)
      ▼                          CustomRecipeScreen
DispensingScreen
      │ session_complete / session_error
      ▼
CompleteScreen
      │ "Start a new blend"
      ▼
SearchScreen
```

---

## Setup

### Prerequisites

- Node.js ≥ 18
- Flask backend running on `localhost:5000`

### Install & run

```bash
cd bland2grand-frontend
npm install
npm run dev
```

App available at `http://localhost:5173`. All `/api/*` requests are proxied to Flask.

### Build for production

```bash
npm run build
```

Output goes to `dist/`. Serve with any static file server or nginx.

---

## Key Components

### `Bowl.tsx`

SVG bowl that visualises spice layers in real time. Each slot occupies a proportional band of the bowl depth, rendered with a seeded-random grain texture (particles, chunks, and a wavy powder surface). An animated drip falls from the spout during active dispensing.

### `useDispenseStream.ts`

Manages the SSE lifecycle. Exposes `connect()` (open stream only) and `connectAndDispense()` (open stream → wait for `connected` ack → POST dispense, guaranteeing no events are missed). Session state is a pure reducer over incoming SSE events.

### `IdleScreen.tsx`

Self-contained screensaver. Uses `useIdleTimer` (exported hook, used in `App.tsx`) which tracks user activity and calls `onIdle` after the configured timeout. All GSAP animations guard with an `initiated` ref so they don't re-run on remount.

### `CustomRecipeScreen.tsx`

Lets users build a blend from scratch in grams, teaspoons, or tablespoons. The `UnitPicker` component animates alternative units as "bubbles" that burst outward with a spring, then collapse back when one is selected. Values are converted through gram equivalents on unit change.

---

## Design System

All design tokens are CSS custom properties defined in `index.css` and mirrored in `tailwind.config.js`:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | `#080706` | Page background |
| `--color-card` | `#161411` | Card surfaces |
| `--color-accent` | `#C8692A` | Orange primary |
| `--color-txt` | `#EDE9E0` | Primary text |
| `--color-muted` | `#6A6662` | Secondary text |

**Fonts:** Cormorant (display/headings) · Outfit (body/UI)

**Animations:** All motion via GSAP. No CSS `transition` on anything complex — everything is coordinated timelines with `back.out` and `power3.out` easing.

---

## Spice Slot Reference

| Slot | Spice | Colour |
|------|-------|--------|
| 1 | Cumin | `#8B6914` warm brown |
| 2 | Paprika | `#C94020` deep red |
| 3 | Garlic Powder | `#D4C57A` pale gold |
| 4 | Salt | `#E8EEF2` dark red |
| 5 | Oregano | `#4E7C55` forest green |
| 6 | Onion Powder | `#D4A870` sandy tan |
| 7 | Black Pepper | `#6f009a` deep purple |
| 8 | Cayenne | `#C63B0A` vivid orange-red |
