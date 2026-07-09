# Fleet Eval Mode — Personal Blink-Compare Harness

**Date:** 2026-07-08
**Status:** Approved design — ready for implementation plan
**Surface:** `/dashboard/machines`
**Branch context:** builds on the uncommitted Living Radial Fleet experiment (`feat/living-radial-fleet`)

## 1. Context & goal

The machines dashboard now has three fleet interfaces behind a `FleetModeToggle`:
`existing` (cards/table), `synthesis` (Reticle-framed radial dial), and `organism`
(the same dial in Nadieh-Bremer spectacle mode). We want to **evaluate them against
each other** to learn what each interface does well and badly.

This is **not** a population A/B experiment. It is a **personal (N=1) evaluation
harness**: the designer flips between the three interfaces frictionlessly and captures
qualitative observations tagged to each. Statistics, random bucketing, and third-party
analytics are deliberately excluded — the effort goes into *comparison fidelity* and
*note capture* instead.

### Decisions locked during brainstorming
- **Comparison style:** instrumented self-comparison (not a randomized experiment).
- **Compare mechanic:** *blink-compare flip* — full-screen, instant mode switching by
  keyboard, with focus/scroll/selection held constant so **only the rendering changes**.
- **Capture:** *lightweight notes tagged to mode*, stored locally, reviewable per interface.
- **Flip architecture:** **keep-alive** — all three interfaces mounted at once, shown via
  CSS visibility, enabling a 0 ms flip and **hold-to-peek**.
- **Accepted defaults:** keybindings as proposed below; notes panel docked right; the
  optional 👍/👎 sentiment flag is kept (light, one-click, non-blocking).

## 2. Non-goals (out of scope now; seams left for later)
- Multi-user variant assignment / random bucketing.
- Statistical significance / experiment readout.
- Third-party analytics (PostHog, etc.) or server-side event capture.
- Server-side (Supabase) note persistence — the notes store interface is built so this
  is a later drop-in, but v1 is localStorage only.

## 3. Architecture

### 3.1 Gating — invisible until invoked
Eval mode is a personal tool and must not alter the shipped experience.
- Enabled by `?eval=1` on `/dashboard/machines`. It is **sticky**: on first activation it
  persists `am-fleet-eval=1` to localStorage so the param isn't needed on later visits.
  `?eval=0` clears the flag.
- Resolution runs **client-side only** (in `useEffect`) and defaults **off** on first
  paint to avoid hydration mismatch.
- When **off**: `MachinesPanel` renders exactly as today — the normal 3-way toggle, a
  single active variant. **Zero behavior change** for any other operator.
- When **on**: the keep-alive harness, hotkeys, HUD, and notes panel activate. Works in
  production against a real fleet; no server flag required.

