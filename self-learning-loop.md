# Self-Learning Loop for Agent Machines — v2

*An architecture revision. v1 framed self-learning as a single six-step
pipeline (observe → extract → propose → validate → promote → route).
Seeing the real Agent Machines architecture — a dual-routing control plane,
a stateless serverless front, and a typed, registry-driven harness — changes
that. v2 splits the pipeline into **two control problems over one shared
observation substrate**, and reshapes validation around what is actually
cheap here (your own provisioning) and what is actually typed (the harness
layers).*

---

## What changed from v1, in one paragraph

The product is a **router** before it is anything else ("OpenRouter for
agents and containers"). That makes *routing intelligence* its own learning
problem with its own feedback regime — explore/exploit, automatically
labeled on every run — which is fundamentally different from *editing the
harness*, which is discrete proposed changes behind a confidence gate.
v1 collapsed these into one loop and put "route better" as step 6. v2 pulls
them apart: **Loop A (routing)** and **Loop B (harness curation)**, sharing
**Loop 0 (observation)**. Two other facts about the architecture do real work
below: the control plane is **stateless serverless** (so the improver must be
out-of-band, not in the request path), and the harness is **typed and
git/registry-backed** (so validation can be tiered by layer, and rollback is
nearly free).

---

## Provenance: the three papers

This revision keeps v1's anchor and selectively borrows from two others.
Stated plainly so the borrowing is auditable:

- **Self-Harness** — arXiv:2606.09498 — *the spine of Loop B.* v1's
  propose → validate → promote → rollback over harness scaffolding is
  structurally Self-Harness's weakness-mining → harness-proposal → validation
  loop. This is the closest mapping and the right anchor.
- **Continual Harness** — arXiv:2605.09998 — *borrowed for Loop B's drift
  control.* Its documented failure modes (the create-and-forget tail;
  regression from freshly authored, un-repaired components) are the evidence
  behind loadout hygiene, and its failure-*signature* clustering is the move
  Loop A reuses to pool sparse cells. Its in-episode refiner is borrowed only
  as a **cautionary tale** — it is exactly the pattern the stateless control
  plane forbids.
- **SIA** — arXiv:2605.27276 — *one structural idea only:* the out-of-band
  librarian / separate-improver. SIA's other lever — updating model weights —
  is deliberately **not** adopted; AM's compounding unit is operational
  knowledge, not weights.

None of the three covers **routing** — their action space is scaffold/weight
editing. Loop A is therefore the part this design invents, and the part most
specific to a product that is a router first.

---

## Core reframe: two loops, one observation substrate

```
                         ┌─────────────────────────────────────────┐
                         │            LOOP 0 — OBSERVE               │
                         │  structured traces from every run        │
                         │  (exit status, cost, latency, bootstrap  │
                         │   state, tool/MCP calls, corrections)     │
                         └───────────────┬───────────────┬──────────┘
                                         │               │
                  auto-labeled, abundant │               │ sparse, needs validation
                                         ▼               ▼
        ┌────────────────────────────────────┐   ┌──────────────────────────────────┐
        │   LOOP A — ROUTING INTELLIGENCE     │   │   LOOP B — HARNESS CURATION        │
        │   contextual bandit                 │   │   propose → validate → promote     │
        │   arms = feasible {runtime ×        │   │   → rollback                       │
        │   substrate × model × preset}       │   │   tiered by harness layer          │
        │   reward = success / cost / latency │   │   gated; auditable; reversible     │
        │   exploration is a FEATURE          │   │   drift control = loadout hygiene  │
        └──────────────┬──────────────────────┘   └──────────────┬─────────────────────┘
                       │                                          │
                       ▼                                          ▼
            routing policy consulted by                skills / bootstrap recipes /
            provision + DeployAndTalk                  MCPs / memory bundles installed
                                                       into loadout on confidence
```

A second cut runs across both loops — **what pools vs. what stays private**:

- **Global (pools across the fleet):** routing priors, skill efficacy,
  bootstrap-recipe repairs, MCP reliability. This is operational knowledge;
  it is the same regardless of whose worker it is.
- **Per-tenant (never pools):** memory bundles, personas, user preferences,
  credentials. This is personalization; pooling it is a privacy and
  correctness bug.

One clarification this split invites: **tenant is a context feature on the
single global routing model, not a separate per-tenant pool.** Routing priors
pool across the fleet so cold-start works; the tenant feature personalizes
*within* that one model. You get personalization without re-introducing the
privacy bug of pooling per-tenant data. (Per-tenant memory, personas, and
credentials still never pool — that is unchanged.)

The registry/skills layer is already platform-global and memory bundles are
already per-worker, so this split follows the grain of the existing system.

---

## Loop 0 — Observation (the shared substrate)

Everything downstream depends on the trace being structured enough that an
*agent* — not a human reading logs — can answer "what happened, why, and what
should change." Most of the raw material already exists; the work is **schema
plus transport** — not, as v1 implied, schema alone.

Already on the box (`~/.agent-machines/logs`, `bootstrap.log`, persisted
`bootstrapState`, provider exit status / cost / latency):

- Terminal transcript + command history (the tmux pane log is already piped).
- Tool calls, MCP calls, browser actions, file edits.
- Runtime, substrate, model, latency, cost, exit status per run.
- Bootstrap phase outcomes (which phase, core vs. post-gateway, failure step).
- User corrections, approvals, rejections, manual recovery steps.
- Produced artifacts, tests run, verification results.

But this material is **scattered and partly ephemeral**, which is the real
first task. The cron run records (`~/.agent-machines/cron/runs.jsonl`) and the
tmux pane log live *on the box* — and on an ephemeral substrate like E2B they
die when the box is torn down. The durable telemetry that does survive
(Supabase `machine_metrics`, cost estimates, transitions) is **aggregate**,
not the per-run row keyed the way both loops need. So Loop 0's first
deliverable is not a schema doc; it is a durable, keyed **trace sink**: emit
one normalized event per run, *off the worker*, into a store the out-of-band
improver can query, keyed by `(task_class, runtime, substrate, model,
loadout_hash)`.

The collector is an **out-of-band reader**, not a hook in the request path
(see "Where the improver runs"). Three existing patterns to reuse rather than
reinvent: the metrics collector path (`web/lib/metrics/collector.ts` →
Supabase) for the durable sink; the cron run-record pattern
(`web/lib/crons/service.ts`, which already appends
`{id, startedAt, finishedAt, exitCode}` JSONL per run) for the event shape;
and the `bootstrapState` persistence pattern (`onState` → `patchMachine`) for
streaming per-phase state off the box as it happens.

### Defining `task_class`

`task_class` is the one primitive both loops lean on that the product does not
have today, and it is load-bearing: cold-start seeding, sparse-cell pooling,
and per-axis factorization in Loop A all inherit whatever resolution it has.
Three ways to derive it, in increasing cost and fidelity:

1. **Declared at provision** — the preset or operator names the workload
   (cheapest, coarsest, available immediately).
2. **Inferred from the opening prompt/goal** by a cheap classifier (no human
   burden, medium fidelity).
3. **Clustered post-hoc** from trace embeddings (highest fidelity, needs
   volume).

Start with (1)+(2) over a small, fixed taxonomy and let (3) refine cells once
there are enough runs to cluster. Keep it coarse and stable before making it
granular — a moving taxonomy invalidates the very statistics the loops are
accumulating.

---

## Loop A — Routing intelligence (contextual bandit)

**Why this ships first:** the feedback is automatic, abundant, and unblocked.
You observe exit status, cost, and latency on *every* provision and run, with
no verifier and no human in the loop. It also has the smallest drift surface —
nothing rewrites itself — and it is the most on-brand demo: the fleet visibly
gets cheaper and more reliable per task class over a week. None of the three
harness papers covers routing (their action space is scaffold rewriting), so
this is the part you are inventing, and it is the part that matters most for
this specific product.

**Formulation:**

- **Context:** features of the workload / task class, with **tenant as one
  more context feature** (not a separate per-tenant model — see the
  global/per-tenant cut above).
- **Arms:** the **credential-gated feasible set** of `{runtime × substrate ×
  model × loadout preset}`. The credential gate is what prunes the action
  space — you never explore an arm whose substrate has no key or whose runtime
  has no usable model upstream.
- **Reward:** a composite of success (exit status / verification), cost, and
  latency, weighted per deployment policy.

**A note on the reward's `success` term.** Cost and latency are already
captured cleanly; `success` is not uniformly clean. For cron / headless runs
it is automatic and trustworthy — the exit code in `runs.jsonl`. For
interactive runs, exit 0 ≠ task done, so the label is noisy. Bootstrap Loop A
on the cron / headless slice where the signal is both abundant *and* clean;
admit interactive runs later behind a proxy (no user correction, no retry,
explicit approval) or a lightweight verifier. The "auto-labeled on every run"
property is real, but it is cleanest for the headless slice first.

**Handling the combinatorial blowup and cold start:**

- **Factorize.** Learn per-axis marginal effects (this substrate is cheap for
  this class; this runtime fails on this class) rather than one estimate per
  full cell. Most of the signal is low-order.
- **Pool sparse cells.** Share statistics across similar task classes until a
  cell has enough runs to stand alone — the same move Continual Harness makes
  when it clusters failures by signature instead of treating each run as
  unique.
- **Seed with current heuristics.** Your existing hand-set defaults are the
  prior; explore gently around them (Thompson sampling / UCB) rather than
  cold.

**Output:** a routing policy that `provision-machine` and `DeployAndTalk`
consult — the credential gate stays as the hard feasibility filter, the bandit
chooses within it. Note this is a **product change, not just an ML addition**:
today those axes are human-selected before provisioning. Decide the
interaction deliberately — *recommend-then-confirm* (the policy surfaces its
pick in `DeployAndTalk`, the human accepts) is the safer default;
*auto-select with override* is the more ambitious one. Either way the current
hand-set defaults remain the seed and the fallback.

---

## Loop B — Harness curation (the Self-Harness spine, tiered)

This is the discrete-edit loop, and it carries v1's guardrail intact:
**propose concrete diffs → validate → promote only past a confidence gate →
record provenance + rollback.** Two things from the real architecture make it
both cheaper and sharper than v1 assumed.

### Validation is tiered by harness layer

The harness is typed, and the types have radically different testability.
A flat pipeline over all edit types produces false confidence on the
un-gateable ones. Gate hard where there is a contract; stay soft and
reversible where there is no oracle.

| Harness layer | Has a testable contract? | Validation tier | How |
|---|---|---|---|
| **Bootstrap recipe / phase** | Yes — deterministic, fresh-machine | **Hard gate** | Replay the phase on a throwaway worker; gate on exit status + idempotency |
| **Executable skill / CLI wrapper** | Yes — unit/smoke testable | **Hard gate** | Run the skill's own smoke test in a sandbox; compare success/cost vs. prior |
| **MCP install / credential** | Partly — reachability + canary | **Medium gate** | Credential gate + one canary call; promote on success |
| **Service route (MCP→CLI→skill pref)** | Via outcomes only | **Bandit, not gate** | A/B on success/cost/latency; this is really a small Loop-A problem |
| **Memory bundle / persona / prompt** | No oracle | **Soft, reversible** | Promote on weak evidence, watch in prod, easy rollback; never hard-gate |

### The validation harness is the product

Self-Harness's gate is expensive in general settings because you need a
re-runnable held-out split. Here you don't build one — you **route validation
runs to the cheapest ephemeral substrate** (E2B) using the provisioning you
already have. `exec` is the only primitive required, and every substrate has
it, so the test harness costs you almost nothing to build. Held-in = the
minimized repro of the failure you're patching; held-out = a corpus of past
*successful* runs the edit must not regress.

### Loadout hygiene (the drift control)

Continual Harness documents two failure modes that are direct evidence for
v1's "fail closed" instinct: a **create-and-forget tail** (most authored
skills are never invoked again) and a **regression from freshly authored,
un-repaired components dragging runs below baseline**. Two concrete rules,
both already half-expressed in your loadout-vs-registry split:

