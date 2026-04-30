# Arasaka Nexus — Design System

> "Knowledge Vault // Direct Stream from the Grid"

A diegetic, Cyberpunk-2077-inspired design system for **Arasaka Nexus**, a manga library + reader. The brief: when a user opens the app, they should feel like they are logging into a corporate Arasaka terminal in Night City — holographic UIs, subtle glitch, monospace + aggressive display fonts, bracket corners, HUD overlays, narrative loading text (`DECRYPTING…`, `ACCESSING NEXUS…`, `KIROSHI OPTICS ONLINE`).

Arasaka red `#dc2626` is canon. Neon accents (yellow / magenta / cyan) are encouraged but kept on a leash — neon is accent, never wallpaper.

---

## Sources

| Source | Where |
|---|---|
| Codebase | `LuizPitohui/arasaka-nexus` (GitHub, branch `master`) — full Next.js 16 frontend + Django backend |
| Brief / direction | The Night City brief in this project's intro message |

The current frontend is a working skeleton in cyberpunk-flavored Tailwind v4 — black backgrounds, a single Arasaka red accent, Inter for body, no display or mono font yet. This system is the **target state**: keeps everything functional but pushes the visual language to a true diegetic terminal.

---

## Index — Files in this design system

| File | What's in it |
|---|---|
| `README.md` | This document — context, content fundamentals, visual foundations, iconography |
| `SKILL.md` | Front-matter skill manifest for Claude Code reuse |
| `colors_and_type.css` | All CSS variables + semantic class tokens. Drop-in stylesheet |
| `assets/` | Logos, scanline texture, brand SVGs |
| `fonts/` | (External — loaded via Google Fonts CDN; see CSS) |
| `preview/` | Standalone HTML cards rendered into the Design System tab (colors, type, components) |
| `ui_kits/web/` | High-fidelity Next.js-style screens: login, home, manga detail, reader |

---

## CONTENT FUNDAMENTALS

The voice of Arasaka Nexus is **diegetic corporate-cyberpunk**. The app pretends to be a piece of in-world hardware — a Kiroshi-grade terminal — and copy is written from inside that fiction. Two registers coexist:

1. **System voice** (UI chrome, loaders, errors, empty states) — terse, all-caps, terminal-coded English. Like a Unix shell with attitude.
2. **Operator voice** (body text, microcopy, in-product Portuguese — the codebase is pt-BR) — friendly but clipped, addresses the user as `agent`.

### Tone & casing rules

- **System messages**: `UPPERCASE`, monospace, ends in ellipsis when active, period or `[OK]` when done. Examples (lifted from the codebase):
  - `Sincronizando Banco de Dados Global...`
  - `CARREGANDO STREAM...`
  - `ACCESS DENIED: Invalid Credentials`
  - `SYSTEM ERROR (500)`
  - Coined here: `DECRYPTING…`, `ACCESSING NEXUS…`, `KIROSHI OPTICS ONLINE`, `ROLLING DICE…`, `ENGAGING NEUROLINK…`, `STREAM LOCKED`, `HANDSHAKE COMPLETE`
- **Section labels & button text**: `UPPERCASE` with wide letter-spacing (`tracking-[0.3em]` in the codebase — keep this). Short. Verb-first when actionable.
  - `AUTHENTICATE`, `ENGAGE`, `JACK IN`, `PURGE`, `INITIATE STREAM`
- **Body copy**: sentence case, Portuguese (pt-BR is canonical), warm-clipped. Mix in 1 piece of in-fiction terminology per paragraph max.
- **Person**: address the user as `agent` (or `Agent`, in capitalized salutations). Never `you/seu`. Examples from the codebase: `Welcome, Agent.`, `New Agent Registration`, `Agent ID`, `Passcode`.
- **Numbers & data**: monospace, no thousand separators in tech contexts (`240 req/min`), pt-BR thousand separators in user-facing counts (`1.234 resultado(s)`).
- **No emoji.** None. The codebase uses `⚠️` exactly once and even that is a smell. Use a Lucide icon or an ASCII glyph (`›`, `▸`, `■`, `[!]`).
- **Brackets and arrows are emoji's job.** `[ NEXUS ]`, `// COMMENT`, `> prompt`, `▶ Continuar`, `← Anterior`, `Próxima →`, `▸ ENGAGE`.
- **Don't be cute.** No `Oops!`, no `Great choice!`, no `Welcome aboard 🎉`. The Nexus is a terminal that grants access; it is not glad to see you.

