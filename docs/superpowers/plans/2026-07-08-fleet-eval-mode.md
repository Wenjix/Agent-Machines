# Fleet Eval Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a personal (N=1) blink-compare harness to `/dashboard/machines` that flips instantly between the three fleet interfaces (existing / synthesis / organism) and captures mode-tagged observations, without changing the shipped experience.

**Architecture:** A localStorage/URL gate (`?eval=1`) activates an `EvalHarness` that keep-alive-mounts all three interfaces and shows one via CSS visibility (0 ms flip, hold-to-peek). Pure logic (mode cycling, notes store, eval-flag resolver, markdown export) lives DOM-free under `lib/fleet/eval/` and is unit-tested; React components are verified by typecheck + manual pass. The only touch into existing code is an `active?` prop on the dial to pause its canvas when hidden, plus a gated branch in `MachinesPanel`.

**Tech Stack:** Next.js (App Router, React 19, `"use client"`), TypeScript (strict), Tailwind with `--ret-*` design tokens, Vitest 3 (node environment).

## Global Constraints

- Indentation is **TABS**, not spaces. Match the surrounding file exactly.
- Module imports use the `@/` alias (resolves to `web/`).
- **No new dependencies.** Use Web/Node built-ins (`crypto.randomUUID`, `Date.now`, `navigator.clipboard`).
- Unit tests live under `web/lib/**/*.test.ts` (the Vitest `include` glob). Test environment is **node** — **no DOM, no localStorage, no React Testing Library**. Any code that is unit-tested must accept injected fakes rather than touch `window`/`localStorage`/`document` directly.
- Colors use `--ret-*` CSS variables, never raw hex, in components.
- The dial's `active?` prop **defaults to `true`** so every existing call site is unchanged.
- The non-eval (shipped) render path in `MachinesPanel` must remain behaviorally identical.
- All commands run from `web/` unless noted. Typecheck with `npx tsc --noEmit` (fast, no side effects); the canonical script is `npm run typecheck`. Run tests with `npx vitest run <path>`.
- `FleetMode = "existing" | "synthesis" | "organism"` is owned by `@/components/dashboard/fleet-dial/FleetModeToggle`. Import the **type** from there; do not redefine it.

---

### Task 1: Eval types + mode cycling / key mapping

**Files:**
- Create: `web/lib/fleet/eval/types.ts`
- Create: `web/lib/fleet/eval/keys.ts`
- Test: `web/lib/fleet/eval/keys.test.ts`

**Interfaces:**
- Consumes: `FleetMode` (type only) from `@/components/dashboard/fleet-dial/FleetModeToggle`.
- Produces:
  - `types.ts`: `type FleetMode` (re-export), `type NoteSentiment = "+" | "-"`, `type EvalNote = { id: string; mode: FleetMode; text: string; createdAt: number; sentiment?: NoteSentiment }`, `const EVAL_MODES: ReadonlyArray<FleetMode>`.
  - `keys.ts`: `cycleMode(mode: FleetMode, dir: 1 | -1): FleetMode`, `type EvalAction`, `keyToAction(key: string, opts: { shift: boolean }): EvalAction | null`, `keyUpToAction(key: string): EvalAction | null`.

- [ ] **Step 1: Create `types.ts`**

```ts
import type { FleetMode } from "@/components/dashboard/fleet-dial/FleetModeToggle";

export type { FleetMode };

export type NoteSentiment = "+" | "-";

export type EvalNote = {
	id: string;
	mode: FleetMode;
	text: string;
	createdAt: number;
	sentiment?: NoteSentiment;
};

/** Canonical flip order. MUST match FLEET_MODES in FleetModeToggle. */
export const EVAL_MODES: ReadonlyArray<FleetMode> = ["existing", "synthesis", "organism"];
```

- [ ] **Step 2: Write the failing test `keys.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { cycleMode, keyToAction, keyUpToAction } from "./keys";

describe("cycleMode", () => {
	it("cycles forward with wraparound", () => {
		expect(cycleMode("existing", 1)).toBe("synthesis");
		expect(cycleMode("synthesis", 1)).toBe("organism");
		expect(cycleMode("organism", 1)).toBe("existing");
	});

	it("cycles backward with wraparound", () => {
		expect(cycleMode("existing", -1)).toBe("organism");
		expect(cycleMode("organism", -1)).toBe("synthesis");
	});
});

describe("keyToAction", () => {
	it("maps backtick to forward/back cycle by shift", () => {
		expect(keyToAction("`", { shift: false })).toEqual({ type: "cycle", dir: 1 });
		expect(keyToAction("`", { shift: true })).toEqual({ type: "cycle", dir: -1 });
	});

	it("maps digits to direct jumps", () => {
		expect(keyToAction("1", { shift: false })).toEqual({ type: "jump", mode: "existing" });
		expect(keyToAction("2", { shift: false })).toEqual({ type: "jump", mode: "synthesis" });
		expect(keyToAction("3", { shift: false })).toEqual({ type: "jump", mode: "organism" });
	});

	it("maps space to peek start and n to focus note", () => {
		expect(keyToAction(" ", { shift: false })).toEqual({ type: "peekStart" });
		expect(keyToAction("n", { shift: false })).toEqual({ type: "focusNote" });
	});

	it("returns null for unmapped keys", () => {
		expect(keyToAction("x", { shift: false })).toBeNull();
		expect(keyToAction("4", { shift: false })).toBeNull();
	});
});