1. **Reuse prior:** when arbitrating service routes, prefer loadout
   skills/MCPs with demonstrated success over freshly authored ones.
2. **Deprecation rule:** demote a skill/MCP from the active loadout when a
   trusted component already covers its vendor/task signature, or when it goes
   N cycles without a successful invocation.

Promotion must be a triage, not a ratchet that only ever adds.

---

## Where the improver runs

**Forced async.** The control plane is stateless serverless — ~110s function
timeouts, cold starts, no sticky sessions. A synchronous, in-request,
mid-task refiner (the Continual Harness in-episode pattern) is architecturally
impossible here, and it is also exactly where CH's drift came from. So the
improver is an **out-of-band service** that reads Loop 0 traces and proposes
diffs offline.

**Dogfood it.** The natural home is a privileged **"librarian" worker** (or a
cron in `~/.agent-machines/crons`) — itself an Agent Machine — whose job is to
read the fleet's traces, run Loop B's propose/validate steps, and open
promotions for the gate. This separates *doing work* (the fleet) from
*improving how work is done* (the librarian), which is the one structural idea
worth borrowing from SIA even though its weight lever does not apply. Note the
librarian resolves the obvious tension with the stateless thesis: the
*control plane* cannot host an observer loop, but a *worker* can — and the
librarian is a worker, reading the trace sink, not the request path.

