# Implementation Spec — Self-Learning Loop (Loop 0 + Loop A; Loop B sketched)

*Companion to `self-learning-loop.md` (the architecture). This is the build spec for the
first shippable increment: the trace substrate (Loop 0) and the routing bandit (Loop A) in
full detail, with harness curation (Loop B) sketched. Ground-truthed against the codebase;
file references throughout.*

## Context

Two findings about the real architecture shaped every decision:

- **The control plane already observes headless outcomes.** The cron tick
  (`/api/internal/cron/tick` → `tickUser`) runs server-side and `runCronOnMachine` already
  parses `AM_CRON_EXIT:<code>` + start/finish timing from stdout
  (`web/lib/crons/service.ts:97`). → Loop 0 for the headless slice needs **zero box changes**.
- **The bandit's decision point is provisioning; rewards accrue later.** A human deploys a
  worker with arm = {runtime × substrate × model × loadout}; that worker then runs cron
  tasks, each emitting a trace tagged with that arm + outcome. So "explore headless / exploit
  interactive" = greedy recommendation at interactive provision + a librarian-driven
  exploration driver that provisions experimental workers for under-sampled cells.

**Decisions (resolved):**

| # | Decision | Choice |
|---|---|---|
| 1 | Spec scope | Loop 0 + A in full; Loop B sketched |
| 2 | Trace slice + transport | Headless (cron) only; control-plane emit from `tickUser` |
| 3 | Exploration vs human choice | Explore headless (exploration driver); exploit (greedy) at interactive provision |
| 4 | Loop B blast radius | Global merge to main + per-worker activation + canary reload |
| 5 | `task_class` v1 | Coarse declared/heuristic from cron metadata; context-free bandit fallback |
| 6 | Reward objective | Weighted scalar `success − λ·cost − μ·latency`, success-first, per-deploy override |
| 7 | Policy store | Batch-published artifact (snapshot in Supabase), Thompson-sampled at provision |
| 8 | Loop B gate | Always open a PR; human-merge for v1 |
| 9 | Model axis | Curated per-runtime set (~2–4 models each), not the full catalog |
| 10 | Exploration in v1 | Passive only (greedy + seeded priors); cost-bounded active driver is a fast-follow |
| 11 | `task_class` use | Derive now + store in every trace, but **advisory** — per-class posteriors used only above a sample threshold τ, else global |

**Privacy invariant (non-negotiable):** the global policy artifact is computed only from
non-PII columns (arm, task_class, success, cost, latency). Never prompt text, never memory.
`tenant_hash` is a hashed context feature, never a join to content. Per-tenant
memory/persona/creds never enter any global table.

---

## Architecture (this increment)

```
 cron tick (server) ──emit──> run_traces (Supabase)        [LOOP 0]
                                   │
            recompute job ─reads──┘──writes──> routing_policy snapshot   [LOOP A: learn]
                                                     │
 DeployAndTalk ──recommend(greedy)──> provision route ─reads policy─> sample arm  [LOOP A: act]
 exploration driver ─provisions experimental workers for sparse cells─┘
```

All new code lives under a new `web/lib/learning/` module + two new API routes + one
migration. Loop A's "improver" is a **server-side stats job** (pure math, no LLM). Loop B's
proposer (sketched) is the only part that needs an LLM.

---

## Loop 0 — Trace sink (FULL)

### Data model — new migration `web/supabase/migrations/005_run_traces.sql`

Mirror the `machine_metrics` conventions from `001_initial.sql` (bigint identity PK,
`timestamptz default now()`, composite indexes, service-role writes).

