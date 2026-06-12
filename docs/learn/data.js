/* Curriculum data for the Agent Machines field manual.
   Every fact traces to the repo's own docs (knowledge/, docs/WHITEPAPER.md,
   README.md, web/docs/) or the built knowledge graph — nothing invented. */

window.AM = window.AM || {};

/* ── ch1: dual routing matrix ───────────────────────────────────── */
AM.runtimes = {
  hermes: {
    name: "Hermes",
    blurb: "REPL-style agent runtime from Nous Research. Gateway on :8642. Richest native tool set (terminal, fs, browser, vision, cron, memory, delegate). Three-tier memory, self-evolving SKILL.md skills, profiles for multi-agent.",
  },
  openclaw: {
    name: "OpenClaw",
    blurb: "Gateway-centric runtime: a long-lived WebSocket-first daemon on :18789 with channel bridges (Telegram, Discord, Slack…), 4-layer memory, heartbeat checklist turns every 30m.",
  },
  claude: {
    name: "Claude Code",
    blurb: "Anthropic's `claude` terminal TUI. Stateful agent loop (one QueryEngine per session), 50+ registered tools behind a permission engine, first-class MCP.",
  },
  codex: {
    name: "Codex CLI",
    blurb: "OpenAI's `codex` terminal TUI. Config-first (~/.codex/config.toml), named per-environment profiles (dev/ci/prod/agent), three sandbox modes.",
  },
};

AM.substrates = {
  dedalus: {
    name: "Dedalus",
    blurb: "Benchmarks best on boot latency (~250ms) and sleep/wake — the competitive default, not the product. Preview URLs expose the gateway. No native exec streaming (poll fallback, ~300–450ms chunks). Home: /home/machine.",
  },
  e2b: {
    name: "E2B",
    blurb: "Sandbox SDK with connect-reuse caching and deterministic port URLs (8642-<sandboxId>.e2b.app). Home: /home/user.",
  },
  sprites: {
    name: "Sprites.dev",
    blurb: "Fly.io sprites. Public URL via api.sprites.dev proxying :8080. Exec needed explicit timeouts (a real bug found live). Home: /home/sprite.",
  },
  vercel: {
    name: "Vercel Sandbox",
    blurb: "Vercel's own sandbox: OIDC credentials, commands shipped as base64-encoded bash. The same provider interface as the rest.",
  },
};

/* ── ch2: harness layers ────────────────────────────────────────── */
AM.harness = [
  { n: "L1", nm: "Skills", d: "SKILL.md playbooks installed at ~/.agent-machines/skills/ (161 bundled). Procedural memory: every solved task can become a skill, so the worker compounds. This is the layer a chat product can never export." },
  { n: "L2", nm: "Service routes", d: "Per-vendor routing policy: prefer the MCP server, fall back to the CLI, then to a plugin or personal skill. The worker always has a best available path to Stripe, GitHub, Supabase…" },
  { n: "L3", nm: "MCP servers", d: "A machine-readable catalog (mcps/catalog.json) registered into the runtime's config. Core: playwright, cursor-bridge. Bundled servers install via npx but only self-register when their credentials exist in .env — credential-gated by design." },
  { n: "L4", nm: "CLIs", d: "Real command-line tools on the box: agent-browser, Playwright, gh, curl, jq, sqlite3… The agent is on a full Linux machine, so the unix toolbelt is part of the harness." },
  { n: "L5", nm: "Agent-native tools", d: "Whatever the chosen runtime ships natively — Hermes is richest (terminal, fs, browser, vision, cron, memory, delegate). This layer varies with the runtime you routed." },
  { n: "L6", nm: "Task routes", d: "Higher-level playbooks mapping job families (browser automation, QA, security review, research, SEO…) onto the layers below. The 'which tool for which job' policy." },
];