---

## Build order

1. **Loop 0: durable trace sink + event schema + a first-cut `task_class`.**
   Everything depends on it; do it first. The work is not just the schema — it
   is getting one normalized, keyed event per run *off the (possibly
   ephemeral) worker* into a durable store, and standing up a coarse
   `task_class` so the key is meaningful. Get the keying right (`task_class,
   runtime, substrate, model, loadout_hash`).
2. **Loop A routing bandit.** Highest ROI, lowest risk, best demo, fully
   auto-labeled (cleanest on the cron/headless slice — start there). Seed from
   current defaults; factorize; pool sparse cells.
3. **Loop B: bootstrap-recipe self-repair.** The best *first* edit loop —
   bootstrap already persists failure state richly (most labeled failures in
   the system) and recipes are deterministically replayable (most testable).
4. **Loop B: executable skills + loadout hygiene.** Hard-gated, plus the
   reuse-prior / deprecation rules.
5. **Soft tier last: memory bundles / persona / prompt edits.** Reversible,
   observe-in-prod, never hard-gated.

---

## Design decisions / what was cut

| Idea (v1) | Verdict | What changed |
|---|---|---|
| Replayable regression suite | **Keep, reshaped** | Not a standalone eval product — reuse your own provisioning on cheap substrate; restrict to deterministic artifacts |
| Tier validation by edit type | **Keep, elevated** | Promoted to Loop B's backbone; the typed harness layers demand it |
| Drift controls (reuse + delete) | **Keep, renamed** | Reframed as loadout hygiene; already half-present in loadout-vs-registry |
| Routing as a bandit, ship first | **Keep, prioritized #1** | Split out of the pipeline into its own loop; it is the product's core, not step 6 |
| Async worker/improver split | **Keep, now mandatory** | Forced by the stateless control plane; dogfooded as a librarian worker/cron |
| Generic proxy-replay engine | **Cut** | Subsumed by provisioning-as-test-harness |
| Strict two-split gate on routing | **Cut** | Wrong regime — routing needs exploration; gating it kills the signal |
| Hard-gating prompt/memory edits | **Cut** | No oracle exists; soft + reversible only |

