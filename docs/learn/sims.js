/* Interactive simulations. Each build*() mounts into a [data-sim] element.
   No dependencies; everything works over file://. */

(function () {
  "use strict";
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── ch1: routing matrix ── */
  function buildMatrix(mount) {
    const subs = Object.keys(AM.substrates);
    const runs = Object.keys(AM.runtimes);
    const grid = el("div", "matrix");
    grid.appendChild(el("div", "hd", "runtime ╲ substrate"));
    subs.forEach((s) => grid.appendChild(el("div", "hd colhd", AM.substrates[s].name)));
    runs.forEach((r) => {
      grid.appendChild(el("div", "hd rowhd", AM.runtimes[r].name));
      subs.forEach((s) => {
        const c = el("button", "cell", "·");
        c.setAttribute("aria-label", AM.runtimes[r].name + " on " + AM.substrates[s].name);
        c.addEventListener("click", () => select(r, s, c));
        grid.appendChild(c);
      });
    });
    const readout = el("div", "readout matrix-readout",
      "<h4>route a worker</h4>Pick any cell. Sixteen combinations, one product: the axes never constrain each other.");
    function select(r, s, cell) {
      grid.querySelectorAll(".cell.sel").forEach((x) => x.classList.remove("sel"));
      cell.classList.add("sel");
      cell.textContent = "●";
      grid.querySelectorAll(".cell:not(.sel)").forEach((x) => (x.textContent = "·"));
      readout.innerHTML =
        "<h4>" + AM.runtimes[r].name + " on " + AM.substrates[s].name + "</h4>" +
        "<span class='tag'>runtime axis</span>" + AM.runtimes[r].blurb +
        "<br><br><span class='tag warn'>substrate axis</span>" + AM.substrates[s].blurb +
        "<br><br><span class='tag good'>invariant</span>You still get the same worker unit — " +
        "harness, skills, MCP catalog, cron, observation — because everything downstream " +
        "speaks one MachineProvider interface, and the runtime is just what bootstrap installs.";
    }
    mount.appendChild(grid);
    mount.appendChild(el("div", "axis-note",
      "<span class='ax-r'>rows — which brain (agent runtime)</span><span class='ax-s'>columns — which floor (substrate)</span>"));
    mount.appendChild(readout);
  }

  /* ── ch2: harness stack ── */
  function buildStack(mount) {
    const wrap = el("div", "stack-wrap");
    const stack = el("div", "stack");
    AM.harness.forEach((l) => {
      const b = el("button", "layer");
      b.innerHTML = "<span class='ln'>" + l.n + "</span><span><span class='nm'>" + l.nm +
        "</span><span class='detail'>" + l.d + "</span></span>";
      b.addEventListener("click", () => b.classList.toggle("open"));
      stack.appendChild(b);
    });
    const side = el("div", "readout",
      "<h4>why a registry, not a tool count</h4>" +
      "The harness is data, not hardcode: registries of skills, routes, servers, CLIs, native tools " +
      "and task routes get composed at bootstrap. Add to a registry and every future worker has it — " +
      "the marketing claim is a <em>count</em>, the architecture is a <em>pipeline</em>. " +
      "It all lands in one place on the box: <code>~/.agent-machines/</code> — the worker's home, " +
      "which is exactly what survives sleep.");
    wrap.appendChild(stack);
    wrap.appendChild(side);
    mount.appendChild(wrap);
  }

  /* ── ch3: provider interface explorer ── */
  function buildIface(mount) {
    const wrap = el("div", "iface");
    const list = el("div", "methods");
    const right = el("div");
    const concept = el("div", "readout");
    const grid = el("div", "iface-grid");
    right.appendChild(concept);
    right.appendChild(el("div", null, "&nbsp;"));
    right.appendChild(grid);
    function show(m) {
      list.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
      const n = AM.iface.notes[m];
      concept.innerHTML = "<h4>" + m + "()</h4>" + n.concept;
      grid.innerHTML = "";
      Object.keys(n.perProvider).forEach((p) => {
        grid.appendChild(el("div", "readout", "<h4>" + p + "</h4>" + n.perProvider[p]));
      });
    }
    AM.iface.methods.forEach((m) => {
      const b = el("button", null, m + "()");
      b.dataset.m = m;
      b.addEventListener("click", () => show(m));
      list.appendChild(b);
    });
    wrap.appendChild(list);
    wrap.appendChild(right);
    mount.appendChild(wrap);
    show("exec");
  }

  /* ── ch4: lifecycle pipeline stepper ── */
  function buildPipeline(mount) {
    const pipe = el("div", "pipe");
    const rows = AM.pipeline.map((p) => {
      const r = el("div", "phase" + (p.be ? " besteffort" : ""));
      r.innerHTML = "<span class='st'>○</span><span class='nm'>" + p.nm + "</span>" +
        "<span class='ds'>" + p.ds +
        (p.hazard ? "<span class='hazard'>⚠ " + p.hazard + "</span>" : "") + "</span>";
      pipe.appendChild(r);
      return r;
    });
    let i = -1;
    const bar = el("div", "term-input");
    const step = el("button", "primary", "advance ▸");
    const reset = el("button", null, "reset");
    const hz = el("button", null, "show hazards");
    let hazardsOn = false;
    step.addEventListener("click", () => {
      if (i >= 0) {
        rows[i].classList.remove("active");
        rows[i].classList.add("done");
        rows[i].querySelector(".st").textContent = "●";
      }
      i++;
      if (i >= rows.length) { step.disabled = true; step.textContent = "worker live ✓"; return; }
      rows[i].classList.add("active");
      rows[i].querySelector(".st").textContent = "◉";
      rows[i].scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" });
    });
    reset.addEventListener("click", () => {
      i = -1; step.disabled = false; step.textContent = "advance ▸";
      rows.forEach((r) => { r.classList.remove("active", "done"); r.querySelector(".st").textContent = "○"; });
    });
    hz.addEventListener("click", () => {
      hazardsOn = !hazardsOn;
      hz.textContent = hazardsOn ? "hide hazards" : "show hazards";
      rows.forEach((r) => r.classList.toggle("show-hazard", hazardsOn));
    });
    bar.appendChild(step); bar.appendChild(reset); bar.appendChild(hz);
    mount.appendChild(pipe);
    mount.appendChild(bar);
  }

  /* ── ch5: console packet flight ── */
  const POS = {
    browser: { x: 16, y: 44 }, post: { x: 31, y: 44 }, fn: { x: 49, y: 40 },
    tmux: { x: 80, y: 28 }, cli: { x: 86, y: 44 }, log: { x: 86, y: 60 },
    tail: { x: 80, y: 76 }, sse: { x: 49, y: 70 }, paint: { x: 16, y: 64 },
    ws: { x: 44, y: 44 }, wall: { x: 60.5, y: 44 }, dead: { x: 60.5, y: 62 },
  };
  function buildConsole(mount) {
    const wrap = el("div", "console-sim");
    const world = el("div", "world");
    world.innerHTML =
      "<div class='zone browser'><span class='zlabel'>browser tab</span>" +
      "<div class='sub' style='top:34%'>xterm.js</div></div>" +
      "<div class='zone vercel'><span class='zlabel'>vercel control plane</span>" +
      "<div class='sub' style='top:30%'>API route (stateless,<br>dies in seconds)</div>" +
      "<div class='sub' style='top:62%'>SSE stream route</div></div>" +
      "<div class='zone box'><span class='zlabel'>the worker (any substrate)</span>" +
      "<div class='sub' style='top:14%'>tmux session “amconsole”</div>" +
      "<div class='sub' style='top:38%'>agent CLI (TUI)</div>" +
      "<div class='sub' style='top:58%'>pipe-pane → console log</div>" +
      "<div class='sub' style='top:80%'>stdbuf -o0 tail -f</div></div>" +
      "<div class='wall'><span>~110s function wall · no sticky sessions</span></div>";
    const packet = el("div", "packet");
    packet.style.left = POS.browser.x + "%"; packet.style.top = POS.browser.y + "%";
    world.appendChild(packet);
    const logBox = el("div", "console-log");
    wrap.appendChild(world); wrap.appendChild(logBox);

    const controls = el("div", "term-input");
    const input = el("input");
    input.placeholder = "type a command for the worker… (e.g. hi⏎)";
    input.setAttribute("aria-label", "simulated terminal input");
    const send = el("button", "primary", "send ⏎");
    controls.appendChild(input); controls.appendChild(send);

    const modeBar = el("div", "term-input");
    const toggle = el("div", "toggle");
    const bCourier = el("button", "on", "inversion: stateless courier");
    const bNaive = el("button", null, "naive: websocket pty relay");
    toggle.appendChild(bCourier); toggle.appendChild(bNaive);
    modeBar.appendChild(toggle);

    let mode = "courier", running = false, timer = null;
    function setMode(m) {
      mode = m;
      bCourier.classList.toggle("on", m === "courier");
      bNaive.classList.toggle("on", m === "naive");
      world.classList.toggle("naive", m === "naive");
      logLine(m === "naive"
        ? "mode: the design everyone tries first — hold a socket through the API"
        : "mode: the inversion — session lives on the box, control plane is a courier", "hot");
    }
    bCourier.addEventListener("click", () => setMode("courier"));
    bNaive.addEventListener("click", () => setMode("naive"));

    function logLine(t, cls) {
      // textContent, not innerHTML: t can include user-typed sim input
      const l = el("div", "l" + (cls ? " " + cls : ""));
      l.textContent = t;
      logBox.appendChild(l);
      logBox.scrollTop = logBox.scrollHeight;
      while (logBox.children.length > 60) logBox.removeChild(logBox.firstChild);
    }
    function fly(text) {
      if (running) return;
      running = true;
      packet.classList.remove("back", "dead");
      const hops = AM.consoleHops[mode === "naive" ? "naive" : "courier"];
      logLine("─".repeat(8) + " “" + text + "” " + "─".repeat(8));
      let k = 0;
      const stepMs = REDUCED ? 0 : 460;
      function next() {
        if (k >= hops.length) {
          running = false;
          if (mode === "courier") logLine("echo painted. the box never noticed Vercel restarting.", "ok");
          return;
        }
        const h = hops[k];
        const p = POS[h.at] || POS.browser;
        packet.style.left = p.x + "%"; packet.style.top = p.y + "%";
        if (mode === "courier" && k >= 5) packet.classList.add("back");
        if (h.cls === "err") packet.classList.add("dead");
        logLine(h.log, h.cls);
        k++;
        timer = setTimeout(next, stepMs);
      }
      clearTimeout(timer);
      next();
    }
    function go() {
      const v = input.value.trim() || "hi";
      input.value = "";
      fly(v);
    }
    send.addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });

    mount.appendChild(modeBar);
    mount.appendChild(wrap);
    mount.appendChild(controls);
    logLine("ready. type, send, and watch where your keystroke actually goes.", "hot");
  }

  /* ── ch6: surface map ── */
  function buildSurfaces(mount) {
    const grid = el("div", "surfaces");
    const readout = el("div", "readout", "<h4>the operator's six rooms</h4>Click a surface.");
    AM.surfaces.forEach((s, idx) => {
      const b = el("button");
      b.innerHTML = "<span class='nm'>" + s.nm + "</span><span class='one'>" + s.one + "</span>";
      b.addEventListener("click", () => {
        grid.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        readout.innerHTML = "<h4>" + s.nm + "</h4>" + s.d;
      });
      grid.appendChild(b);
      if (idx === 0) setTimeout(() => b.click(), 0);
    });
    mount.appendChild(grid);
    mount.appendChild(el("div", null, "&nbsp;"));
    mount.appendChild(readout);
  }

  /* ── ch7: war story prediction cards ── */
  function buildWars(mount) {
    AM.wars.forEach((w, i) => {
      const card = el("div", "war");
      card.appendChild(el("div", "sym", "<span class='k'>symptom " + (i + 1) + "/" + AM.wars.length +
        "</span>" + w.sym + "<br><span style='color:var(--ink-faint);font-size:12px'>predict the root cause:</span>"));
      const ctr = el("div", "controls");
      w.opts.forEach((o, j) => {
        const b = el("button", null, o);
        b.addEventListener("click", () => {
          if (card.classList.contains("open")) return;
          card.classList.add("open");
          b.style.borderColor = j === w.correct ? "var(--green)" : "var(--red)";
          b.style.color = j === w.correct ? "var(--green)" : "var(--red)";
          ctr.querySelectorAll("button").forEach((x, k2) => {
            if (k2 === w.correct) { x.style.borderColor = "var(--green)"; x.style.color = "var(--green)"; }
          });
        });
        ctr.appendChild(b);
      });
      card.appendChild(ctr);
      card.appendChild(el("div", "reveal", "<span class='k'>root cause</span>" + w.cause +
        "<div class='lesson'>" + w.lesson + "</div>"));
      mount.appendChild(card);
    });
  }

  /* mount everything */
  document.addEventListener("DOMContentLoaded", () => {
    const mounts = {
      matrix: buildMatrix, stack: buildStack, iface: buildIface,
      pipeline: buildPipeline, console: buildConsole,
      surfaces: buildSurfaces, wars: buildWars,
    };
    document.querySelectorAll("[data-sim]").forEach((m) => {
      const fn = mounts[m.dataset.sim];
      if (fn) fn(m);
    });
  });
})();