/* ── ch3: MachineProvider interface ─────────────────────────────── */
AM.iface = {
  methods: ["provision", "state", "wake", "sleep", "destroy", "exec", "streamExec"],
  notes: {
    provision: {
      concept: "Create a machine on the substrate and return its identity. Everything downstream (bootstrap, console, cron) only needs that identity.",
      perProvider: {
        Dedalus: "Fast VM create (~250ms boot class); preview URL exposes the gateway port.",
        E2B: "Sandbox create via SDK; URLs are deterministic per port + sandbox id.",
        Sprites: "Sprite create; public URL fetched from the Sprites API.",
        "Vercel Sandbox": "Sandbox created with OIDC credentials.",
      },
    },
    state: {
      concept: "One normalized status (running / sleeping / gone) out of four different vendor vocabularies. Normalization is what lets the dashboard treat the fleet uniformly.",
      perProvider: {
        Dedalus: "Machine state mapped from the Dedalus API; stale bootstrap flags are possible after sleep (overlay FS resets) — hence repair-on-wake.",
        E2B: "Sandbox liveness from the SDK.",
        Sprites: "Sprite status mapped to the shared enum.",
        "Vercel Sandbox": "Sandbox status mapped to the shared enum.",
      },
    },
    wake: {
      concept: "Resume a sleeping machine. The product contract: your setup is exactly where you left it — and the gateway gets health-checked (and restarted if needed) on the way up.",
      perProvider: {
        Dedalus: "Strongest sleep/wake story; but overlay FS resets mean wake may need bootstrap repair (needsBootstrapRepair → re-bootstrap).",
        E2B: "Resume via SDK; connect cache avoids re-handshakes.",
        Sprites: "Wake via API.",
        "Vercel Sandbox": "Wake via API.",
      },
    },
    sleep: {
      concept: "Park the machine: compute billing stops, disk and identity persist. This is the economic loop that makes a persistent worker affordable.",
      perProvider: {
        Dedalus: "Best-in-class sleep/wake latency per the repo's own benchmarks.",
        E2B: "Pause via SDK.",
        Sprites: "Sleep via API.",
        "Vercel Sandbox": "Sleep via API.",
      },
    },
    destroy: {
      concept: "Tear down for real. The postmortem lesson: orphaned machines silently eat quota, so GC (npm run gc) matters as much as create.",
      perProvider: {
        Dedalus: "Account quota was 5 machines — 4 invisible orphans once blocked all provisioning.",
        E2B: "Sandbox kill.",
        Sprites: "Sprite delete.",
        "Vercel Sandbox": "Sandbox delete.",
      },
    },
    exec: {
      concept: "Run a command on the box. The load-bearing primitive: bootstrap, cron, metrics probes, and the entire browser terminal are built from exec alone.",
      perProvider: {
        Dedalus: "Exec with adaptive backoff; no streaming variant.",
        E2B: "Exec via SDK with connection reuse.",
        Sprites: "Exec wrapped in withTimeout after a live hang was traced here.",
        "Vercel Sandbox": "Commands shipped as base64 bash.",
      },
    },
    streamExec: {
      concept: "Exec with live output. Capability-tiered: use native streaming where the SDK has it, fall back to polling where it doesn't — the UI works either way.",
      perProvider: {
        Dedalus: "No native stream — poll fallback in ~300–450ms chunks.",
        E2B: "Native streaming.",
        Sprites: "Streaming with WS overhead noted in the repo's benchmarks.",
        "Vercel Sandbox": "Streamed via the sandbox SDK.",
      },
    },
  },
};