---

## Guardrails (carried from v1, refined)

Self-improving infrastructure must fail closed.

1. Draft proposed changes as inspectable diffs.
2. Attach the trace that motivated each one.
3. Validate at the tier the edit type warrants — **hard gate Loop B edits;
   the gate does *not* apply to Loop A, which explores on purpose.**
4. Promote only when confidence gates pass; rollback is via registry/git
   versioning, so it is nearly free. This is not aspirational — it already
   exists: `/home/machine/agent-machines` is a git checkout,
   `reload-from-git.sh` does `git fetch + reset` and re-syncs `knowledge/`
   into `~/.agent-machines/`, and `POST /api/dashboard/admin/reload` triggers
   it on the live box (bootstrap phase `install-git-reload`). Reverting a
   promotion is: reset the checkout to the prior SHA, reload.
5. Keep provenance and rollback metadata on every promotion.
6. Periodically prune stale or covered knowledge (loadout hygiene).

The goal is not an agent that rewrites itself whenever it feels like it. It is
a compounding runtime with two disciplined loops: one that learns *where to
run* from abundant automatic signal, and one that learns *how to run* through
tested, versioned, reversible edits.

---

## Grounding — verified against the codebase

Every architectural premise this revision leans on was ground-truthed against
the repo. The load-bearing ones, for whoever builds this:

- **Stateless serverless, ~110s budget** (forces the out-of-band improver):
  `web/app/api/dashboard/terminal/stream/route.ts` (`STREAM_BUDGET_MS =
  110_000`, `maxDuration` per route).
- **Dual/triple routing** (runtime × substrate × model = the bandit's arm
  axes): `web/lib/providers/types.ts` (`MachineProvider`),
  `web/lib/agents/upstreams.ts`, `web/lib/user-config/schema.ts`
  (`MachineRef`).
- **Typed harness layers** (the tiered-validation backbone): bootstrap phases
  + `BootstrapState` at `web/lib/user-config/schema.ts:52-95`; loadout
  service-route *ranking* at `web/lib/dashboard/loadout.ts`; `MemoryBundle` at
  `web/lib/user-config/schema.ts:286-317`.
- **Rich per-run failure state** (why bootstrap self-repair is the best first
  Loop-B edit): `BootstrapState` (`phase / current / completed[] / lastError`)
  + `web/lib/bootstrap/bootstrap-log.ts`.
- **Telemetry already captured** (Loop 0 raw material):
  `web/lib/metrics/collector.ts` (cost/latency → Supabase),
  `web/lib/crons/service.ts` (`runs.jsonl` + `exitCode`), tmux pane log →
  `/tmp/am-console.log`.
- **Provisioning-as-test-harness** (`exec` is universal across substrates
  incl. E2B): `web/lib/providers/e2b.ts`, `web/lib/providers/types.ts`.