describe("keyUpToAction", () => {
	it("maps space release to peek end", () => {
		expect(keyUpToAction(" ")).toEqual({ type: "peekEnd" });
	});

	it("returns null for other keys", () => {
		expect(keyUpToAction("`")).toBeNull();
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/fleet/eval/keys.test.ts`
Expected: FAIL — cannot resolve `./keys`.

- [ ] **Step 4: Create `keys.ts`**

```ts
import { EVAL_MODES, type FleetMode } from "./types";

export function cycleMode(mode: FleetMode, dir: 1 | -1): FleetMode {
	const n = EVAL_MODES.length;
	const i = EVAL_MODES.indexOf(mode);
	const j = (((i + dir) % n) + n) % n;
	return EVAL_MODES[j];
}

export type EvalAction =
	| { type: "cycle"; dir: 1 | -1 }
	| { type: "jump"; mode: FleetMode }
	| { type: "peekStart" }
	| { type: "peekEnd" }
	| { type: "focusNote" };

/** Maps a keydown to a harness action, or null if the key is not a shortcut. */
export function keyToAction(key: string, opts: { shift: boolean }): EvalAction | null {
	if (key === "`") return { type: "cycle", dir: opts.shift ? -1 : 1 };
	if (key === "1") return { type: "jump", mode: "existing" };
	if (key === "2") return { type: "jump", mode: "synthesis" };
	if (key === "3") return { type: "jump", mode: "organism" };
	if (key === " ") return { type: "peekStart" };
	if (key === "n" || key === "N") return { type: "focusNote" };
	return null;
}

/** Maps a keyup to an action (only Space-release ends a peek). */
export function keyUpToAction(key: string): EvalAction | null {
	if (key === " ") return { type: "peekEnd" };
	return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/fleet/eval/keys.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 6: Commit**

```bash
git add web/lib/fleet/eval/types.ts web/lib/fleet/eval/keys.ts web/lib/fleet/eval/keys.test.ts
git commit -m "feat(eval): mode cycling + keyboard action mapping for fleet eval harness"
```

---

### Task 2: Notes store (localStorage-backed, DOM-free)

**Files:**
- Create: `web/lib/fleet/eval/notes-store.ts`
- Test: `web/lib/fleet/eval/notes-store.test.ts`

**Interfaces:**
- Consumes: `EvalNote`, `FleetMode`, `NoteSentiment` from `./types`.
- Produces:
  - `const NOTES_STORAGE_KEY = "am-fleet-eval-notes"`.
  - `type StorageLike = Pick<Storage, "getItem" | "setItem">`.
  - `type NotesStore = { list(): EvalNote[]; add(mode, text): EvalNote[]; setSentiment(id, sentiment): EvalNote[]; remove(id): EvalNote[]; clear(): EvalNote[]; reload(): EvalNote[] }`.
  - `createNotesStore(opts?: { storage?: StorageLike | null; makeId?: () => string; now?: () => number }): NotesStore`.

- [ ] **Step 1: Write the failing test `notes-store.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { createNotesStore, NOTES_STORAGE_KEY, type StorageLike } from "./notes-store";

function fakeStorage(initial?: string): StorageLike & { data: Record<string, string> } {
	const data: Record<string, string> = {};
	if (initial !== undefined) data[NOTES_STORAGE_KEY] = initial;
	return {
		data,
		getItem: (k: string) => (k in data ? data[k] : null),
		setItem: (k: string, v: string) => {
			data[k] = v;
		},
	};
}

let counter = 0;
const seq = () => `id-${++counter}`;
const fixedNow = () => 1000;

describe("createNotesStore", () => {
	it("adds notes newest-first and persists to storage", () => {
		const storage = fakeStorage();
		const store = createNotesStore({ storage, makeId: seq, now: fixedNow });
		store.add("synthesis", "clean scan");
		const after = store.add("organism", "too loud");
		expect(after.map((n) => n.text)).toEqual(["too loud", "clean scan"]);
		expect(after[0]).toMatchObject({ mode: "organism", text: "too loud", createdAt: 1000 });
		expect(JSON.parse(storage.data[NOTES_STORAGE_KEY])).toHaveLength(2);
	});

	it("hydrates existing notes from storage", () => {
		const seed = JSON.stringify([
			{ id: "a", mode: "existing", text: "hi", createdAt: 1 },
		]);
		const store = createNotesStore({ storage: fakeStorage(seed) });
		expect(store.list().map((n) => n.id)).toEqual(["a"]);
	});

	it("recovers from malformed JSON as an empty list", () => {
		const store = createNotesStore({ storage: fakeStorage("{not json") });
		expect(store.list()).toEqual([]);
	});

	it("sets sentiment and removes by id", () => {
		const store = createNotesStore({ storage: fakeStorage(), makeId: seq, now: fixedNow });
		const [note] = store.add("synthesis", "x");
		const flagged = store.setSentiment(note.id, "-");
		expect(flagged[0].sentiment).toBe("-");
		expect(store.remove(note.id)).toEqual([]);
	});

	it("clears all notes", () => {
		const store = createNotesStore({ storage: fakeStorage(), makeId: seq, now: fixedNow });
		store.add("synthesis", "x");
		expect(store.clear()).toEqual([]);
	});

	it("keeps notes in memory even if persistence throws (quota)", () => {
		const throwingStorage: StorageLike = {
			getItem: () => null,
			setItem: () => {
				throw new Error("QuotaExceeded");
			},
		};
		const store = createNotesStore({ storage: throwingStorage, makeId: seq, now: fixedNow });
		expect(store.add("synthesis", "x")).toHaveLength(1);
		expect(store.list()).toHaveLength(1);
	});

	it("reload re-reads storage into memory (cross-tab sync)", () => {
		const storage = fakeStorage();
		const store = createNotesStore({ storage, makeId: seq, now: fixedNow });
		storage.data[NOTES_STORAGE_KEY] = JSON.stringify([
			{ id: "z", mode: "organism", text: "external", createdAt: 5 },
		]);
		expect(store.reload().map((n) => n.id)).toEqual(["z"]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/fleet/eval/notes-store.test.ts`
Expected: FAIL — cannot resolve `./notes-store`.

- [ ] **Step 3: Create `notes-store.ts`**

```ts
import type { EvalNote, FleetMode, NoteSentiment } from "./types";

export const NOTES_STORAGE_KEY = "am-fleet-eval-notes";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type NotesStore = {
	list(): EvalNote[];
	add(mode: FleetMode, text: string): EvalNote[];
	setSentiment(id: string, sentiment: NoteSentiment | undefined): EvalNote[];
	remove(id: string): EvalNote[];
	clear(): EvalNote[];
	reload(): EvalNote[];
};

function isNote(v: unknown): v is EvalNote {
	if (typeof v !== "object" || v === null) return false;
	const n = v as Record<string, unknown>;
	return (
		typeof n.id === "string" &&
		typeof n.text === "string" &&
		typeof n.createdAt === "number" &&
		(n.mode === "existing" || n.mode === "synthesis" || n.mode === "organism")
	);
}

function safeLocalStorage(): StorageLike | null {
	try {
		return typeof window !== "undefined" ? window.localStorage : null;
	} catch {
		return null;
	}
}

function readAll(storage: StorageLike | null): EvalNote[] {
	if (!storage) return [];
	try {
		const raw = storage.getItem(NOTES_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter(isNote) : [];
	} catch {
		return [];
	}
}

export function createNotesStore(opts?: {
	storage?: StorageLike | null;
	makeId?: () => string;
	now?: () => number;
}): NotesStore {
	const storage = opts?.storage === undefined ? safeLocalStorage() : opts.storage;
	const makeId = opts?.makeId ?? (() => crypto.randomUUID());
	const now = opts?.now ?? (() => Date.now());

	let notes: EvalNote[] = readAll(storage);

	const persist = () => {
		if (!storage) return;
		try {
			storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
		} catch {
			// storage full/unavailable — keep the in-memory copy as source of truth
		}
	};

	return {
		list: () => notes.slice(),
		add(mode, text) {
			notes = [{ id: makeId(), mode, text, createdAt: now() }, ...notes];
			persist();
			return notes.slice();
		},
		setSentiment(id, sentiment) {
			notes = notes.map((n) => (n.id === id ? { ...n, sentiment } : n));
			persist();
			return notes.slice();
		},
		remove(id) {
			notes = notes.filter((n) => n.id !== id);
			persist();
			return notes.slice();
		},
		clear() {
			notes = [];
			persist();
			return notes.slice();
		},
		reload() {
			notes = readAll(storage);
			return notes.slice();
		},
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/fleet/eval/notes-store.test.ts`
Expected: PASS — all 7 cases green.

- [ ] **Step 5: Commit**

```bash
git add web/lib/fleet/eval/notes-store.ts web/lib/fleet/eval/notes-store.test.ts
git commit -m "feat(eval): DOM-free notes store with in-memory fallback + cross-tab reload"
```

---

### Task 3: Markdown export of notes

**Files:**
- Create: `web/lib/fleet/eval/export.ts`
- Test: `web/lib/fleet/eval/export.test.ts`

**Interfaces:**
- Consumes: `EvalNote`, `EVAL_MODES` from `./types`.
- Produces: `notesToMarkdown(notes: EvalNote[]): string`.

- [ ] **Step 1: Write the failing test `export.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { notesToMarkdown } from "./export";
import type { EvalNote } from "./types";

const notes: EvalNote[] = [
	{ id: "1", mode: "synthesis", text: "clean scan", createdAt: 1, sentiment: "+" },
	{ id: "2", mode: "organism", text: "too loud", createdAt: 2, sentiment: "-" },
	{ id: "3", mode: "synthesis", text: "hard to read counts", createdAt: 3 },
];

describe("notesToMarkdown", () => {
	it("groups notes under a heading per mode, in canonical order", () => {
		const md = notesToMarkdown(notes);
		expect(md).toContain("## existing");
		expect(md).toContain("## synthesis");
		expect(md).toContain("## organism");
		expect(md.indexOf("## synthesis")).toBeLessThan(md.indexOf("## organism"));
	});

	it("renders sentiment markers and plain notes", () => {
		const md = notesToMarkdown(notes);
		expect(md).toContain("- 👍 clean scan");
		expect(md).toContain("- 👎 too loud");
		expect(md).toContain("- hard to read counts");
	});

	it("shows an empty-state line for a mode with no notes", () => {
		const md = notesToMarkdown([]);
		expect(md).toContain("_(no notes)_");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/fleet/eval/export.test.ts`
Expected: FAIL — cannot resolve `./export`.

- [ ] **Step 3: Create `export.ts`**

```ts
import { EVAL_MODES, type EvalNote } from "./types";

function marker(note: EvalNote): string {
	if (note.sentiment === "+") return "👍 ";
	if (note.sentiment === "-") return "👎 ";
	return "";
}

/** Renders notes as a Markdown board grouped by interface, in flip order. */
export function notesToMarkdown(notes: EvalNote[]): string {
	const lines: string[] = ["# Fleet interface eval notes", ""];
	for (const mode of EVAL_MODES) {
		lines.push(`## ${mode}`);
		const group = notes.filter((n) => n.mode === mode);
		if (group.length === 0) {
			lines.push("_(no notes)_");
		} else {
			for (const note of group) lines.push(`- ${marker(note)}${note.text}`);
		}
		lines.push("");
	}
	return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/fleet/eval/export.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/fleet/eval/export.ts web/lib/fleet/eval/export.test.ts
git commit -m "feat(eval): markdown export grouped by interface"
```

---

### Task 4: Eval-mode gate (pure resolver + client hook)

**Files:**
- Create: `web/lib/fleet/eval/eval-mode.ts` (pure — no react/next imports)
- Create: `web/lib/fleet/eval/use-eval-mode.ts` (client hook)
- Test: `web/lib/fleet/eval/eval-mode.test.ts`

**Interfaces:**
- Consumes: `resolveEvalMode` from `./eval-mode` (the hook wraps the pure resolver); `useSearchParams` from `next/navigation` (hook only).
- Produces:
  - `eval-mode.ts` (pure, safe to import from the node test env): `const EVAL_FLAG_KEY = "am-fleet-eval"`, `resolveEvalMode(param: string | null, stored: string | null): { on: boolean; persist: "1" | "0" | null }`.
  - `use-eval-mode.ts` (client hook): `useEvalMode(): boolean` (default off on first paint).

> Why the split: the test runs in Vitest's **node** environment, so the tested module must not transitively import `next/navigation`. The pure resolver lives in `eval-mode.ts`; only the hook (untested, verified manually) imports next/react.

- [ ] **Step 1: Write the failing test `eval-mode.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { resolveEvalMode } from "./eval-mode";

describe("resolveEvalMode", () => {
	it("turns on and persists when ?eval=1", () => {
		expect(resolveEvalMode("1", null)).toEqual({ on: true, persist: "1" });
	});

	it("turns off and persists when ?eval=0", () => {
		expect(resolveEvalMode("0", "1")).toEqual({ on: false, persist: "0" });
	});

	it("falls back to the stored flag when no param", () => {
		expect(resolveEvalMode(null, "1")).toEqual({ on: true, persist: null });
		expect(resolveEvalMode(null, null)).toEqual({ on: false, persist: null });
	});

	it("treats any non-1/0 param as absent (stored wins)", () => {
		expect(resolveEvalMode("yes", "1")).toEqual({ on: true, persist: null });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/fleet/eval/eval-mode.test.ts`
Expected: FAIL — cannot resolve `./eval-mode`.

- [ ] **Step 3: Create the pure `eval-mode.ts`**

```ts
export const EVAL_FLAG_KEY = "am-fleet-eval";

/** Pure gate resolution: the ?eval param wins and persists; otherwise the stored flag decides. */
export function resolveEvalMode(
	param: string | null,
	stored: string | null,
): { on: boolean; persist: "1" | "0" | null } {
	if (param === "1") return { on: true, persist: "1" };
	if (param === "0") return { on: false, persist: "0" };
	return { on: stored === "1", persist: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/fleet/eval/eval-mode.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the client hook `use-eval-mode.ts`**

```ts
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { EVAL_FLAG_KEY, resolveEvalMode } from "./eval-mode";

/**
 * Whether the personal eval harness is active. Defaults off on first paint
 * (SSR-safe), then resolves ?eval + the sticky localStorage flag in an effect.
 */
export function useEvalMode(): boolean {
	const params = useSearchParams();
	const evalParam = params.get("eval");
	const [on, setOn] = useState(false);

	useEffect(() => {
		let stored: string | null = null;
		try {
			stored = window.localStorage.getItem(EVAL_FLAG_KEY);
		} catch {
			// storage unavailable
		}
		const resolved = resolveEvalMode(evalParam, stored);
		if (resolved.persist !== null) {
			try {
				window.localStorage.setItem(EVAL_FLAG_KEY, resolved.persist);
			} catch {
				// storage unavailable; param still applies for this session
			}
		}
		setOn(resolved.on);
	}, [evalParam]);

	return on;
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add web/lib/fleet/eval/eval-mode.ts web/lib/fleet/eval/eval-mode.test.ts web/lib/fleet/eval/use-eval-mode.ts
git commit -m "feat(eval): ?eval / localStorage gate — pure resolver + client hook"
```

---

### Task 5: Dial `active` prop (pause canvas when hidden)

**Files:**
- Modify: `web/components/dashboard/fleet-dial/FleetDial.tsx`
- Modify: `web/components/dashboard/fleet-dial/DialCanvasBloom.tsx`

**Interfaces:**
- Produces: `FleetDial` accepts optional `active?: boolean` (default `true`); `DialCanvasBloom` accepts required `active: boolean`.
- Consumes: nothing new.

- [ ] **Step 1: Add `active` to `FleetDial`'s props (destructure + type)**

In `FleetDial.tsx`, change the destructured params and the prop type. Replace:

```tsx
	onSelect,
	loadById,
}: {
	machines: DialMachine[];
	activeMachineId: string | null;
	mode: DialMode;
	focusedId: string | null;
	onSelect: (id: string | null) => void;
	/** Optional live CPU load per machine id (0..1). Absent in v1. */
	loadById?: Record<string, number>;
}) {
```

with:

```tsx
	onSelect,
	loadById,
	active = true,
}: {
	machines: DialMachine[];
	activeMachineId: string | null;
	mode: DialMode;
	focusedId: string | null;
	onSelect: (id: string | null) => void;
	/** Optional live CPU load per machine id (0..1). Absent in v1. */
	loadById?: Record<string, number>;
	/** When false, the ambient canvas pauses its animation loop (kept-alive but hidden). */
	active?: boolean;
}) {
```

- [ ] **Step 2: Pass `active` into `DialCanvasBloom`**

In `FleetDial.tsx`, in the `skin.canvasBloom` block, add the `active` prop. Replace:

```tsx
					<DialCanvasBloom
						nodes={layout.nodes}
						dialSize={dialSize}
						liveRadius={layout.rings.live}
						cx={layout.cx}
						cy={layout.cy}
						reducedMotion={reducedMotion}
					/>
```

with:

```tsx
					<DialCanvasBloom
						nodes={layout.nodes}
						dialSize={dialSize}
						liveRadius={layout.rings.live}
						cx={layout.cx}
						cy={layout.cy}
						reducedMotion={reducedMotion}
						active={active}
					/>
```

- [ ] **Step 3: Accept and honor `active` in `DialCanvasBloom`**

In `DialCanvasBloom.tsx`, add `active` to the props type and destructure. Replace:

```tsx
	cx,
	cy,
	reducedMotion,
}: {
	nodes: RadialNode[];
	dialSize: number;
	liveRadius: number;
	cx: number;
	cy: number;
	reducedMotion: boolean;
}) {
```

with:

```tsx
	cx,
	cy,
	reducedMotion,
	active,
}: {
	nodes: RadialNode[];
	dialSize: number;
	liveRadius: number;
	cx: number;
	cy: number;
	reducedMotion: boolean;
	active: boolean;
}) {
```

- [ ] **Step 4: Gate the animation loop on `active`**

In `DialCanvasBloom.tsx`, replace the reduced-motion early return:

```tsx
		if (reducedMotion) {
			drawBlobs(0);
			drawDrift();
			return;
		}
```

with (also paints a single static frame when inactive, then skips the RAF loop):

```tsx
		if (reducedMotion || !active) {
			drawBlobs(0);
			drawDrift();
			return;
		}
```

Then add `active` to the effect dependency array. Replace:

```tsx
	}, [nodes, dialSize, liveRadius, cx, cy, reducedMotion]);
```

with:

```tsx
	}, [nodes, dialSize, liveRadius, cx, cy, reducedMotion, active]);
```

- [ ] **Step 5: Typecheck + existing dial tests still green**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx vitest run lib/fleet`
Expected: PASS (35 existing tests unaffected — this change is component-only).

- [ ] **Step 6: Commit**

```bash
git add web/components/dashboard/fleet-dial/FleetDial.tsx web/components/dashboard/fleet-dial/DialCanvasBloom.tsx
git commit -m "feat(dial): active prop to pause ambient canvas when kept-alive but hidden"
```

---

### Task 6: Keep-alive stage + HUD (presentational)

**Files:**
- Create: `web/components/dashboard/fleet-eval/CompareStage.tsx`
- Create: `web/components/dashboard/fleet-eval/ModeHud.tsx`

**Interfaces:**
- Consumes: `EVAL_MODES`, `FleetMode` from `@/lib/fleet/eval/types`.
- Produces:
  - `CompareStage({ shown: FleetMode; render: (mode: FleetMode, active: boolean) => React.ReactNode })`.
  - `ModeHud({ mode: FleetMode; peeking: boolean })`.

- [ ] **Step 1: Create `CompareStage.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";

import { EVAL_MODES, type FleetMode } from "@/lib/fleet/eval/types";

/**
 * Keep-alive compare stage. All three interfaces are mounted at once and stacked;
 * exactly one is shown via CSS visibility so flipping is a 0 ms swap that preserves
 * each pane's internal state (scroll, dial layout, canvas). The box is a fixed
 * height so the frame never jumps between variants.
 */
export function CompareStage({
	shown,
	render,
}: {
	shown: FleetMode;
	render: (mode: FleetMode, active: boolean) => ReactNode;
}) {
	return (
		<div
			className="relative w-full overflow-hidden border border-[var(--ret-border)]"
			style={{ height: "clamp(440px, 62vh, 760px)" }}
		>
			{EVAL_MODES.map((mode) => {
				const active = mode === shown;
				return (
					<div
						key={mode}
						aria-hidden={!active}
						className="absolute inset-0"
						style={{
							visibility: active ? "visible" : "hidden",
							opacity: active ? 1 : 0,
							pointerEvents: active ? "auto" : "none",
						}}
					>
						{render(mode, active)}
					</div>
				);
			})}
		</div>
	);
}
```

- [ ] **Step 2: Create `ModeHud.tsx`**

```tsx
"use client";

import type { FleetMode } from "@/lib/fleet/eval/types";

/** Always-on orientation chip: current mode (or PEEK target) + a shortcut hint. */
export function ModeHud({ mode, peeking }: { mode: FleetMode; peeking: boolean }) {
	return (
		<div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col items-end gap-1">
			<span className="border border-[var(--ret-border)] bg-[var(--ret-bg)]/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text)]">
				{peeking ? `peek · ${mode}` : mode}
			</span>
			<span className="font-mono text-[9px] tracking-[0.14em] text-[var(--ret-text-muted)]">
				` cycle · 1/2/3 jump · hold space peek · n note
			</span>
		</div>
	);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/components/dashboard/fleet-eval/CompareStage.tsx web/components/dashboard/fleet-eval/ModeHud.tsx
git commit -m "feat(eval): keep-alive CompareStage + orientation HUD"
```

---

### Task 7: Notes hook + notes panel

**Files:**
- Create: `web/lib/fleet/eval/use-eval-notes.ts`
- Create: `web/components/dashboard/fleet-eval/EvalNotesPanel.tsx`

**Interfaces:**
- Consumes: `createNotesStore`, `NOTES_STORAGE_KEY` from `@/lib/fleet/eval/notes-store`; `notesToMarkdown` from `@/lib/fleet/eval/export`; `EVAL_MODES`, `EvalNote`, `FleetMode`, `NoteSentiment` from `@/lib/fleet/eval/types`.
- Produces:
  - `useEvalNotes(): { notes: EvalNote[]; add(mode, text): void; remove(id): void; setSentiment(id, s): void; clear(): void }`.
  - `EvalNotesPanel({ currentMode: FleetMode; inputRef: React.RefObject<HTMLInputElement | null> })`.

- [ ] **Step 1: Create `use-eval-notes.ts`**

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createNotesStore, NOTES_STORAGE_KEY } from "./notes-store";
import type { EvalNote, FleetMode, NoteSentiment } from "./types";

/** React state over the notes store, with cross-tab sync via the `storage` event. */
export function useEvalNotes() {
	const store = useMemo(() => createNotesStore(), []);
	const [notes, setNotes] = useState<EvalNote[]>(() => store.list());

	useEffect(() => {
		const onStorage = (e: StorageEvent) => {
			if (e.key === NOTES_STORAGE_KEY) setNotes(store.reload());
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, [store]);

	const add = useCallback(
		(mode: FleetMode, text: string) => setNotes(store.add(mode, text)),
		[store],
	);
	const remove = useCallback((id: string) => setNotes(store.remove(id)), [store]);
	const setSentiment = useCallback(
		(id: string, s: NoteSentiment | undefined) => setNotes(store.setSentiment(id, s)),
		[store],
	);
	const clear = useCallback(() => setNotes(store.clear()), [store]);

	return { notes, add, remove, setSentiment, clear };
}
```

- [ ] **Step 2: Create `EvalNotesPanel.tsx`**

```tsx
"use client";

import { useState } from "react";

import { notesToMarkdown } from "@/lib/fleet/eval/export";
import { useEvalNotes } from "@/lib/fleet/eval/use-eval-notes";
import { EVAL_MODES, type FleetMode } from "@/lib/fleet/eval/types";
import { cn } from "@/lib/cn";

/**
 * The mode-tagged observation board. New notes are tagged with `currentMode`
 * (the shown pane at time of writing). Grouped by interface so it reads as a
 * "what's working / what's not" list per variant. Local-only for now.
 */
export function EvalNotesPanel({
	currentMode,
	inputRef,
}: {
	currentMode: FleetMode;
	inputRef: React.RefObject<HTMLInputElement | null>;
}) {
	const { notes, add, remove, setSentiment, clear } = useEvalNotes();
	const [draft, setDraft] = useState("");
	const [collapsed, setCollapsed] = useState(false);
	const [copied, setCopied] = useState(false);

	const submit = () => {
		const text = draft.trim();
		if (!text) return;
		add(currentMode, text);
		setDraft("");
	};

	const copyMarkdown = async () => {
		try {
			await navigator.clipboard.writeText(notesToMarkdown(notes));
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1200);
		} catch {
			// clipboard blocked; no-op
		}
	};

	if (collapsed) {
		return (
			<button
				type="button"
				onClick={() => setCollapsed(false)}
				className="h-full shrink-0 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
			>
				notes ({notes.length})
			</button>
		);
	}

	return (
		<aside className="flex w-72 shrink-0 flex-col gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-2">
			<div className="flex items-center justify-between">
				<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
					eval notes
				</span>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={copyMarkdown}
						className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
					>
						{copied ? "copied" : "copy md"}
					</button>
					<button
						type="button"
						onClick={() => setCollapsed(true)}
						className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
					>
						hide
					</button>
				</div>
			</div>

			<div className="flex items-center gap-1">
				<span className="border border-[var(--ret-border)] px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
					{currentMode}
				</span>
				<input
					ref={inputRef}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") submit();
						if (e.key === "Escape") e.currentTarget.blur();
					}}
					placeholder="what's working / not…"
					className="min-w-0 flex-1 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 py-1 font-mono text-[11px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
				/>
			</div>

			<div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto">
				{EVAL_MODES.map((mode) => {
					const group = notes.filter((n) => n.mode === mode);
					return (
						<div key={mode} className="flex flex-col gap-1">
							<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-dim)]">
								{mode} ({group.length})
							</span>
							{group.map((note) => (
								<div
									key={note.id}
									className="flex items-start gap-1 border-l border-[var(--ret-border)] pl-1.5 text-[11px] text-[var(--ret-text)]"
								>
									<button
										type="button"
										aria-label="toggle working"
										onClick={() =>
											setSentiment(note.id, note.sentiment === "+" ? undefined : "+")
										}
										className={cn(
											"font-mono text-[10px]",
											note.sentiment === "+" ? "opacity-100" : "opacity-30",
										)}
									>
										👍
									</button>
									<button
										type="button"
										aria-label="toggle not working"
										onClick={() =>
											setSentiment(note.id, note.sentiment === "-" ? undefined : "-")
										}
										className={cn(
											"font-mono text-[10px]",
											note.sentiment === "-" ? "opacity-100" : "opacity-30",
										)}
									>
										👎
									</button>
									<span className="min-w-0 flex-1 break-words">{note.text}</span>
									<button
										type="button"
										aria-label="delete note"
										onClick={() => remove(note.id)}
										className="font-mono text-[10px] text-[var(--ret-text-muted)] hover:text-[var(--ret-red)]"
									>
										×
									</button>
								</div>
							))}
						</div>
					);
				})}
			</div>

			{notes.length > 0 ? (
				<button
					type="button"
					onClick={clear}
					className="self-end font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)] hover:text-[var(--ret-red)]"
				>
					clear all
				</button>
			) : null}
		</aside>
	);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/lib/fleet/eval/use-eval-notes.ts web/components/dashboard/fleet-eval/EvalNotesPanel.tsx
git commit -m "feat(eval): notes hook + mode-grouped notes panel with markdown export"
```

---

### Task 8: EvalHarness controller (keyboard flip + peek + wiring)

**Files:**
- Create: `web/components/dashboard/fleet-eval/EvalHarness.tsx`

**Interfaces:**
- Consumes: `CompareStage`, `ModeHud`, `EvalNotesPanel`; `cycleMode`, `keyToAction`, `keyUpToAction` from `@/lib/fleet/eval/keys`; `FleetMode` from `@/lib/fleet/eval/types`.
- Produces: `EvalHarness({ mode: FleetMode; onModeChange: (m: FleetMode) => void; renderPane: (mode: FleetMode, active: boolean) => React.ReactNode })`.

- [ ] **Step 1: Create `EvalHarness.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { CompareStage } from "./CompareStage";
import { EvalNotesPanel } from "./EvalNotesPanel";
import { ModeHud } from "./ModeHud";
import { cycleMode, keyToAction, keyUpToAction } from "@/lib/fleet/eval/keys";
import type { FleetMode } from "@/lib/fleet/eval/types";

function isInteractive(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) return false;
	const tag = el.tagName;
	return (
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		tag === "BUTTON" ||
		el.isContentEditable ||
		el.getAttribute("role") === "button"
	);
}

/**
 * Personal blink-compare controller. Owns the shown mode (committed `mode` is
 * controlled by the parent; `peek` is transient), wires the keyboard shortcuts,
 * and lays out the keep-alive stage beside the notes board.
 */
export function EvalHarness({
	mode,
	onModeChange,
	renderPane,
}: {
	mode: FleetMode;
	onModeChange: (mode: FleetMode) => void;
	renderPane: (mode: FleetMode, active: boolean) => ReactNode;
}) {
	const [peek, setPeek] = useState<FleetMode | null>(null);
	const noteInputRef = useRef<HTMLInputElement | null>(null);

	// Track the previously-committed mode so "hold Space" peeks where you just were.
	const prevModeRef = useRef<FleetMode | null>(null);
	const lastModeRef = useRef<FleetMode>(mode);
	useEffect(() => {
		if (lastModeRef.current !== mode) {
			prevModeRef.current = lastModeRef.current;
			lastModeRef.current = mode;
		}
	}, [mode]);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.repeat) return;
			if (isInteractive(e.target)) return;
			const action = keyToAction(e.key, { shift: e.shiftKey });
			if (!action) return;
			e.preventDefault();
			switch (action.type) {
				case "cycle":
					onModeChange(cycleMode(mode, action.dir));
					break;
				case "jump":
					onModeChange(action.mode);
					break;
				case "peekStart":
					setPeek((p) => p ?? prevModeRef.current ?? cycleMode(mode, 1));
					break;
				case "focusNote":
					noteInputRef.current?.focus();
					break;
				case "peekEnd":
					break;
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			const action = keyUpToAction(e.key);
			if (action?.type === "peekEnd") setPeek(null);
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
		};
	}, [mode, onModeChange]);

	const shown = peek ?? mode;

	return (
		<div className="flex w-full gap-3">
			<div className="relative min-w-0 flex-1">
				<ModeHud mode={shown} peeking={peek !== null} />
				<CompareStage shown={shown} render={renderPane} />
			</div>
			<EvalNotesPanel currentMode={shown} inputRef={noteInputRef} />
		</div>
	);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add web/components/dashboard/fleet-eval/EvalHarness.tsx
git commit -m "feat(eval): EvalHarness — keyboard blink-compare + hold-to-peek controller"
```

---

### Task 9: Wire the harness into MachinesPanel (gated)

**Files:**
- Modify: `web/components/dashboard/MachinesPanel.tsx`

**Interfaces:**
- Consumes: `useEvalMode` from `@/lib/fleet/eval/use-eval-mode`; `EvalHarness` from `@/components/dashboard/fleet-eval/EvalHarness`.
- Produces: no new exports. When eval mode is off, behavior is unchanged.

- [ ] **Step 1: Add imports**

After the existing `useLiveLoads` import (line 22), add:

```tsx
import { EvalHarness } from "@/components/dashboard/fleet-eval/EvalHarness";
import { useEvalMode } from "@/lib/fleet/eval/use-eval-mode";
```

- [ ] **Step 2: Read the eval gate and generalize the load poll**

Replace:

```tsx
	// Live per-machine CPU load (0..1) drives the dial's breathing. Only polled
	// while a radial mode is on screen; degrades to a calm baseline when absent.
	const loadById = useLiveLoads(mode !== "existing");
```

with:

```tsx
	const evalMode = useEvalMode();
	// Live per-machine CPU load (0..1) drives the dial's breathing. Polled while a
	// radial mode is on screen; in eval mode both dials are kept alive so poll always.
	const loadById = useLiveLoads(evalMode ? true : mode !== "existing");
```

- [ ] **Step 3: Add shared card-list + stage-existing render helpers**

Immediately before `return (` (currently line 223), add these two closures. `cardEls()` is the shared card mapping (DRY between the normal path and the stage); `renderStageExisting()` is the primary "existing" content for the compare stage.

```tsx
	const cardEls = () =>
		visible.map((machine, idx) => {
			const card = cardsById.get(machine.id);
			if (!card) return null;
			return (
				<MachineFleetCard
					key={machine.id}
					machine={machine}
					card={card}
					loadout={loadout}
					active={machine.id === activeMachineId}
					focused={machine.id === focusMachine?.id}
					delaySec={idx * 0.65}
					logsLoaded={isFleetLogsLoaded(machine, logsFetched)}
					editing={editing === machine.id}
					onChange={refresh}
					onToggleEdit={() =>
						setEditing((prev) => (prev === machine.id ? null : machine.id))
					}
					onSavedEdit={() => {
						setEditing(null);
						void refresh();
					}}
					onInteract={() => setFocus(machine.id)}
					EditPanel={EditPanel}
				/>
			);
		});

	const renderStageExisting = () => {
		if (visible.length === 0) {
			return (
				<EmptyShell
					title="No machines yet"
					body="Click '+ New machine' above or use the setup wizard for guided provisioning."
					cta={null}
				/>
			);
		}
		if (view === "table") {
			return <MachineTable machines={visible} activeMachineId={activeMachineId} />;
		}
		return <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">{cardEls()}</section>;
	};
```

- [ ] **Step 4: DRY the normal cards path to use `cardEls()`**

In the normal cards block, replace the inline `.map` (currently lines 341-369) — i.e. replace:

```tsx
						{visible.map((machine, idx) => {
							const card = cardsById.get(machine.id);
							if (!card) return null;
							return (
								<MachineFleetCard
									key={machine.id}
									machine={machine}
									card={card}
									loadout={loadout}
									active={machine.id === activeMachineId}
									focused={machine.id === focusMachine?.id}
									delaySec={idx * 0.65}
									logsLoaded={isFleetLogsLoaded(machine, logsFetched)}
									editing={editing === machine.id}
									onChange={refresh}
									onToggleEdit={() =>
										setEditing((prev) =>
											prev === machine.id ? null : machine.id,
										)
									}
									onSavedEdit={() => {
										setEditing(null);
										void refresh();
									}}
									onInteract={() => setFocus(machine.id)}
									EditPanel={EditPanel}
								/>
							);
						})}
```

with:

```tsx
						{cardEls()}
```

- [ ] **Step 5: Gate the four primary blocks behind `evalMode`**

Wrap the existing primary-content region in an `evalMode ? <harness> : <normal>` conditional. Replace the whole span from the "existing empty shell" block through the end of the "cards" block — currently lines 286-381, i.e. the four sibling blocks that start with:

```tsx
			{mode === "existing" && !loading && machines.length === 0 && !showProvision ? (
				<EmptyShell
```

…and end with the closing of the cards block:

```tsx
					) : null}
				</div>
			) : null}
```

Replace that entire region with:

```tsx
			{evalMode ? (
				<div
					className={
						focusMachine
							? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,44%)]"
							: undefined
					}
				>
					<EvalHarness
						mode={mode}
						onModeChange={selectMode}
						renderPane={(paneMode, active) =>
							paneMode === "existing" ? (
								<div className="h-full overflow-y-auto p-1">{renderStageExisting()}</div>
							) : (
								<FleetDial
									machines={visible}
									activeMachineId={activeMachineId}
									mode={paneMode}
									focusedId={focusMachine?.id ?? null}
									onSelect={(id) => setFocus(id)}
									loadById={loadById}
									active={active}
								/>
							)
						}
					/>
					{focusMachine ? (
						<FleetInteractPane
							machineId={focusMachine.id}
							name={focusMachine.name}
							agentKind={focusMachine.agentKind}
							model={focusMachine.model}
							onClose={() => setFocus(null)}
						/>
					) : null}
				</div>
			) : (
				<>
					{mode === "existing" && !loading && machines.length === 0 && !showProvision ? (
						<EmptyShell
							title="No machines yet"
							body="Click '+ New machine' above or use the setup wizard for guided provisioning."
							cta={null}
						/>
					) : null}

					{mode !== "existing" ? (
						<div
							className={
								focusMachine
									? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,44%)]"
									: undefined
							}
						>
							<FleetDial
								machines={visible}
								activeMachineId={activeMachineId}
								mode={mode}
								focusedId={focusMachine?.id ?? null}
								onSelect={(id) => setFocus(id)}
								loadById={loadById}
							/>
							{focusMachine ? (
								<FleetInteractPane
									machineId={focusMachine.id}
									name={focusMachine.name}
									agentKind={focusMachine.agentKind}
									model={focusMachine.model}
									onClose={() => setFocus(null)}
								/>
							) : null}
						</div>
					) : null}

					{mode === "existing" && visible.length > 0 && view === "table" ? (
						<MachineTable machines={visible} activeMachineId={activeMachineId} />
					) : null}

					{mode === "existing" && visible.length > 0 && view === "cards" ? (
						<div
							className={
								focusMachine
									? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,44%)]"
									: undefined
							}
						>
							<section
								className={
									focusMachine
										? "grid max-h-[calc(100dvh-12rem)] grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-1"
										: "grid grid-cols-1 gap-3 lg:grid-cols-2"
								}
							>
								{cardEls()}
							</section>
							{focusMachine ? (
								<FleetInteractPane
									machineId={focusMachine.id}
									name={focusMachine.name}
									agentKind={focusMachine.agentKind}
									model={focusMachine.model}
									onClose={() => setFocus(null)}
								/>
							) : null}
						</div>
					) : null}
				</>
			)}