/* ── ch4: lifecycle phases ──────────────────────────────────────── */
AM.pipeline = [
  { nm: "credential gate", ds: "Before anything spins up: are the substrate keys and the model router configured? If not, deploy is blocked — provisioning must never silently fail.", hazard: "Era-bound gates: early Dedalus-only auth checks later blocked healthy Sprites/E2B machines. Gates must generalize when the abstraction does." },
  { nm: "provision", ds: "MachineProvider.provision creates the box and returns its identity (a real run: dm-019e… on Dedalus).", hazard: "Quota exhaustion: 5/5 machines, 4 of them invisible orphans. No GC, no quota display — deploys just started failing." },
  { nm: "system deps", ds: "apt-get the base toolchain onto a fresh VM.", hazard: "dpkg lock: unattended-upgrades holds the lock 30–60s on fresh Dedalus VMs. The CLI had only ever bootstrapped warm machines, so the web's fresh-VM path hit it first. Fix: a lock-wait loop before apt-get." },
  { nm: "runtime install", ds: "Install the routed agent runtime (Hermes, OpenClaw, Claude Code, or Codex) plus skills, MCP catalog, and crons under ~/.agent-machines.", hazard: "Shell syntax: multiline if/fi blocks joined with && produced invalid scripts on real VMs. Generated shell is code — test it on the real substrate." },
  { nm: "gateway up", ds: "Install a dedicated systemd unit (agent-hermes-gateway.service), start it, then waitForGatewayUrl polls /v1/models until it answers 200. Gateway answering = bootstrap succeeded.", hazard: "Wrong unit: the installer once targeted dm-guest-agent.service — the substrate's own daemon — so the gateway died right after bootstrap 'succeeded'. Health is what the URL says, not what the installer claims." },
  { nm: "post-gateway phases", ds: "Best-effort extras (e.g. playwright install for closed-loop browsing). They run after success is already marked.", hazard: "These used to run before success: one slow playwright download failed entire bootstraps. Order phases by what defines 'working'.", be: true },
  { nm: "attach & talk", ds: "Redirect to the terminal with ?launch=1, attach the browser console to the box's tmux session, auto-launch the CLI. A real end-to-end bootstrap measured ~151s.", hazard: "" },
  { nm: "sleep ⇄ wake", ds: "Sleep parks compute (disk persists, billing stops). Wake re-checks the gateway (ensureGatewayRunning) and re-bootstraps if the substrate reset artifacts.", hazard: "Stale state: Dedalus overlay FS resets on sleep/wake, so 'bootstrapState: succeeded' could lie. Verify artifacts, then repair.", },
];

/* ── ch5: console packet hops ───────────────────────────────────── */
AM.consoleHops = {
  courier: [
    { at: "browser", log: "keypress captured by xterm.js", cls: "" },
    { at: "post", log: "POST /api/dashboard/terminal/input  (serialized — order preserved)", cls: "hot" },
    { at: "fn", log: "Vercel function: auth → resolve machine → provider.exec (stateless, ms-lived)", cls: "hot" },
    { at: "tmux", log: "tmux send-keys -H 68 69 0d   (hex bytes into session 'amconsole')", cls: "ok" },
    { at: "cli", log: "agent CLI processes input; TUI repaints (cursor-addressed escapes, no newlines)", cls: "ok" },
    { at: "log", log: "pipe-pane appends raw bytes → /tmp/am-console.log", cls: "ok" },
    { at: "tail", log: "stdbuf -o0 tail -f streams the log unbuffered (line-buffering would freeze TUIs)", cls: "ok" },
    { at: "sse", log: "SSE: GET /api/dashboard/terminal/stream relays bytes back (reconnects ~every 110s, ~100ms gap)", cls: "hot" },
    { at: "paint", log: "xterm.js paints — round trip ~100–300ms warm", cls: "ok" },
  ],
  naive: [
    { at: "browser", log: "keypress captured by xterm.js", cls: "" },
    { at: "ws", log: "WebSocket opened browser → API → remote PTY (must stay open for the whole session)", cls: "hot" },
    { at: "wall", log: "✗ serverless wall: function budget ~110s, cold starts, no sticky sessions — the socket's host process dies", cls: "err" },
    { at: "dead", log: "session lost. Teams fall back to: local-only CLIs, chat shims, vendor shells, or running their own relay infra", cls: "err" },
  ],
};