### Concrete copy patterns

| Surface | Pattern | Example (from codebase) |
|---|---|---|
| Loading screen | `<VERB>ING <DOMAIN>...` | `Sincronizando Banco de Dados Global...` |
| Auth success | `<STATE>. <Vocative>.` | `Access Granted. Welcome, Agent.` |
| Auth fail | `<HARSH STATE>: <reason>` | `ACCESS DENIED: Invalid Credentials` |
| Error toast | terse pt-BR sentence | `Falha ao atualizar favoritos.` |
| Empty state | terse pt-BR statement + system tag | `Nenhum capítulo sincronizado ainda. O sistema está buscando...` |
| Disclaimer | sub-tiny, ALL CAPS, ominous | `Unauthorized access is a felony punishable by data erasure.` |
| Section kicker | `[PROTOCOL] / [STREAM] / [VAULT]` | `Recomendados pela Arasaka` (operator) above `[ STREAM 01 ]` (system kicker) |

### Vibe checklist

- Sounds like firmware? ✅
- Could it be from a Cyberpunk 2077 menu? ✅
- Treats the user like a paid agent of a megacorp? ✅
- Free of marketing fluff? ✅
- No emoji? ✅

---

## VISUAL FOUNDATIONS

### Colors

A near-black canvas with **one** primary accent (Arasaka red) and a small palette of neon supports used surgically.

- **Backgrounds**: layered blacks. `--bg-void` `#000000` for the page floor, `--bg-deck` `#0a0a0a` for cards and panels, `--bg-terminal` `#0f0f12` for elevated surfaces. Never lighter than `#16161a`.
- **Foreground**: `--fg-primary` `#f4f4f5` (zinc-100) for body, `--fg-secondary` `#a1a1aa` (zinc-400) for labels, `--fg-muted` `#52525b` (zinc-600) for hints. Never pure white — it's harsh against the void.
- **Arasaka red** `#dc2626` is the brand. It signals identity (logo accent), primary action, danger, and active state — all overloaded intentionally. Hover shifts to `#ef4444` (red-500). Glow uses `rgba(220, 38, 38, 0.35)` outer + `rgba(239, 68, 68, 0.15)` mid.
- **Neon supports** — used sparingly as semantic accents:
  - `--neon-cyan` `#22d3ee` — info, "in-stream", braindance overlays
  - `--neon-yellow` `#facc15` — warnings, secondary CTAs, scan lines
  - `--neon-magenta` `#e11d74` — secondary highlights, edgerunner mode
  - `--neon-green` `#16a34a` — success, "Continue Reading", connection-OK
- **Borders**: `--border-faint` `#27272a` (zinc-800) for resting, `--border-mid` `#3f3f46` (zinc-700) for hover, `--border-accent` red on focus/active.

WCAG AA on body type is met by `#a1a1aa` on `#0a0a0a` (≈8.4:1). Don't put `#52525b` on body text — that's hint-only.

### Typography

Three families do all the work.

- **Display — Rajdhani** (700/600). Wide, slightly squared, militaristic. Use for `<h1>`, hero titles, `ARASAKA NEXUS` lockup. Loaded via Google Fonts.
- **Mono — JetBrains Mono** (400/500/700). Used for *every* UI label, kicker, button text, system message, error, code, page counter. Tight, readable, strong zero. Loaded via Google Fonts.
- **Body — Inter** (400/500). Already used in the codebase. Stays for paragraphs, descriptions, chapter titles.

Sizing scale (rem-based, 16px root):

| Token | px | Use |
|---|---|---|
| `--fs-3xs` | 10 | Hyper-tiny meta (`[10px]` already in code) |
| `--fs-2xs` | 11 | Kickers, labels |
| `--fs-xs` | 12 | Buttons, captions |
| `--fs-sm` | 14 | Body small |
| `--fs-base` | 16 | Body |
| `--fs-lg` | 20 | Subheads |
| `--fs-xl` | 28 | h3 |
| `--fs-2xl` | 36 | h2 |
| `--fs-3xl` | 48 | h1 |
| `--fs-display` | 72 | Hero lockup |

Tracking: mono labels get `0.2em–0.3em`. Display titles get `-0.04em`. Body is default.

