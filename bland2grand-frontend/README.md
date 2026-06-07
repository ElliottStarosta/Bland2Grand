# Bland2Grand frontend

Touch-first kiosk UI for the spice dispenser. Dark theme, GSAP transitions, live bowl fill during dispense.

Stack: React 18, TypeScript, Vite, Tailwind, GSAP.

The app only talks to Flask (`/api/*`). Vite proxies those calls to `localhost:5000` in dev.

## Screen flow

```
IdleScreen (tap anywhere to wake)
    ↓
SearchScreen ──→ ResultsScreen ──→ ServingScreen ──→ DispensingScreen ──→ CompleteScreen
    │                                      ↑
    └── CustomRecipeScreen ────────────────┘
```

`App.tsx` owns routing, the 60s idle timer, and dispense lifecycle (`useDispenseStream`).

## Project layout

```
src/
├── App.tsx                 Screen router + idle overlay
├── main.tsx                React mount
├── index.css               Design tokens + global styles
├── types/index.ts          Recipe types, SSE event union
├── slotConfig.ts           Generated spice labels/colors (don't hand-edit)
├── hooks/
│   ├── useDispenseStream.ts   SSE session state
│   ├── useDebounce.ts
│   └── slotAudio.ts           Voice lines per slot
├── components/
│   ├── Header.tsx
│   ├── Bowl.tsx            SVG bowl + spice layers
│   ├── SlotRow.tsx         Per-spice progress bar
│   └── SpiceCard.tsx
└── screens/
    ├── IdleScreen.tsx      Screensaver + useIdleTimer export
    ├── SearchScreen.tsx
    ├── ResultsScreen.tsx
    ├── ServingScreen.tsx
    ├── DispensingScreen.tsx
    ├── CompleteScreen.tsx
    ├── CustomRecipeScreen.tsx
    └── lib/api.ts          Typed fetch helpers
```

## Run locally

Needs Flask on port 5000.

```bash
cd bland2grand-frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # output in dist/
```

## Notable bits

**Bowl.tsx** — Each spice gets a band in the SVG bowl. Grain texture is procedural (seeded random). Drip animation runs while a slot is actively dispensing.

**useDispenseStream.ts** — `connectAndDispense()` opens SSE, waits for `connected`, then POSTs dispense so early events aren't dropped. Session state is a reducer over SSE payloads.

**IdleScreen.tsx** — Full-screen overlay at z-40. `useIdleTimer(timeout, onIdle)` resets via `wakeUp()` when the user taps. GSAP timelines use an `initiated` ref so remounting doesn't replay entrance animations.

**CustomRecipeScreen.tsx** — Build a blend in g, tsp, or tbsp. Unit picker bubbles animate out with GSAP; values convert through gram equivalents.

## Design tokens

Defined in `index.css` and mirrored in `tailwind.config.js`:

| Token | Value | Use |
|-------|-------|-----|
| `--color-bg` | `#080706` | Page background |
| `--color-card` | `#161411` | Cards |
| `--color-accent` | `#C8692A` | Primary orange |
| `--color-txt` | `#EDE9E0` | Body text |
| `--color-muted` | `#6A6662` | Secondary text |

Fonts: **Cormorant** (headings), **Outfit** (UI).

## Spice colors (UI)

| Slot | Spice | Color |
|------|-------|-------|
| 1 | Cumin | `#8B6914` |
| 2 | Paprika | `#C94020` |
| 3 | Garlic Powder | `#D4C57A` |
| 4 | Salt | `#E8EEF2` |
| 5 | Oregano | `#4E7C55` |
| 6 | Onion Powder | `#D4A870` |
| 7 | Black Pepper | `#6f009a` |
| 8 | Cayenne | `#C63B0A` |

See root `spice_slots.json` + `generate_slots.py` for the single source of truth.