/* ── ch6: control plane surfaces ────────────────────────────────── */
AM.surfaces = [
  { nm: "Machines", one: "Provision, bootstrap, fleet board", d: "The fleet view. Cards show live state plus bootstrap phase; ?focus=<machineId> opens an embedded chat pane beside the cards (split view) instead of forcing navigation. URL-scoped: the machine in your URL — not the globally 'active' one — is what headers, probes, and AutoWake target." },
  { nm: "Workers", one: "One-click specialist presets", d: "Opinionated presets: runtime + router + memory bundle composed into a named specialist (design agent, news agent, code agent). The insight: vendor 'products' are UI + skills + MCPs + prompts on the same model — so make that stack composable." },
  { nm: "Memory", one: "Portable persona & rules", d: "Persona, rules and abilities owned by the account, not the vendor — the identity file stack (AGENTS/SOUL/USER/MEMORY) shipped to whichever machine you deploy. Your worker's character is portable across substrates." },
  { nm: "Registry", one: "1,400+ installable tools", d: "Browse and install from the MCP registry, skills.sh, npm and the bundled catalog. Browsing is deliberately separate from Loadout (what's actually on a machine)." },
  { nm: "Loadout", one: "What's live on this machine", d: "The active harness on one machine: which skills, MCP servers, CLIs and native tools are actually loaded. Registry = the store; Loadout = your belt." },
  { nm: "Cron + Usage", one: "Schedules and observation", d: "Scheduled exec on machines (a Vercel cron ticks /api/internal/cron/tick every 5 minutes) and Supabase-backed usage, cost estimates and activity. Observation before orchestration: you can only orchestrate what you can see." },
];

/* ── ch7: war stories ───────────────────────────────────────────── */
AM.wars = [
  {
    sym: "Open machine B's terminal while machine A is 'active' — your commands run on machine A.",
    opts: ["A URL parsing bug", "Routes resolved the target via global state", "A provider returned the wrong machine id", "Frontend cached the old machine"],
    correct: 1,
    cause: "All 7 per-machine API routes resolved their target via activeMachine(config) — global state — ignoring the machineId in the URL. The multi-machine URL scheme arrived after the routes were built single-machine, and they were never refactored.",
    lesson: "When you add a dimension (one machine → many), audit every consumer of the old global. Scope flows from the request, not from ambient state.",
  },
  {
    sym: "A healthy, running Sprites machine — but logs, sessions and cursor endpoints all refuse to serve.",
    opts: ["Sprites was down", "Auth checks required a Dedalus API key", "The gateway wasn't running", "A CORS misconfiguration"],
    correct: 1,
    cause: "Those routes gated on config.providers.dedalus?.apiKey — auth written in the Dedalus-only era, never generalized when the provider abstraction arrived. Replaced with provider-agnostic isMachineRunning().",
    lesson: "Gates rot. When an abstraction generalizes, every check written against the old special case is now a bug waiting for the second provider.",
  },
  {
    sym: "Chats from Claude Code and Codex workers exist, but chat and metrics UIs won't show them.",
    opts: ["The gateway dropped them", "UIs hardcoded only two agent labels", "A database migration was missed", "The agents never wrote chats"],
    correct: 1,
    cause: "Chat pages and the metrics panel hardcoded 'openclaw' and 'hermes'. Agent kinds had been extended without a central source of truth, so every consumer had to be found by hand. Fix: one AGENT_LABEL map.",
    lesson: "An enum that lives in N copies is N−1 bugs. Centralize the source of truth before you extend the set.",
  },
  {
    sym: "Every new deploy fails at provision. Nothing changed in the code.",
    opts: ["The substrate had an outage", "Quota was full of invisible orphans", "Credentials expired", "A rate limit was hit"],
    correct: 1,
    cause: "The Dedalus account sat at 5/5 machine quota — 4 of them sleeping orphans from failed bootstraps. No GC and no quota display meant capacity vanished silently.",
    lesson: "Anything you create automatically, you must also count and collect. Show quota; schedule GC.",
  },
  {
    sym: "Bootstrap works every time from the CLI, then fails ~half the time from the web on brand-new VMs.",
    opts: ["The web sent a different script", "A fresh-VM-only race: dpkg lock", "Network egress was blocked", "The runtime installer changed"],
    correct: 1,
    cause: "unattended-upgrades holds the dpkg lock 30–60s on fresh Dedalus VMs. The CLI had only ever bootstrapped already-warm machines; web provisioning created truly fresh VMs and ran apt-get straight into the lock. Fix: a lock-wait loop.",
    lesson: "'Works on my machine' includes machine *age*. Test the cold path, not just the warm one.",
  },
];