```sql
create table if not exists run_traces (
  id bigint generated always as identity primary key,
  user_id text not null,
  machine_id text not null,
  run_id text not null,              -- cron.id + tick timestamp (stable per run)
  source text not null default 'cron',
  task_class text not null default 'unknown',
  runtime text not null,             -- agentKind
  substrate text not null,           -- providerKind
  model text not null,
  router_id text,                    -- gatewayProfileId/preset; null for codex/claude-code
  loadout_hash text not null,
  memory_bundle_id text,
  tenant_hash text,                  -- sha256(user_id); context feature only
  success boolean,                   -- exit_code == 0 (cron); null if unknown
  exit_code integer,
  cost_millicents bigint,
  latency_ms integer,
  started_at timestamptz, finished_at timestamptz,
  recorded_at timestamptz not null default now(),
  extra jsonb                        -- {skills:[], errorSignature, cronId}
);
create index idx_run_traces_arm on run_traces (task_class, runtime, substrate, model, recorded_at desc);
create index idx_run_traces_user on run_traces (user_id, machine_id, recorded_at desc);

create table if not exists routing_policy (
  id bigint generated always as identity primary key,
  version integer not null,
  computed_at timestamptz not null default now(),
  weights jsonb not null,            -- {lambdaCost, muLatency, costRange, latRange} per task_class
  posteriors jsonb not null,         -- factorized arm/axis posterior params (see Loop A)
  n_traces integer not null,
  active boolean not null default true
);
create index idx_routing_policy_active on routing_policy (active, version desc);
```
Migrations apply via `supabase db push` (same as 001–004). Writes use `supabaseAdmin()`
(`web/lib/supabase/client.ts`, service-role).

### Emit hook — modify `web/app/api/internal/cron/tick/route.ts`

In `tickUser`, after `results = await Promise.all(due.map(runCronOnMachine...))` and before
the config persist, loop the due crons and emit one trace each (best-effort, never throws
into the tick). The runtime/substrate/model/router come from the cron's `MachineRef`
(`providerKind`, `agentKind`, `model`, `gatewayProfileId`); `exit_code`/timing from the
`runCronOnMachine` result; cost from the existing spec×duration logic in
`web/lib/metrics/collector.ts`.

### New files
- `web/lib/learning/trace.ts` — `RunTrace` type + `emitRunTrace(t)` (snake_case insert via `supabaseAdmin()`).
- `web/lib/learning/loadout-hash.ts` — `computeLoadoutHash(bundle, pool)`: `resolveAbilities()` (`web/lib/memory/abilities.ts`) → stable-sort ids → `sha256`. Stable hash of the resolved skill/tool/MCP set.
- `web/lib/learning/task-class.ts` — `deriveTaskClass(cron, machine)`: coarse, deterministic heuristic bucket from the sorted `cron.skills` signature (`code` / `deploy` / `research` / `data` / `unknown`). **Derived now and stored in every trace, but advisory** — the bandit gates on it via τ (see Loop A). **No declared field in v1** (`CronEntry.taskClass` is a later "declare-later" addition), so no `schema.ts` change for task_class in v1.

---

## Loop A — Routing bandit (FULL)

### Arm enumeration — `web/lib/learning/arms.ts`
`enumerateFeasibleArms(config, { models }): Arm[]` where
`Arm = { runtime: AgentKind; substrate: ProviderKind; model: string; routerId: string|null }`.
Reuse the credential gate as the hard filter — do **not** reinvent it:
- `validateAgentCredentials(agentKind, config)` (`web/lib/agents/credentials.ts:158`) prunes infeasible runtimes.
- `agentUpstreamReadiness(agent, routerId, aiConfigured)` + `ROUTER_PRESETS` (`web/lib/agents/upstreams.ts`) enumerate router options — **router axis applies only to hermes/openclaw**; codex/claude-code are native (routerId=null).
- Configured substrates from `config.providers` (`sprites|e2b|vercel|dedalus`).
- `models`: a **curated per-runtime set (~2–4 each)**, not the full router catalog (which would explode the arm space and keep cells sparse forever). Expand as cells fill.

