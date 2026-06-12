/* Shell behavior: rail nav, chapter reveal + progress (localStorage),
   keyboard paging, quiz engine. No dependencies. */

(function () {
  "use strict";
  const LS_KEY = "am-learn-progress-v1";

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* private mode: fine */ }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const progress = loadProgress();
    const chapters = Array.from(document.querySelectorAll("section.chapter"));
    const tocLinks = Array.from(document.querySelectorAll(".rail a.toc"));
    const byId = {};
    tocLinks.forEach((a) => (byId[a.getAttribute("href").slice(1)] = a));

    function markDone(id) {
      if (progress[id]) return;
      progress[id] = true;
      saveProgress(progress);
      if (byId[id]) byId[id].classList.add("done");
    }
    Object.keys(progress).forEach((id) => byId[id] && byId[id].classList.add("done"));

    /* reveal + active-section tracking + completion */
    const seen = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("seen");
          markDone(e.target.id);
        }
      });
    }, { threshold: 0.18 });
    chapters.forEach((c) => seen.observe(c));

    const active = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        tocLinks.forEach((a) => a.classList.toggle("active",
          a.getAttribute("href") === "#" + e.target.id));
      });
    }, { rootMargin: "-38% 0px -56% 0px" });
    chapters.forEach((c) => active.observe(c));

    /* keyboard paging between chapters */
    document.addEventListener("keydown", (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const tops = chapters.map((c) => c.getBoundingClientRect().top);
      let idx = tops.findIndex((t) => t > 90);            // next chapter below viewport top
      if (idx === -1) idx = chapters.length;
      const cur = idx - 1;                                 // chapter currently in view
      const target = e.key === "ArrowRight"
        ? Math.min(cur + 1, chapters.length - 1)
        : Math.max(cur - 1, 0);
      chapters[target].scrollIntoView({ behavior: "smooth", block: "start" });
    });

    /* quiz */
    const qMount = document.querySelector("[data-quiz]");
    if (qMount) buildQuiz(qMount, progress, saveProgress);
  });

  function buildQuiz(mount, progress, persist) {
    let score = 0, answered = 0;
    const scoreLine = document.createElement("div");
    scoreLine.className = "quiz-score";
    scoreLine.textContent = "0 / " + AM.quiz.length + " answered";

    AM.quiz.forEach((item, i) => {
      const q = document.createElement("div");
      q.className = "quiz-q quiz";
      const t = document.createElement("div");
      t.className = "qt";
      t.innerHTML = "<span class='qn'>Q" + String(i + 1).padStart(2, "0") + "</span>";
      t.appendChild(document.createTextNode(item.q));
      const opts = document.createElement("div");
      opts.className = "opts";
      item.o.forEach((optText, j) => {
        const b = document.createElement("button");
        b.textContent = optText;
        b.addEventListener("click", () => {
          if (q.classList.contains("answered")) return;
          q.classList.add("answered");
          answered++;
          const right = j === item.a;
          if (right) score++;
          b.classList.add(right ? "correct" : "wrong");
          opts.children[item.a].classList.add("correct");
          scoreLine.textContent = score + " correct of " + answered + " answered (" + AM.quiz.length + " total)";
          if (answered === AM.quiz.length) {
            scoreLine.textContent += score >= 8 ? " — instructor signs off. ✓"
              : " — revisit the chapters your misses point to.";
            progress.quizScore = score;
            persist(progress);
          }
        });
        opts.appendChild(b);
      });
      const why = document.createElement("div");
      why.className = "why";
      why.textContent = item.why;
      q.appendChild(t); q.appendChild(opts); q.appendChild(why);
      mount.appendChild(q);
    });
    mount.appendChild(scoreLine);
  }
})();