- **Credential gate** (the bandit's hard feasibility filter):
  `web/lib/agents/credentials.ts`.
- **Free rollback** (git checkout + reload): `web/lib/bootstrap/reload-script.ts`,
  `web/app/api/dashboard/admin/reload/route.ts`, the `/home/machine/agent-machines`
  checkout.
- **Entry points the policy plugs into**:
  `web/app/api/dashboard/admin/provision-machine/route.ts`,
  `web/components/dashboard/DeployAndTalk.tsx`.

What does **not** exist yet: any of Loops 0/A/B. The telemetry is aggregate
and scattered, not the keyed per-run trace; routing is human-selected, not
learned; there is no propose/validate/promote pipeline. This revision is a
design for net-new work on a substrate that is ready for it.

---

## Appendix — v1 (superseded; retained for motivation)

v2 supersedes the six-step pipeline below but does not restate its motivation
(the Karpathy / LeCun / Yegge framing and the "strong version" argument for
why self-improving infrastructure is the frontier-shaped bet). Retained here
so that reasoning is not lost.

### The Three-Lens Take

Think of Agent Machines through three frontier-AI lenses: Andrej Karpathy,
Yann LeCun, and Steve Yegge. None of this claims what they would literally
say; it uses their public intellectual styles as a way to stress-test the
architecture.

#### Karpathy Lens: Reliability Compounds

Karpathy would probably see Agent Machines as the more frontier-shaped idea
compared with a task-board agent platform, but only if it attacks reliability.

The interesting primitive is not just "run an agent in the cloud." It is a
persistent worker with a filesystem, tools, skills, memory, scheduler, logs,
and live operator access. That gives the system a place for experience to
accumulate.

But the hard question is the "march of nines": how does the worker become more
reliable after every run? A persistent machine is only transformational if it
captures failures, learns procedures, validates improvements, and makes future
work less brittle.

#### LeCun Lens: Scaffolding Is Not Intelligence

LeCun would likely be more skeptical. He would probably argue that neither
Agent Machines nor Multica is frontier AI in the model-research sense. Both
are scaffolds around current agent systems.

From that lens, Agent Machines becomes interesting only when the persistent
machine starts acting like an environment for learning: a place where the agent
builds structured models of tasks, tools, repositories, user preferences,
failure modes, and consequences.

Saving chat history is not enough. The system needs structured state that
supports planning, adaptation, and better action selection over time.

#### Yegge Lens: Agent UX Wins

Yegge would likely judge the system by whether agents can actually use it well.
Human dashboards matter, but the more important frontier question is Agent UX:
can another agent discover capabilities, provision workers, inspect outcomes,
debug failures, and improve the harness without fragile prompting?

Multica is more legible as a team workflow product: issues, comments, agents,
statuses, and task queues. Agent Machines is more powerful as an operational
substrate: real CLIs, real machines, durable tools, and filesystem state.

The Yegge challenge for Agent Machines is to make the platform agent-native:
clear interfaces, inspectable state, searchable skills, obvious recovery
paths, and tool descriptions that agents naturally choose correctly.

### The Strong Version

The strong version of Agent Machines is not "persistent cloud agents." It is
self-improving agent infrastructure.

A persistent worker should not just run tasks. It should observe its own runs,
extract reusable procedures, test them, promote them into skills, memory,
loadout, bootstrap recipes, and routing policy, then perform future work better
because of that history.

The compounding unit is not model weights. It is operational knowledge:

- Which runtime works best for which task.
- Which substrate is fastest, cheapest, or most reliable for a workload.
- Which skills reduce failures.
- Which MCPs and CLIs actually get used.
- Which prompts or procedures repeatedly fail.
- Which recovery steps fix common breakages.
- Which user preferences should become durable defaults.

This turns Agent Machines into a learning harness around frontier agents. The
agent does not need to train itself from scratch. It needs to improve its
environment, procedures, memory, tools, and routing decisions after every run.

### Suggested Self-Learning Loop (v1's six steps)

1. **Observe** — capture the full operational trace of each run (terminal
   transcript, tool/MCP calls, runtime/model/substrate/latency/cost/exit
   status, bootstrap logs, user corrections, artifacts and verification).
2. **Extract** — convert raw history into candidate knowledge (procedures →
   skills, failure patterns → diagnostics, missing tools, repeated commands →
   scripts/bootstrap phases, preferences → memory, perf signals → routing).
3. **Propose** — generate concrete diffs (SKILL.md, memory bundle changes,
   loadout add/remove, MCP/CLI installs, bootstrap repairs, routing hints, new
   evals), reviewable, not hidden behavior changes.
4. **Validate** — before promotion, run targeted unit/integration/smoke
   checks, replay a minimized repro, verify discoverability, check for
   credential leakage, compare cost/latency/success vs. the prior path.
5. **Promote** — only validated changes enter the active harness; staged
   (draft → validate → approve/auto-promote within confidence thresholds →
   roll out), with provenance, confidence, and rollback metadata.
6. **Route Better** — use accumulated evidence to choose runtime/substrate,
   prefer demonstrated-success skills/MCPs, avoid known-bad paths, and trigger
   diagnostics early on a known failure signature.

### Guardrails (v1)

Self-improving infrastructure must fail closed. Do not let agents silently
rewrite their own operating procedures without traceability — unchecked memory
writes and auto-edited skills create drift, poisoned context, and hard-to-debug
behavior. The safer architecture: draft proposed changes; attach the motivating
trace; validate with targeted checks; promote only when confidence gates pass;
keep rollback metadata; periodically prune stale or harmful knowledge.

### Bottom Line (v1)

Agent Machines becomes transformational when it stops being only a way to
operate persistent agents and becomes a way for persistent agents to improve
their own harness. The frontier opportunity is a compounding runtime: every
run teaches the machine how to run the next one better.