### Bandit model — `web/lib/learning/bandit.ts`
Hierarchical conjugate, factorized to beat sparsity (the doc's "factorize + pool"):
- **Success:** two levels of Beta posterior per arm — a **global** per-arm posterior (always available) and a **per-`task_class`** per-arm posterior. The per-class posterior is used **only once its `(task_class × arm)` cell has ≥ τ samples**; below τ it falls back to global. `task_class` is thus **advisory** — it sharpens routing where there's evidence and is ignored where there isn't. (Generalizes to continuous per-axis shrinkage later; the hard τ threshold is the v1 rule, per the decisions table.)
- **Cost / latency:** Normal posteriors per cell with the same backoff.
- **Seed:** initialize priors from `provider_benchmarks` (migration `003`, already global/non-user) + current hand-set defaults (`config.draft*`). No cold start.
- **Sample:** `sampleArm(arms, policy, {taskClass})` draws θ per arm (Thompson), scores with the reward function, returns argmax. Greedy variant `bestArm()` uses posterior means (for interactive exploit).
- Upgrade path noted: swap to Bayesian logistic / LinUCB over one-hot axis features later; the artifact schema is model-agnostic JSON.

### Reward — `web/lib/learning/reward.ts`
`scalarReward(stats, weights) = successRate − λ·costNorm − μ·latNorm`. Defaults success-first
(`λ, μ` small), cost/latency min-max normalized per `task_class` from ranges stored in the
policy artifact. `weights` overridable per deployment policy (env/config).

### Policy artifact — `web/lib/learning/policy.ts` + recompute job
- `web/app/api/internal/learning/recompute/route.ts` — scheduled job (register like the existing tick: a Vercel cron / external scheduler hitting `/api/internal/...`). Reads recent `run_traces`, runs `updatePosteriors()`, writes a new `routing_policy` row (`active=true`, bump `version`, deactivate prior). Pure server-side math — **this is the Loop A "librarian."**
- `readActivePolicy()` — provision route reads the latest active snapshot (cache-friendly, no per-request recompute).

### Act — integration points
- **Interactive (exploit):** new `web/app/api/dashboard/admin/route-recommendation/route.ts` returns the **greedy** best arm for the user's feasible set + task_class. `web/components/dashboard/DeployAndTalk.tsx` calls it on load, shows a "recommended" banner next to the substrate/agent/router selects (after `<RouterSelect>`), human accepts or overrides. Provision request unchanged otherwise.
- **Provision route:** modify `web/app/api/dashboard/admin/provision-machine/route.ts` so that when the body omits axes, it fills from the **policy** (greedy) instead of only `config.draft*` — the credential gate at line ~117 stays the hard filter, the policy chooses within it. Record the chosen arm on the `MachineRef` so traces join cleanly.
- **Headless exploration driver (explore) — FAST-FOLLOW, not in v1 core.** v1 learns **passively**: greedy recommendations + seeded priors + whatever arms users actually pick, with **zero exploration spend**. The fast-follow adds a cost-bounded driver inside the recompute job that provisions short-lived experimental workers (cheapest substrate, daily $ cap) for the top-k most-uncertain `(arm × task_class)` cells. It never touches user provisions.

---

## Loop B — Harness curation (SKETCH ONLY)

Interfaces and decisions, not full build. Promotions = **PRs to the knowledge git repo**
(`web/lib/platform/runtime.ts` repo/branch); `reload-from-git.sh` pulls them.

- **Propose:** librarian reads `run_traces` failure signatures → authors a diff (bootstrap-recipe fix, SKILL.md, etc.). Needs an LLM (server model call *or* a dogfooded librarian worker — open). Output = inspectable diff + motivating trace.
- **Validate (provisioning-as-test-harness):** provision a cheap E2B box, apply the edit, replay the relevant bootstrap phase(s) in isolation (`runPhase` is state-agnostic — `web/lib/bootstrap/runner.ts:313`) or run the skill's smoke test via `provider.exec` (`ExecResult{stdout,stderr,exitCode}`). Hard-gate on exit status + no-regress vs a held-out corpus of past successful runs. Tier by layer per the architecture doc's table.
- **Promote:** open a PR (new `gh`/octokit helper — none exists today). **Human-merges for v1.** On merge, **canary reload**: librarian box → cohort → fleet. Content is global on main; *activation* stays per-worker via `memoryBundle.skillIds`.
- **Rollback:** revert the commit on main + reload (`POST /api/dashboard/admin/reload`), or reset to prior SHA. Loadout hygiene (reuse-prior, deprecation) governs activation.

---

## New / modified files

**New:** `web/supabase/migrations/005_run_traces.sql`; `web/lib/learning/{trace,loadout-hash,task-class,arms,bandit,reward,policy}.ts`; `web/app/api/internal/learning/recompute/route.ts`; `web/app/api/dashboard/admin/route-recommendation/route.ts`.

**Modified:** `web/app/api/internal/cron/tick/route.ts` (emit traces); `web/app/api/dashboard/admin/provision-machine/route.ts` (consult policy); `web/components/dashboard/DeployAndTalk.tsx` (recommendation banner); `web/lib/dashboard/provision.ts` (record chosen arm on `MachineRef`); cron registration config (add recompute schedule). No `schema.ts` change in v1 (task_class is derived, not declared).

**Reused (do not reinvent):** `supabaseAdmin()`, `validateAgentCredentials`/`agentUpstreamReadiness`/`ROUTER_PRESETS`, `resolveAbilities()`, the metrics cost logic in `collector.ts`, `provider_benchmarks` as prior, `provider.exec`/`runPhase` for Loop B validation.

---

## Build sequence (each step independently shippable + testable)

1. **Migration 005 + `trace.ts` + emit hook.** Ship Loop 0. Verify: run a cron, confirm a `run_traces` row with correct arm/exit/latency.
2. **`loadout-hash.ts` + `task-class.ts`.** Backfill the keying. Verify: hash stable across reloads; task_class deterministic.
3. **`arms.ts` + `bandit.ts` + `reward.ts` (offline).** Unit-test against seeded `provider_benchmarks` + synthetic traces. No prod surface yet.
4. **`policy.ts` + recompute route.** Verify: job writes a `routing_policy` snapshot; `readActivePolicy()` returns it.
5. **`route-recommendation` + DeployAndTalk banner.** Greedy recommendation surfaces; human still chooses. Verify in the UI.
6. **Provision-route policy fill + record arm on MachineRef.** Close the loop: provision → run → trace → recompute → better recommendation.
7. **Exploration driver (cost-bounded) — FAST-FOLLOW, post-v1.** Adds active exploration spend; v1 ships passive (steps 1–6).
8. **Loop B:** separate spec when this is solid.

---

## Verification (end-to-end)

- **Loop 0:** trigger `/api/internal/cron/tick` (or wait a tick) with an existing cron machine; assert a `run_traces` row appears with `success`/`cost_millicents`/`latency_ms`/arm columns populated and `loadout_hash` matching `computeLoadoutHash`.
- **Loop A learn:** seed synthetic traces favoring one substrate for a task_class; run recompute; assert the active `routing_policy` posterior shifts and `bestArm()` returns that substrate.
- **Loop A act:** hit `route-recommendation` for a user with a known credential set; assert it returns only feasible arms and the greedy pick matches the policy; confirm DeployAndTalk renders it.
- **Privacy:** assert the recompute query selects no prompt/memory columns and `routing_policy.posteriors` contains no user-identifying data; `tenant_hash` is a digest.
- **Unit:** `bandit.ts` threshold backoff (a `(task_class × arm)` cell below τ falls back to the global per-arm posterior), `reward.ts` normalization, `arms.ts` credential pruning (codex without OpenAI key → no codex arms).

---

## Settled defaults + remaining open questions

All 11 architecture/mechanism decisions are resolved and baked into the spec above (scope,
trace transport, exploration posture, Loop B blast radius, reward objective, policy store,
Loop B gate, model menu, passive-v1, advisory task_class).

Remaining — leans stated, none blocks build step 1; settle during implementation:

1. **Recompute cadence** — hourly vs on-N-new-traces. *Lean: hourly + on-demand.*
2. **Reward weights + threshold τ** — concrete `λ`, `μ`, and the sample count τ at which a per-class posterior overrides global. *Lean: success ≫ cost > latency; τ ≈ 30–50.*
3. **Loop B librarian form** (sketch-level) — server-side model call vs dogfooded worker for diff authoring. *Deferred to the Loop B spec.*