/* ── ch8: quiz ──────────────────────────────────────────────────── */
AM.quiz = [
  { q: "Complete the product's own analogy: Agent Machines is ____ for agents and containers.", o: ["Kubernetes", "OpenRouter", "Terraform", "Heroku"], a: 1, why: "One account routes which agent runtime and which substrate, the way OpenRouter routes models. The companion analogy is 'Vercel on AWS' — product layer above interchangeable infrastructure." },
  { q: "What are the two independent routing axes?", o: ["Model and prompt", "Region and zone", "Agent runtime and substrate", "Frontend and backend"], a: 2, why: "Runtime (Hermes / OpenClaw / Claude Code / Codex) × substrate (Dedalus / E2B / Sprites / Vercel Sandbox). Routing both axes independently is the lock-in defense." },
  { q: "Which single provider primitive is enough to build the entire browser terminal?", o: ["streamExec", "exec", "wake", "provision"], a: 1, why: "exec. Input is one quick exec (tmux send-keys -H), output is an exec running tail -f, resize is an exec. That's why the same console works on all four substrates." },
  { q: "Why can't the obvious WebSocket-PTY design ship on the product's own hosting?", o: ["WebSockets are too slow", "Functions die (~110s), cold-start, and have no sticky sessions", "xterm.js can't speak WebSocket", "Browsers block long sockets"], a: 1, why: "A PTY relay needs a long-lived process holding the socket. Serverless gives you short-lived functions with no session affinity — so the session must live somewhere else." },
  { q: "Where does the terminal session actually live?", o: ["In the Vercel function", "In the browser tab", "In a tmux session on the worker", "In a Cloudflare tunnel"], a: 2, why: "Stateless courier, stateful worker: tmux + pipe-pane on the box hold the PTY and scrollback; the control plane just ferries bytes via POST and SSE." },
  { q: "Why must output use *unbuffered* tail -f?", o: ["Buffering wastes memory", "TUIs emit cursor-addressed escapes with no newlines — line buffering would freeze the screen", "SSE requires it", "tmux can't flush otherwise"], a: 1, why: "Full-screen TUIs like Claude Code and Codex repaint with escape sequences, not lines. Wait for a newline and you'll wait forever — hence stdbuf -o0." },
  { q: "When is a bootstrap marked 'succeeded'?", o: ["After every phase finishes", "When the gateway URL answers /v1/models", "When provision returns", "When the user opens the terminal"], a: 1, why: "Gateway answering = worker usable, so success is marked there; later phases (like playwright install) are best-effort and can no longer fail the bootstrap." },
  { q: "What makes sleep economically meaningful?", o: ["The VM is deleted and recreated", "Compute billing stops while disk, skills and memory persist", "The agent compresses its memory", "Nothing — it's cosmetic"], a: 1, why: "Park the worker: pay nothing for compute until wake, but the setup — skills, config, memory — stays. Wake re-checks the gateway and repairs if the substrate reset artifacts." },
  { q: "The per-machine routing bug (commands hitting the wrong machine) happened because…", o: ["URLs were malformed", "routes resolved targets from global 'active machine' state", "the provider mixed up ids", "caching returned stale data"], a: 1, why: "Routes predated multi-machine URLs and kept calling activeMachine(config). The lesson: when a system gains a dimension, audit every consumer of the old global." },
  { q: "Why do skills (SKILL.md) matter strategically, per the vision doc?", o: ["They make prompts shorter", "Procedures compound on the machine and can't be exported from a chat product", "They replace MCP servers", "They're required by the runtimes"], a: 1, why: "Each solved task can become a playbook on disk. Over time the worker gets categorically better — and that accumulated capital is exactly what a stateless chat tab can never give you." },
];