### 3.2 Keep-alive stage
A new `EvalHarness` client component owns the compare stage:
- Mounts **all three interfaces simultaneously**, stacked with absolute positioning.
- Shows exactly one via `visibility: visible/hidden` (**not** `display:none`) so hidden
  panes keep their layout, scroll position, and element measurement (`ResizeObserver`
  keeps working; the dial doesn't re-measure on flip).
- Shown variant = `peekMode ?? mode`.
- Passes `active={isShown}` to each pane so hidden panes pause expensive work.
- Three panes, each a separate instance (so cycling all three — including the organism
  canvas — is truly 0 ms):
  - `ExistingVariant` — the current cards/table + `ViewToggle` block, extracted intact
    from `MachinesPanel` (preserves its own scroll).
  - `DialVariant mode="synthesis"` and `DialVariant mode="organism"` — thin wrappers over
    `FleetDial`.

### 3.3 Shared inputs (fair comparison by construction)
All three panes consume the **same** props from `MachinesPanel`:
`machines` (the `visible` array), `activeMachineId`, and `focusedId` + `onSelect`
(the existing `?focus` URL state). Selection therefore stays identical across a flip —
you compare the same fleet state, not three different states. `am-fleet-mode` remains the
single source of truth for the current mode, shared between eval and non-eval paths so the
mouse toggle and the keyboard stay in sync.

### 3.4 Interaction (default keybindings — rebindable)

| Key | Action |
|-----|--------|
| `` ` `` (backtick) | Cycle forward: existing → synthesis → organism → existing |
| Shift + `` ` `` | Cycle backward |
| `1` / `2` / `3` | Jump directly to existing / synthesis / organism |
| **Hold** `Space` | Peek the variant you were *just* on; release snaps back (before/after move) |
| `n` | Focus the note input, pre-tagged with the current mode |
| `Esc` | Blur the note input |

- **Hold-to-peek fallback:** the "previously-shown" variant is tracked as you switch. On a
  fresh load with no prior variant yet, `Space` peeks the *next* mode in the cycle instead,
  so the key always does something sensible.
- All keys are **suppressed while focus is in an interactive control**
  (`input` / `textarea` / `contenteditable` / `button` / `[role=button]`), so typing a note
  never triggers a flip and `Space` never both activates a focused button and peeks.
- The key listener is scoped to when `EvalHarness` is mounted, and avoids `Ctrl`/`Cmd`
  combos so browser shortcuts are untouched.

### 3.5 HUD indicator
A small chip in a corner of the stage always shows the current mode plus a one-line
shortcut hint. During a peek it reads `PEEK: <mode>` so orientation is never lost. The
existing `FleetModeToggle` continues to render and drives the same `mode`, so mouse and
keyboard are interchangeable.

### 3.6 Notes — model & store
```ts
type EvalNote = {
  id: string;          // crypto.randomUUID()
  mode: FleetMode;     // 'existing' | 'synthesis' | 'organism'
  text: string;
  createdAt: number;   // Date.now()
  sentiment?: '+' | '-'; // optional one-click 👍 / 👎
};
```
- Store behind a small interface: `listNotes()`, `addNote(mode, text)`,
  `setSentiment(id, s)`, `deleteNote(id)`, `clearNotes()`, `subscribe(cb)`.
- v1 backing: localStorage key `am-fleet-eval-notes` (JSON array), with cross-tab sync via
  the `storage` event. Malformed/absent JSON recovers to an empty list; a full/unavailable
  localStorage degrades to an in-memory fallback without throwing.
- The interface is the seam for a future Supabase-backed impl (out of scope now).

### 3.7 Notes panel
`EvalNotesPanel` — slim, collapsible, docked **right**:
- Note input at the top, pre-tagged with the current mode.
- Notes **grouped by mode** (existing / synthesis / organism) — the "what's working / what's
  not per interface" board. Each note shows text, relative time, its 👍/👎 flag, and a delete.
- **Copy-as-Markdown** button exports the grouped notes for pasting into a doc or PR.

### 3.8 The one touch into existing dial code
`FleetDial` gains an optional `active?: boolean` (**default `true`**, fully
backward-compatible):
- Threaded to `DialCanvasBloom`, whose RAF loop runs only when
  `active && document.visible && !reducedMotion`; when inactive it stops the loop (paints a
  single static frame at most).
- The live-load poll gate generalizes from `mode !== 'existing'` to "the shown mode is a
  radial mode" (i.e. driven by the harness's shown pane).

## 4. File inventory

### New — pure logic (`web/lib/fleet/eval/`)
- `types.ts` — `EvalNote`, re-export of `FleetMode`, and the ordered mode list.
- `keys.ts` (+ `keys.test.ts`) — pure `cycleMode(mode, dir)` / next-prev helpers and the
  key→action mapping (no DOM).
- `notes-store.ts` (+ `notes-store.test.ts`) — localStorage-backed store behind the interface.
- `use-eval-notes.ts` — React hook wrapping the store (state + cross-tab sync).
- `use-eval-mode.ts` (+ `use-eval-mode.test.ts`) — resolves the `?eval` / localStorage gate.

### New — components (`web/components/dashboard/fleet-eval/`)
- `EvalHarness.tsx` — keep-alive stage, hotkey handling, peek state, HUD host.
- `EvalNotesPanel.tsx` — the grouped notes board + export.
- `ModeHud.tsx` — the current-mode / peek indicator chip.
- `ExistingVariant.tsx` — extracted cards/table + `ViewToggle` block.
- `DialVariant.tsx` — thin `FleetDial` wrapper carrying `active`.

### Modified
- `web/components/dashboard/MachinesPanel.tsx` — extract the variants; branch on `evalMode`
  (off → today's behavior; on → render `EvalHarness`).
- `web/components/dashboard/fleet-dial/FleetDial.tsx` — add `active?` prop; thread to canvas;
  generalize the live-load gate.
- `web/components/dashboard/fleet-dial/DialCanvasBloom.tsx` — honor `active` to pause RAF.

## 5. Data flow
```
?eval / localStorage ──▶ useEvalMode ──▶ MachinesPanel
                                           │ (evalMode ? EvalHarness : today's single-variant)
machines (visible), activeMachineId,       │
focusedId, onSelect  ──────────────────────┤
                                           ▼
                                     EvalHarness
             ┌──────────────┬──────────────┴───────────────┐
        ExistingVariant   DialVariant(synthesis)   DialVariant(organism)
             (active?)          (active?)                 (active?)
                                           │
                          keys.ts (cycle/peek) ─▶ mode / peekMode ─▶ which pane is visible
                                           │
                          ModeHud (shows mode / PEEK)
                                           │
   n / input ─▶ useEvalNotes ─▶ notes-store (localStorage) ─▶ EvalNotesPanel (grouped by mode)
```

## 6. Edge cases & error handling
- **Empty fleet:** all three variants already render an empty state; blink-compare still works.
- **localStorage unavailable/full:** notes store falls back to in-memory; eval-mode flag read
  is wrapped in try/catch.
- **SSR/hydration:** `EvalHarness` is client-only (as `FleetDial` already is); eval-mode reads
  happen in `useEffect`, default off on first paint.
- **Reduced motion:** flips/peeks are instant swaps (no transition); the canvas already respects
  `prefers-reduced-motion`.
- **Hotkey safety:** suppressed while typing; scoped to harness lifetime; no `Ctrl`/`Cmd` hijack.

## 7. Testing strategy
- **Unit (vitest, matching existing `lib/fleet` style):**
  - `keys.test.ts` — cycle forward/back wraparound; direct-jump mapping.
  - `notes-store.test.ts` — add/list/delete/clear/setSentiment; malformed-JSON recovery;
    cross-tab merge; in-memory fallback when storage throws.
  - `use-eval-mode.test.ts` — param on/off/sticky resolution precedence.
- **Component:** if React Testing Library is set up, a light test that keypresses flip the
  visible pane and are suppressed while the note input is focused. If RTL is not configured,
  fall back to logic tests + a manual verify pass (documented in the plan).
- **Manual verify:** dev server → flip through all three → hold-to-peek → add/delete notes →
  reload (persistence) → `?eval=0` confirms the normal app is unaffected.

## 8. Future-proofing seams (built, not used)
- `notes-store` interface → swap localStorage for Supabase to persist/share notes.
- `useEvalMode` gate + shared `mode` state → swap self-select for server-assigned bucketing
  to graduate into a real multi-user experiment, without touching the render layer.