### Spacing & radii

8px grid: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96`. Variables `--sp-1`…`--sp-9`.

**Radii** — almost zero. Cyberpunk = sharp corners.
- `--r-0` `0` (default)
- `--r-1` `2px` (chips, scrollbar thumb — already in codebase)
- `--r-2` `4px` (max for cards)
- Never round above 4. Never rounded-full except avatars.

### Borders, shadows, glow

Borders are the dominant boundary device. Cards use `1px` borders, never shadows alone.

Shadow system is **glow**, not soft-drop:
- `--glow-red`: `0 0 24px rgba(220,38,38,0.25), 0 0 4px rgba(220,38,38,0.5)`
- `--glow-red-strong`: `0 0 48px rgba(220,38,38,0.45), 0 0 8px rgba(239,68,68,0.7)`
- `--glow-cyan`: `0 0 24px rgba(34,211,238,0.25)`
- `--shadow-deck`: `0 16px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset`

### Backgrounds & motifs

The base background is **flat black**. Texture is layered on top conditionally:

- **Scanlines** — repeating 2px gradient at 4% opacity, applied via `::before` pseudo-element on hero sections. Toggle with prefers-reduced-motion.
- **Grid** — 24px × 24px faint dotted/lined grid, 6% opacity, used on auth screens and the reader's idle state.
- **Hex / circuitry** — SVG pattern in `assets/`. Used as background on the `/profile` page (cyberware vibe).
- **Glitch text** — clipped `::before/::after` layered text with `clip-path` rectangles, animated 6s. Apply only to display-size `<h1>` on auth and the 404.
- **Bracket corners** — four 16px L-shaped marks at the corners of focused inputs and the active manga card. Pure CSS pseudo-elements.
- **Chromatic aberration on hover** — `text-shadow: -1px 0 var(--neon-cyan), 1px 0 var(--neon-magenta)` activated on `:hover` of links. Subtle, 80ms transition.
- **Protection gradients** — top→bottom `from-black to-transparent` over hero images (already in codebase). Always include — never lay text on a raw cover.

### Imagery treatment

Manga covers run at `opacity: 0.85` resting and `opacity: 1` on hover (codebase pattern, kept). Featured covers in carousels get `scale(1.05)` on hover. Cover detail pages use a **blurred + dimmed copy of the cover** as a backdrop (`blur-xl`, `opacity-30`) under a `to-black` protection gradient — already implemented.

Tone of imagery: cool, neon-graded, never warm-and-cozy. If a cover is too warm, dim it more aggressively.

### Motion

Defaults are fast and snappy.
- Hover transitions: `120ms` color, `200ms` border, `500ms` image scale.
- Page-to-page transitions in the paged reader: 80ms RGB-split flash + 120ms slide.
- Loaders: monospace text + thin spinner OR ASCII progress bar. Never spinners alone.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo) for entrances; `cubic-bezier(0.4, 0, 0.2, 1)` for everyday.
- **Glitch keyframes**: 6s loop, ~85% of the loop is "rest", 15% is the visible jitter. Don't loop continuously — burst.
- Respect `prefers-reduced-motion`: kill scanlines, glitches, chromatic aberration. Keep the spinner.

### Hover, focus, press

- **Link hover**: text shifts from `--fg-secondary` to `--fg-primary` + chromatic aberration text-shadow.
- **Button hover** (primary red): bg `#dc2626` → `#ef4444`, gain a 1px outer red glow.
- **Button hover** (ghost/border): border `zinc-800` → red, text `zinc-400` → red.
- **Card hover**: 1px border faint → red, image opacity 0.85 → 1, optional `translateY(-4px)`.
- **Focus**: red outline 2px, offset 2px. Never use the browser default. Always visible.
- **Press**: scale `0.98` + brightness `0.85`. 60ms. Buttons only — not cards.
- **Disabled**: `opacity: 0.3`, `cursor: not-allowed`, no hover state at all.

### Layout rules

- App is **viewport-anchored** with `max-w-7xl` (1280px) for primary content lanes, but hero sections and the reader go full bleed.
- The header is `sticky`, blurred (`backdrop-blur-md`), 95% opaque black. Hidden on `/login`, `/register`, `/read/*`.
- Reader-mode paged transitions are **edge-to-edge**; everything else respects the 24px gutter.
- Mobile first: 375px is the design floor. Sidebar filters in `/browse` collapse to a top sheet under 768px.
- Use **CSS grid** for the manga grid (codebase pattern: `grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6`). Carousels use horizontal flex + snap.