```

> Note: the `<>…</>` branch is the original four blocks verbatim, with only the cards `.map` swapped for `{cardEls()}` (Step 4). The archived section and everything else below stay unchanged.

- [ ] **Step 6: Typecheck + full unit tests**

Run: `npx tsc --noEmit`
Expected: exit 0 (the `paneMode === "existing" ? … : …` ternary narrows `paneMode` to `"synthesis" | "organism"`, which is assignable to the dial's `DialMode`).
Run: `npx vitest run lib/fleet`
Expected: PASS (all fleet + eval tests green).

- [ ] **Step 7: Commit**

```bash
git add web/components/dashboard/MachinesPanel.tsx
git commit -m "feat(eval): gate blink-compare harness into MachinesPanel behind ?eval"
```

---

### Task 10: Manual verification pass + wrap-up commit

**Files:**
- No source changes expected (fix-forward only if something is found).

- [ ] **Step 1: Full typecheck + test suite**

Run: `npm run typecheck`
Expected: exit 0.
Run: `npm test`
Expected: all suites pass, including the new `lib/fleet/eval/*` tests.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Then open `http://localhost:3210/dashboard/machines?eval=1`.

- [ ] **Step 3: Verify the blink-compare harness (manual checklist)**

Confirm each:
- The stage shows the current mode; the HUD chip + shortcut hint are visible top-right.
- `` ` `` cycles existing → synthesis → organism → existing; Shift+`` ` `` reverses.
- `1` / `2` / `3` jump directly; the mouse `FleetModeToggle` still switches and stays in sync.
- Flipping is instant with **no flash** and the dial does not visibly re-lay-out (keep-alive working).
- **Hold Space** peeks the variant you were just on; releasing snaps back (HUD reads `peek · …`).
- `n` focuses the note input; typing does **not** trigger flips; Enter saves; Esc blurs.
- Notes appear grouped under their mode; 👍/👎 toggle; delete works; **copy md** copies the grouped markdown.
- Reload the page → notes persist and eval mode stays on (sticky flag).
- Open `?eval=0` → the harness disappears and the page renders the normal 3-way toggle exactly as before. Toggle through existing/synthesis/organism and confirm the shipped path is unchanged.

- [ ] **Step 4: Verify the organism canvas pauses when hidden (optional, DevTools)**

With the harness on and mode = `existing` or `synthesis` (organism hidden), open DevTools Performance and confirm no continuous canvas RAF work attributable to the hidden organism dial; switch to `organism` and confirm the bloom animates. (This exercises Task 5's `active` gate.)

- [ ] **Step 5: Final commit (only if manual fixes were made)**

```bash
git add -A
git commit -m "fix(eval): address manual-verification findings"
```

If no fixes were needed, skip this commit — the feature is complete.

---

## Self-Review

**Spec coverage** (each spec section → task):
- §3.1 Gating (`?eval=1` sticky, client-only, default off) → Task 4 (`resolveEvalMode`/`useEvalMode`) + Task 9 (branch).
- §3.2 Keep-alive stage (all mounted, visibility swap, `active`) → Task 6 (`CompareStage`) + Task 5 (`active`) + Task 9 (`renderPane`).
- §3.3 Shared inputs → Task 9 (`renderPane` closes over the same `visible`/`activeMachineId`/`focusMachine`/`setFocus`).
- §3.4 Interaction / keybindings + peek fallback + interactive-element suppression → Task 1 (`keyToAction`/`cycleMode`) + Task 8 (`isInteractive`, `prevModeRef` fallback, `e.repeat` guard).
- §3.5 HUD → Task 6 (`ModeHud`) + Task 8 (wiring).
- §3.6 Notes model & store (+ in-memory fallback, cross-tab) → Task 2.
- §3.7 Notes panel (grouped, pre-tagged, copy-md, sentiment) → Task 3 (`notesToMarkdown`) + Task 7 (`EvalNotesPanel`).
- §3.8 Dial `active` touch → Task 5.
- §6 Edge cases → Task 2 (malformed JSON / quota), Task 4 (storage try/catch, SSR default off), Task 6 (reduced-motion path preserved), Task 8 (hotkey suppression).
- §7 Testing → Tasks 1–4 unit tests; Tasks 5–9 typecheck; Task 10 manual pass.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test step shows real assertions. ✓

**Type consistency:** `FleetMode` sourced from `FleetModeToggle` throughout; `EvalAction` variants produced in Task 1 are exactly the variants consumed in Task 8's switch; `NotesStore` method names (`add`/`setSentiment`/`remove`/`clear`/`reload`/`list`) are identical in Tasks 2 and 7; `active` is optional-with-default on `FleetDial` (Task 5) and passed as required to `DialCanvasBloom` (Task 5) and from `renderPane` (Task 9). ✓
