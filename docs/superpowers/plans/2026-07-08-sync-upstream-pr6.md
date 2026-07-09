# Sync Upstream (PR #6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `upstream/main` (`Kevin-Liu-01/Agent-Machines`, currently pinned at `2407ce598`, which is exactly what PR #6 already contains) into this fork's `main` line, resolve the 10 real merge conflicts, and re-patch the 4 behavior regressions upstream silently introduced — so the result is safe to land instead of PR #6, which cannot be merged as-is (`mergeable: CONFLICTING`) and, if force-merged blindly, would silently reintroduce 4 already-fixed bugs.

**Architecture:** Standard 3-way `git merge upstream/main` on the local branch `Wenjix/sync-pr-upstream-main` (currently identical to `origin/main`). Conflicts split into two classes: (a) generated data-catalog artifacts — resolved by re-running the project's own `sync-data` pipeline rather than hand-editing JSON, and (b) hand-authored source (CSS/TSX/test) — resolved by combining both sides' intent. The merge commit lands first (an honest record of upstream's state), then a second commit restores the 4 regressions as a distinct, reviewable fix.

**Tech Stack:** Next.js 16 / React 19 app in `web/`, `pnpm` workspace, `vitest` for tests, TypeScript `tsc --noEmit` for typecheck.

## Global Constraints

- Work happens in the existing worktree at `/Users/wenjiefu/orca/workspaces/Agent-Machines/ling`, on the existing local branch `Wenjix/sync-pr-upstream-main` (no new worktree needed — this branch was already created for this purpose and currently equals `origin/main` at `ecb0ed44381be0cb1b88898d797cc3840bea5a14`).
- Remotes: `origin` = `Wenjix/Agent-Machines` (the fork), `upstream` = `Kevin-Liu-01/Agent-Machines`. Both are already configured and fetched.
- Merge base of `origin/main` and `upstream/main`: `e6a7742d18da32935bbaebe209b93636efd87ceb`.
- Run all `pnpm` commands from the repo root as `pnpm --dir web run <script>` (the `pnpm-lock.yaml` lives in `web/`).
- This repo has **no existing unit tests for Next.js route handlers** (`web/app/api/**/route.ts`) or for `web/lib/dashboard/provision.ts` — grep confirms zero `*.test.ts` files under `web/app/api`, and nothing references `createMachineForConfig`. Per "follow established patterns," Tasks 6, 7, and 9 do **not** invent new route-handler test infrastructure from scratch; they verify via `tsc --noEmit`, the existing `vitest` suite (must stay green), and `next build`, matching the codebase's actual testing footprint.
- Because this is a `git merge` (not a sequence of independent feature commits), conflict-resolution tasks (1–4) each end with `git add <file>` to mark the conflict resolved, **not** a commit — you cannot commit a merge while any path is still unmerged. The merge commit itself happens once, at the end of Task 5, after every conflict is resolved.
- `pnpm --dir web run typecheck` and `pnpm --dir web run build` both invoke `scripts/sync-data.mjs` (directly, or via the `prebuild` hook), which does a **live** network fetch of the Cursor Marketplace catalog into `knowledge/` and `web/data/`. This is NOT guaranteed to reproduce Task 1's committed snapshot byte-for-byte — real content can drift between runs (observed in practice: ~70 lines of drift across 6 files after Tasks 6/7 each ran `typecheck` once). Task 1's regeneration is the only deliberate, reviewed sync point for this data; any task that runs `typecheck` or `build` after Task 5's merge commit must check `git status` afterward and `git checkout HEAD -- knowledge/ web/data/ web/lib/platform/harness-counts.ts` to discard incidental drift before staging/committing anything (Tasks 8 and 9 have this step built in).
- Do not `git push` or open a PR (Task 10) without the user's explicit go-ahead in that moment — this is a visible, hard-to-reverse action reviewed separately from the rest of this plan.

---

### Task 1: Start the merge; resolve the 7 generated-data-catalog conflicts

**Files:**
- Modify (merge conflict, resolved by regeneration): `knowledge/cursor-marketplace-registry.json`, `knowledge/cursor-plugins.json`, `knowledge/packages.json`, `web/data/cursor-marketplace-registry.json`, `web/data/cursor-plugins.json`, `web/data/packages.json`, `web/data/memory-default.json`

**Interfaces:**
- Produces: a merge in progress (`MERGE_HEAD` set to `upstream/main`) with these 7 paths no longer unmerged; all other files either auto-merged by git or still conflicted (handled in Tasks 2–4).

These 7 files are 100% generated artifacts. `web/scripts/sync-data.mjs` (already present on both sides, unchanged) regenerates every one of them deterministically from source — `sync-cursor-plugins.mjs` produces the 6 `cursor-marketplace-registry` / `cursor-plugins` / `packages` files (from a live Cursor Marketplace API call, falling back to whatever's already on disk if the network call fails), and `sync-memory.mjs` produces `web/data/memory-default.json` from the `knowledge/` persona docs. Hand-merging their diffs is pointless busywork the project already solved (see commit `336a7eb`, "sync Cursor marketplace catalog + package/memory data").

- [ ] **Step 1: Start the merge**

```bash
git fetch upstream main
git fetch origin main
git merge upstream/main -m "Merge upstream/main (Kevin-Liu-01/Agent-Machines @ 2407ce598) into sync branch"
```

Expected: merge stops with conflicts. Confirm the conflict set matches expectations:

```bash
git diff --name-only --diff-filter=U
```

Expected output (order may vary), exactly these 10 paths:
```
knowledge/cursor-marketplace-registry.json
knowledge/cursor-plugins.json
knowledge/packages.json
web/app/globals.css
web/components/dashboard/MachinesPanel.tsx
web/data/cursor-marketplace-registry.json
web/data/cursor-plugins.json
web/data/memory-default.json
web/data/packages.json
web/lib/packages/packages.test.ts
```

If the set differs, stop and re-diagnose before continuing (something upstream or origin changed since this plan was written).

- [ ] **Step 2: Pick a placeholder side for the 7 generated files, then regenerate**

```bash
git checkout --theirs \
  knowledge/cursor-marketplace-registry.json \
  knowledge/cursor-plugins.json \
  knowledge/packages.json \
  web/data/cursor-marketplace-registry.json \
  web/data/cursor-plugins.json \
  web/data/packages.json \
  web/data/memory-default.json

pnpm --dir web run sync-data
```

`sync-data.mjs` also touches `web/lib/platform/harness-counts.ts`, `web/data/skills.json`, `web/data/mcps-catalog.json`, `web/data/defaults.json`, `web/data/presets.json` — none of those were merge conflicts, so this just refreshes them consistently; that's expected and correct.

If `sync-data` prints `sync-cursor-plugins: API fetch failed` (no network in this environment), it keeps the `--theirs` (upstream, freshly-synced 2026-06-30) content for those 6 files — that's an acceptable fallback; re-run `pnpm --dir web run sync-data` later once network is available to refresh again.

- [ ] **Step 3: Mark resolved**

```bash
git add knowledge/cursor-marketplace-registry.json knowledge/cursor-plugins.json knowledge/packages.json \
  web/data/cursor-marketplace-registry.json web/data/cursor-plugins.json web/data/packages.json \
  web/data/memory-default.json web/lib/platform/harness-counts.ts \
  web/data/skills.json web/data/mcps-catalog.json web/data/defaults.json web/data/presets.json
git diff --name-only --diff-filter=U
```

Expected: the 7 files are gone from the unmerged list; only `web/app/globals.css`, `web/components/dashboard/MachinesPanel.tsx`, `web/lib/packages/packages.test.ts` remain.

---

### Task 2: Resolve the `web/app/globals.css` conflict

**Files:**
- Modify: `web/app/globals.css`

Origin's only change to this file is a pure append at the very end (a `dial-node-breathe` / `dial-stream-dot` animation block for the Living Radial Fleet dial). Upstream's changes are scattered through the middle of the file (new motion tokens, `.ret-footer-glass-word`, `.ret-pressable`, `.ret-mega-menu`, etc.) and, incidentally, a change right at the same end-of-file region (dropping a trailing blank line) — that's the only part that overlaps and conflicts; everything else auto-merges cleanly and needs no attention.

- [ ] **Step 1: Take upstream's full file, since none of origin's changes overlap except the tail**

```bash
git show upstream/main:web/app/globals.css > web/app/globals.css
```

- [ ] **Step 2: Append origin's fleet-dial block to the end of the file**

Append exactly this to the end of `web/app/globals.css` (one blank line before it, matching the file's existing style):

```css

/* ── Fleet dial: node breathing (liveness tied to load) ── */
@keyframes fleet-node-breathe {
	0%,
	100% {
		transform: scale(1);
	}
	50% {
		transform: scale(calc(1 + var(--breath-amp, 0.05)));
	}
}
.dial-node-breathe {
	animation: fleet-node-breathe var(--breath-dur, 5s) ease-in-out infinite;
}

/* ── Fleet dial: boot-stream particle pulse ── */
@keyframes fleet-stream-pulse {
	0%,
	100% {
		opacity: 0.15;
		transform: translate(-50%, -50%) scale(0.7);
	}
	50% {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
	}
}
.dial-stream-dot {
	animation: fleet-stream-pulse 1.8s ease-in-out infinite;
	animation-delay: var(--stream-delay, 0s);
}

@media (prefers-reduced-motion: reduce) {
	.dial-node-breathe,
	.dial-stream-dot {
		animation: none;
	}
}
```

- [ ] **Step 3: Verify both sides' additions are present, then mark resolved**

```bash
grep -c "ret-footer-glass-word" web/app/globals.css   # expect: 4 (upstream's addition present)
grep -c "dial-node-breathe" web/app/globals.css       # expect: 2 (origin's addition present)
git add web/app/globals.css
```

---

### Task 3: Resolve the `web/components/dashboard/MachinesPanel.tsx` conflict

**Files:**
- Modify: `web/components/dashboard/MachinesPanel.tsx`

**Interfaces:**
- Consumes: `FleetModeToggle`, `type FleetMode` from `@/components/dashboard/fleet-dial/FleetModeToggle`; `mode`, `selectMode`, `view`, `selectView`, `showProvision`, `setShowProvision` — all already defined earlier in this same file by origin's Living Radial Fleet work (untouched by this task).

Only **one** hunk in this file actually conflicts: the "Quick provision controls" header block, where origin added the `FleetModeToggle` + conditional `ViewToggle` and upstream independently added mobile-responsive Tailwind classes to the same wrapper `<div>`s and buttons. Every other upstream hunk in this file (the `break-words` classes on the error/result text, `w-full sm:w-auto` on the `QuickProvisionForm` buttons, `min-h-10 min-w-0` on `EditField`'s input) auto-merges with no conflict — **do not touch those**, they'll already be correct after `git merge`.

- [ ] **Step 1: Locate the conflict**

```bash
grep -n "<<<<<<<\|=======\|>>>>>>>" web/components/dashboard/MachinesPanel.tsx
```

Expected: one conflict block, inside the `{/* Quick provision controls */}` section (search for that comment to confirm you're looking at the right block).

- [ ] **Step 2: Replace the whole conflicted block**

Replace everything from `<<<<<<< HEAD` through `>>>>>>> upstream/main` (the full `{/* Quick provision controls */} { !loading ? ( ... ) : null }` block) with:

```tsx
			{/* Quick provision controls */}
			{!loading ? (
				<div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
					<div className="flex min-w-0 flex-wrap items-center gap-3">
						<h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
							Fleet
						</h2>
						<FleetModeToggle mode={mode} onChange={selectMode} />
						{mode === "existing" ? (
							<ViewToggle view={view} onChange={selectView} />
						) : null}
					</div>
					<div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:items-center">
						<ReticleButton
							variant="primary"
							size="sm"
							onClick={() => setShowProvision((v) => !v)}
							className="w-full sm:w-auto"
						>
							{showProvision ? "Cancel" : "+ New machine"}
						</ReticleButton>
						<ReticleButton
							as="a"
							href="/dashboard/setup"
							variant="ghost"
							size="sm"
							className="w-full sm:w-auto"
						>
							Setup wizard
						</ReticleButton>
					</div>
				</div>
			) : null}
```

This keeps origin's `FleetModeToggle` / conditional `ViewToggle` and layers upstream's responsive classes (`min-w-0`, mobile `flex-col`→`sm:flex-row`, `w-full sm:w-auto` on both buttons) on top.

- [ ] **Step 3: Verify no markers remain, mark resolved**

```bash
grep -n "<<<<<<<\|=======\|>>>>>>>" web/components/dashboard/MachinesPanel.tsx
```

Expected: no output (empty). Then:

```bash
git add web/components/dashboard/MachinesPanel.tsx
```

---

### Task 4: Resolve the `web/lib/packages/packages.test.ts` conflict

**Files:**
- Modify: `web/lib/packages/packages.test.ts`

This conflict is a fixture-freshness fight the fork already won: upstream hardcodes the `stripe` skill-id list (adding `"stripe-directory"`), which is exactly the kind of hardcoding that breaks every time the catalog is regenerated (see Task 1). Origin's commit `7b60c85` ("derive stripe fixture from catalog so it survives data syncs") replaced the hardcoded list with a dynamic `findPackage("stripe")` lookup — `findPackage` is already imported at the top of this file (`from "./catalog"`). Origin's version is a strict improvement and needs nothing from upstream's side.

- [ ] **Step 1: Take origin's (current HEAD) version wholesale**

```bash
git checkout --ours web/lib/packages/packages.test.ts
git add web/lib/packages/packages.test.ts
```

- [ ] **Step 2: Confirm no conflicts remain anywhere**

```bash
git diff --name-only --diff-filter=U
```

Expected: empty output.

---

### Task 5: Complete the merge commit

**Files:** none (git operation only)

- [ ] **Step 1: Confirm the merge is fully staged**

```bash
git status
```

Expected: `All conflicts fixed but you are still merging.` with no files under "Unmerged paths".

- [ ] **Step 2: Commit the merge**

```bash
git commit --no-edit
```

This reuses the message from Task 1 Step 1 (`Merge upstream/main (Kevin-Liu-01/Agent-Machines @ 2407ce598) into sync branch`).

- [ ] **Step 3: Sanity-check the result**

```bash
git log --oneline -1
git show --stat HEAD | head -20
```

Expected: a merge commit with two parents, touching roughly 234 files (matches PR #6's `changedFiles` count).

---

### Task 6: Restore the 3 stripped guard/status-code regressions

**Files:**
- Modify: `web/app/api/dashboard/metrics/collect/route.ts`
- Modify: `web/app/api/dashboard/terminal/session/route.ts`
- Modify: `web/app/api/dashboard/terminal/stream/route.ts`

**Interfaces:**
- Consumes: `isMachineRunningCached` from `@/lib/dashboard/machine-running-cache` (already exists on `upstream/main`, just no longer imported by these two route files — this task re-imports it, doesn't recreate it).

These 3 files had **zero** merge conflicts (neither fork's `main` nor this merge touched them independently), so after Task 5 they read exactly as `upstream/main` wrote them — including 3 confirmed regressions flagged by Devin AI's review of PR #6: a rate-limit response that silently returns HTTP 200 instead of 429, and two terminal routes that dropped their early "machine is offline" 503 guard and downgraded their error responses to always-200. None of this was an intentional redesign — no replacement offline-detection was added, so this is a straightforward restore.

- [ ] **Step 1: Fix `web/app/api/dashboard/metrics/collect/route.ts`**

Find:
```ts
		return Response.json(
			{
				ok: false,
				error: "too_soon",
				message: `Last collection was ${Math.round((now - prev) / 1000)}s ago. Wait at least 15s.`,
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
```

Replace with:
```ts
		return Response.json(
			{
				ok: false,
				error: "too_soon",
				message: `Last collection was ${Math.round((now - prev) / 1000)}s ago. Wait at least 15s.`,
			},
			{ status: 429, headers: { "Cache-Control": "no-store" } },
		);
```

- [ ] **Step 2: Fix `web/app/api/dashboard/terminal/session/route.ts`**

Replace the entire file with:

```ts
/**
 * POST /api/dashboard/terminal/session
 *
 * Ensure the per-machine interactive tmux console exists (installing tmux
 * if needed), then return the current screen snapshot + the log byte
 * offset so the client can paint immediately and stream only new output.
 */

import { execOnMachine } from "@/lib/dashboard/exec";
import { isMachineRunningCached } from "@/lib/dashboard/machine-running-cache";
import {
	CONSOLE_SESSION,
	capturePaneCommand,
	clampDim,
	cursorPosCommand,
	ensureSessionCommand,
	logSizeCommand,
	resizeCommand,
} from "@/lib/dashboard/terminal-session";
import { getEffectiveUserId } from "@/lib/user-config/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const SNAP = "__AM_SNAP__";
const CUR = "__AM_CUR__";
const OFF = "__AM_OFF__";

type Body = { machineId?: string; cols?: number; rows?: number };

export async function POST(request: Request): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const body = (await request.json().catch(() => ({}))) as Body;
	const machineId = typeof body.machineId === "string" ? body.machineId : undefined;
	const cols = clampDim(body.cols, 20, 500, 120);
	const rows = clampDim(body.rows, 5, 200, 32);

	if (!(await isMachineRunningCached(machineId))) {
		return Response.json(
			{ ok: false, error: "machine_offline", message: "Machine is not awake. Wake it first." },
			{ status: 503, headers: { "Cache-Control": "no-store" } },
		);
	}

	// Resize an existing pane to the client's dims BEFORE capturing, so the
	// snapshot height matches xterm and the captured cursor row is valid in
	// xterm coordinates.
	const cmd = [
		ensureSessionCommand(cols, rows),
		resizeCommand(cols, rows),
		`printf '\\n${SNAP}\\n'`,
		capturePaneCommand(),
		`printf '\\n${CUR}\\n'`,
		cursorPosCommand(),
		`printf '\\n${OFF}\\n'`,
		logSizeCommand(),
	].join("\n");

	try {
		const res = await execOnMachine(cmd, { machineId, timeoutMs: 75_000 });
		const out = res.stdout;
		if (out.includes("AM_CONSOLE_NO_TMUX")) {
			return Response.json(
				{
					ok: false,
					error: "no_tmux",
					message: "tmux is unavailable and could not be installed on this machine.",
				},
				{ status: 501, headers: { "Cache-Control": "no-store" } },
			);
		}
		const [readyPart, afterSnap = ""] = out.split(SNAP);
		const [snapshot = "", afterCur = ""] = afterSnap.split(CUR);
		const [cursorStr = "", offStr = ""] = afterCur.split(OFF);
		if (!readyPart.includes("AM_CONSOLE_READY")) {
			return Response.json(
				{
					ok: false,
					error: "session_failed",
					message: out.slice(0, 400) || res.stderr.slice(0, 400) || "console session failed",
				},
				{ status: 502, headers: { "Cache-Control": "no-store" } },
			);
		}
		const offset = Number.parseInt(offStr.trim(), 10) || 0;
		const [cy, cx] = cursorStr.trim().split(/\s+/).map((n) => Number.parseInt(n, 10));
		return Response.json({
			ok: true,
			session: CONSOLE_SESSION,
			cols,
			rows,
			offset,
			snapshot: snapshot.replace(/^\n/, ""),
			cursorRow: Number.isFinite(cy) ? cy : 0,
			cursorCol: Number.isFinite(cx) ? cx : 0,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "session create failed";
		return Response.json(
			{ ok: false, error: "session_failed", message },
			{ status: 502, headers: { "Cache-Control": "no-store" } },
		);
	}
}
```

(This restores the offline guard and the `501`/`502`/`503` status codes while **keeping** upstream's `ok: false` fields and `Cache-Control: no-store` headers — both changes are good, only the status codes were wrong to drop.)

- [ ] **Step 3: Fix `web/app/api/dashboard/terminal/stream/route.ts`**

Add the import (alongside the existing ones, alphabetically before `SSE_HEADERS`):
```ts
import { isMachineRunningCached } from "@/lib/dashboard/machine-running-cache";
```

Find:
```ts
	const url = new URL(request.url);
	const machineId = url.searchParams.get("machineId")?.trim() || undefined;
	const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

	const stream = new ReadableStream({
```

Replace with:
```ts
	const url = new URL(request.url);
	const machineId = url.searchParams.get("machineId")?.trim() || undefined;
	const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

	if (!(await isMachineRunningCached(machineId))) {
		return Response.json(
			{ error: "machine_offline", message: "Machine is not awake." },
			{ status: 503 },
		);
	}

	const stream = new ReadableStream({
```

Leave the rest of the file — including the new `isExpectedConsoleStreamEnd` handling and structured `terminal_stream_reconnect` / `terminal_stream_failed` logging upstream added — untouched; that part is a genuine improvement, not a regression.

- [ ] **Step 4: Typecheck**

```bash
pnpm --dir web run typecheck
```

Expected: exits 0, no errors in these 3 files (or anywhere else).

---

### Task 7: Fix the environment-profile auto-fallback in `provision.ts`

**Files:**
- Modify: `web/lib/dashboard/provision.ts`

**Interfaces:**
- No signature changes — `CreateMachineOpts` and `createMachineForConfig` keep the exact shape upstream defined.

Unlike Task 6, this isn't a stripped guard — it's a new upstream feature (environment profiles) with a footgun default: when the caller passes no `environmentProfileId` (the SDK path, `am.create()`, has no way to pass one at all), `createMachineForConfig` currently falls back to `config.environmentProfiles[0]?.id`, silently injecting that profile's env vars into every SDK-provisioned machine for any user who has saved profiles. The dashboard's `DeployAndTalk` component always passes an explicit `environmentProfileId` from a dropdown, so it's unaffected either way — only the implicit "no selection" path changes.

- [ ] **Step 1: Change the fallback**

Find (in `createMachineForConfig`):
```ts
	const environmentProfileId =
		typeof opts.environmentProfileId === "string" &&
		config.environmentProfiles.some((p) => p.id === opts.environmentProfileId)
			? opts.environmentProfileId
			: (config.environmentProfiles[0]?.id ?? null);
```

Replace with:
```ts
	const environmentProfileId =
		typeof opts.environmentProfileId === "string" &&
		config.environmentProfiles.some((p) => p.id === opts.environmentProfileId)
			? opts.environmentProfileId
			: null;
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --dir web run typecheck
```

Expected: exits 0.

---

### Task 8: Full verification and commit the regression fixes

**Files:** none new (verification + one commit covering Tasks 6–7)

- [ ] **Step 1: Run the full test suite**

```bash
pnpm --dir web run test
```

Expected: all tests pass, including `web/lib/packages/packages.test.ts` (Task 4) — this is the test that would have caught a catalog/fixture mismatch, so a green run here is meaningful confirmation Task 1's regeneration and Task 4's resolution are consistent with each other.

- [ ] **Step 2: Run the production build**

```bash
pnpm --dir web run build
```

Expected: exits 0. Note: this also re-runs `sync-data` via the `prebuild` hook, which does a **live** network fetch of the Cursor Marketplace catalog — it is not guaranteed to be byte-identical to Task 1's run (real content can drift between runs, not just key ordering; this has been observed in practice during this plan's execution). Step 3 below accounts for that.

- [ ] **Step 3: Discard any incidental data-file drift from re-running sync-data**

```bash
git status --short
```

Task 1's regeneration was the single deliberate, reviewed sync point for these files — they should not silently drift again just because Step 1/2 happened to invoke `sync-data.mjs`. If `git status --short` shows anything modified beyond the 4 files below, revert it:

```bash
git checkout HEAD -- knowledge/ web/data/ web/lib/platform/harness-counts.ts
```

(Safe even if some of those paths show no diff — `checkout` on an unmodified path is a no-op.)

- [ ] **Step 4: Review the diff before committing**

```bash
git diff --stat
git diff -- web/app/api/dashboard/metrics/collect/route.ts \
  web/app/api/dashboard/terminal/session/route.ts \
  web/app/api/dashboard/terminal/stream/route.ts \
  web/lib/dashboard/provision.ts
```

Confirm the diff against `HEAD` (the merge commit from Task 5) touches exactly these 4 files, matching Tasks 6–7, and nothing else.

- [ ] **Step 5: Commit**

```bash
git add web/app/api/dashboard/metrics/collect/route.ts \
  web/app/api/dashboard/terminal/session/route.ts \
  web/app/api/dashboard/terminal/stream/route.ts \
  web/lib/dashboard/provision.ts
git commit -m "fix(web): restore offline guards, rate-limit status, and explicit env-profile selection lost in upstream merge

Devin AI flagged these on PR #6: the terminal session/stream routes and
metrics/collect route silently downgraded their error responses to
always-HTTP-200 (relying on a body.ok field instead), and dropped the
early isMachineRunningCached offline check entirely. Also tightens
createMachineForConfig so an unspecified environmentProfileId no longer
silently falls back to the first saved profile (affects the SDK path,
which has no field to opt out with)."
```

---

### Task 9: Fix server-side credential exfiltration via user-controlled base URL in `models/route.ts`

**Files:**
- Modify: `web/app/api/dashboard/models/route.ts`

**Interfaces:**
- No signature changes — `sourceFromProfile`, `CatalogSource`, and all callers keep their exact shape. Adds one new private helper, `isTrustedVercelGatewayHost(baseUrl: string): boolean`, used only within this file.

This file doesn't exist on `origin/main` before this merge — it's wholly new from `upstream/main`, and it ships with a real multi-tenant credential-exfiltration bug (found by a background security review during this plan's execution, not part of the original PR #6 Devin findings). `GatewayProfile.baseUrl` (`web/lib/user-config/schema.ts:166`) is user-editable — any user can point their gateway profile at an arbitrary host. In `sourceFromProfile`'s `"vercel-ai-gateway"` branch, when the user hasn't set their own `apiKey` and `config.aiProviderKeys.vercelAiGateway` is also unset, the function falls back to sending **server-side platform credentials** (`process.env.AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN`, `AI_GATEWAY_KEY`) as the `Authorization`/`x-api-key` header of a request to that user-supplied `baseUrl`. A user who sets their profile's base URL to their own server receives the platform's shared AI Gateway credentials (and Vercel's OIDC identity token) directly.

Verified this is the only vulnerable path: `sourceFromRouter`'s `"vercelAiGateway"` case has the identical env-var fallback chain, but every one of its 6 call sites in this file passes a `baseUrl` that is either the `UPSTREAM_BASE_URL.vercelAiGateway` constant directly, or `preset.baseUrl` from the fixed built-in `ROUTER_PRESETS` array (`web/lib/agents/upstreams.ts`) — never user input — so it does not need this guard.

Fix scope is deliberately narrow: gate the env-var fallback behind a same-host check against the trusted `UPSTREAM_BASE_URL.vercelAiGateway` host. This does not remove `VERCEL_OIDC_TOKEN` as a fallback for the trusted host — only restricts *which host* ever receives any of the three server credentials. Whether `VERCEL_OIDC_TOKEN` should be used this way at all, even for the trusted host, is a separate design question outside this task's scope.

- [ ] **Step 1: Add the trusted-host check and gate the credential fallback**

Find (in `web/app/api/dashboard/models/route.ts`):
```ts
function sourceFromProfile(
	profile: GatewayProfile,
	config: UserConfig,
): CatalogSource {
	if (profile.kind === "vercel-ai-gateway") {
		return {
			id: profile.id,
			label: profile.name || "Vercel AI Gateway",
			baseUrl: profile.baseUrl ?? UPSTREAM_BASE_URL.vercelAiGateway,
			apiKey:
				profile.apiKey ??
				config.aiProviderKeys.vercelAiGateway ??
				process.env.AI_GATEWAY_API_KEY?.trim() ??
				process.env.VERCEL_OIDC_TOKEN?.trim() ??
				process.env.AI_GATEWAY_KEY?.trim() ??
				"",
		};
	}
	const baseUrl = profile.baseUrl ?? UPSTREAM_BASE_URL.openai;
	return {
		id: profile.id,
		label: profile.name || "OpenAI-compatible",
		baseUrl,
		apiKey: profile.apiKey ?? inferKey(baseUrl, config),
	};
}
```

Replace with:
```ts
function isTrustedVercelGatewayHost(baseUrl: string): boolean {
	try {
		return new URL(baseUrl).hostname === new URL(UPSTREAM_BASE_URL.vercelAiGateway).hostname;
	} catch {
		return false;
	}
}

function sourceFromProfile(
	profile: GatewayProfile,
	config: UserConfig,
): CatalogSource {
	if (profile.kind === "vercel-ai-gateway") {
		const baseUrl = profile.baseUrl ?? UPSTREAM_BASE_URL.vercelAiGateway;
		return {
			id: profile.id,
			label: profile.name || "Vercel AI Gateway",
			baseUrl,
			apiKey:
				profile.apiKey ??
				config.aiProviderKeys.vercelAiGateway ??
				(isTrustedVercelGatewayHost(baseUrl)
					? (process.env.AI_GATEWAY_API_KEY?.trim() ??
						process.env.VERCEL_OIDC_TOKEN?.trim() ??
						process.env.AI_GATEWAY_KEY?.trim())
					: undefined) ??
				"",
		};
	}
	const baseUrl = profile.baseUrl ?? UPSTREAM_BASE_URL.openai;
	return {
		id: profile.id,
		label: profile.name || "OpenAI-compatible",
		baseUrl,
		apiKey: profile.apiKey ?? inferKey(baseUrl, config),
	};
}
```

- [ ] **Step 2: Typecheck and run the full test suite**

```bash
pnpm --dir web run typecheck
pnpm --dir web run test
```

Expected: both exit 0. (This repo has no existing route-handler tests — per this plan's Global Constraints, verify via typecheck + the full suite + build, not new test infrastructure, consistent with Tasks 6–7.)

- [ ] **Step 3: Run the production build**

```bash
pnpm --dir web run build
```

Expected: exits 0. Note: both this and Step 2's `typecheck` invoke `sync-data.mjs` (via `prebuild`/directly), which does a live network fetch and is not guaranteed byte-identical to Task 1's committed snapshot — see Step 4.

- [ ] **Step 4: Discard any incidental data-file drift from re-running sync-data**

```bash
git status --short
```

Expect only `web/app/api/dashboard/models/route.ts` modified. If `knowledge/`, `web/data/`, or `web/lib/platform/harness-counts.ts` show as modified too, that's `sync-data.mjs` drifting on its live fetch again, not anything this task should touch — revert it:

```bash
git checkout HEAD -- knowledge/ web/data/ web/lib/platform/harness-counts.ts
```

- [ ] **Step 5: Commit as its own change, separate from Tasks 6–7's commit**

```bash
git add web/app/api/dashboard/models/route.ts
git commit -m "fix(web): restrict AI Gateway credential fallback to the trusted host

web/app/api/dashboard/models/route.ts is new from the upstream merge and
let a user-controlled gateway-profile baseUrl receive server-side platform
credentials (AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN, AI_GATEWAY_KEY) whenever
the user hadn't set their own apiKey. Found by background security review,
not part of PR #6. Gates the fallback behind a same-host check against the
trusted UPSTREAM_BASE_URL.vercelAiGateway host; sourceFromRouter's identical
fallback chain is untouched since all its call sites already pass a fixed,
trusted baseUrl, never user input."
```

---

### Task 10: Push and open a PR (requires explicit user go-ahead)

**Files:** none

PR #6's head branch (`Kevin-Liu-01/Agent-Machines:main`) lives in a fork we don't control, so none of the work above can be pushed onto PR #6 itself. The deliverable is a new branch/PR against `origin/main` (`Wenjix/Agent-Machines`); PR #6 should then be closed as superseded.

- [ ] **Step 1: Confirm with the user before pushing anything.** This is a visible, hard-to-reverse action (new remote branch + PR, and closing PR #6) — do not run the commands below without explicit confirmation in the moment, even though this plan was approved.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin Wenjix/sync-pr-upstream-main
gh pr create --repo Wenjix/Agent-Machines \
  --base main --head Wenjix/sync-pr-upstream-main \
  --title "Sync upstream (Kevin-Liu-01/Agent-Machines @ 2407ce598) + fix regressions" \
  --body "Supersedes #6 (which is CONFLICTING and can't be pushed to — its head branch lives in the upstream fork). Same upstream content, but with the 10 real merge conflicts resolved, 4 Devin-flagged regressions (dropped offline guards, dropped rate-limit/error status codes, env-profile auto-fallback footgun) fixed, and one credential-exfiltration bug (user-controlled gateway baseUrl could receive server-side AI Gateway credentials) fixed — found by background security review during this branch's preparation, not part of PR #6. See commit history for details."
```

- [ ] **Step 3: Close PR #6 as superseded (only after the new PR above is confirmed open)**

```bash
gh pr close 6 --repo Wenjix/Agent-Machines --comment "Superseded by <new PR URL> — same upstream sync, with the merge conflicts resolved and the regressions this PR would have silently introduced fixed."
```

## Self-Review

**Spec coverage:** All 10 real conflicts (Task 1: 7 generated files; Task 2: globals.css; Task 3: MachinesPanel.tsx; Task 4: packages.test.ts) and all 4 Devin-flagged regressions (Task 6: 3 files; Task 7: provision.ts) from the PR review are covered. Verification (typecheck/test/build) gates both the merge (Task 5 implicitly, verified in Task 8) and the fixes (Task 8). Task 9 fixes a credential-exfiltration bug discovered mid-execution in a file upstream newly introduced (`web/app/api/dashboard/models/route.ts`, not present on `origin/main` before this merge). Push/PR (Task 10) is explicitly gated on user confirmation per this session's operating rules.

**Placeholder scan:** No TBD/TODO; every code step shows complete, exact replacement text derived from the actual `upstream/main` and `origin/main` file contents at the time this plan was written.

**Type consistency:** `CreateMachineOpts`/`createMachineForConfig` signature unchanged in Task 7. `FleetModeToggle`/`selectMode`/`mode` names in Task 3 match origin's existing declarations elsewhere in `MachinesPanel.tsx` (untouched by this plan). `isMachineRunningCached` import path (`@/lib/dashboard/machine-running-cache`) is identical across Task 6 Steps 2–3, matching the module's real location (confirmed to still exist on `upstream/main`).