### Cards

Cards = 1px border (`zinc-800`), background `--bg-deck`, no radius (or `--r-2` max). Internal padding `16px`, hover lifts 1px border to red and slides up 4px. No drop shadow at rest; hover may earn a faint red glow.

### Transparency, blur

Used **only** on overlays:
- Header chrome: `bg-black/95 backdrop-blur-md`
- Settings panel in reader: `bg-zinc-950` (no blur, opaque — readable in motion)
- Dim-overlays on hero images: `from-black to-transparent` gradient
- Modal backdrops: `bg-black/80 backdrop-blur-sm`

Don't use translucent backgrounds for resting UI. They look like SaaS.

### Don'ts

- ❌ Soft drop shadows (`shadow-lg` blue-glow). Replace with thin border + optional red glow.
- ❌ Rounded-2xl cards. Max 4px radius.
- ❌ Pastel gradients. Acceptable: solid black ↔ red ↔ cyan, never with peachy in-betweens.
- ❌ Material Design ripple. Use scale-press.
- ❌ Emojis as iconography (see ICONOGRAPHY).
- ❌ Inter for buttons or labels — that's mono territory.

---

## ICONOGRAPHY

The codebase uses **`lucide-react`** exclusively (`lucide` icons across login, home, header, reader, browse). This system inherits that choice — and the underlying icon system is the **Lucide icon font/SVG library**, loaded via CDN at runtime.

### Style rules

- Stroke width: **1.5** (Lucide default is 2 — thin it down for cyberpunk feel).
- Sizes: `12, 14, 16, 20, 24` only. Kicker icons use `14`. Buttons use `16`. Headers use `20`.
- Color: inherit `currentColor`. Never solid-fill.
- Pair with monospace text labels — icon + label is the standard arrangement, not icon-only buttons (except for header chrome and reader controls).

### Icons used in the current product (lifted from the codebase)

`ArrowLeft`, `BookOpen`, `Heart`, `Clock`, `Flame`, `Library`, `LogIn`, `LogOut`, `Shuffle`, `Tag`, `User`, `PlayCircle`, `Search`, `Settings`, `Maximize2`, `Minimize2`, `Home`, `ChevronLeft`, `ChevronRight`, `Loader2`, `Filter`, `X`.

### Substitution flag

🔻 **Substitution**: This system uses Lucide via the **`lucide` CDN** (`https://unpkg.com/lucide@latest`) for previews. In production, keep `lucide-react` (already in `package.json`). No icons were redrawn; nothing was substituted.

### Custom glyphs (system, not Lucide)

In addition to Lucide, the visual language uses a small **typographic** icon set:

- `[ ]` — corner brackets (decorative, on focused inputs and active selections)
- `▸` `▶` — chevron play (mono character, used in `▶ Continuar`)
- `//` — line comment (used as kicker prefix: `// PROTOCOL_07`)
- `›` — right-arrow chevron (mono character, used in breadcrumbs)
- `■ □` — filled / empty square (status indicators in tables)

These are **typographic**, not graphic. They render with `JetBrains Mono` and inherit `color` and `font-size`. Never substitute with PNG or SVG.

### No emoji

Repeated for emphasis — emoji is forbidden. The codebase contains exactly one (`⚠️` on the login error). Replace with `[!]` or a Lucide `AlertTriangle`.

### Logos

`assets/arasaka-mark.svg` — The Arasaka **Chevron** mark — a doubled chevron over a baseline, with a broken crossbar, central rivet and a faint cyan glitch-echo behind. Geometric, no letters. Use as favicon, splash mark, and as a watermark in the reader.
`assets/nexus-lockup.svg` — `ARASAKA NEXUS` wordmark in Rajdhani 700, with the `NEXUS` glyph in red. Use in the header and login page.
`assets/scanline.svg` — A 2px repeating scanline texture, ready to tile.

---

## Index of UI Kits

| Kit | Path | Description |
|---|---|---|
| Web (Next.js, the only product) | `ui_kits/web/index.html` | Login, Home, Manga detail, Reader — high-fidelity click-thrus rebuilt against this system |
