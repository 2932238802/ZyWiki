/* 就业指南 Wiki — 交互脚本（无依赖） */
(function () {
  "use strict";

  var doc = document;
  var body = doc.body;

  /* ---------- 阅读进度 ---------- */
  var progress = doc.querySelector("[data-progress]");
  function paintProgress() {
    if (!progress) return;
    var h = doc.documentElement.scrollHeight - window.innerHeight;
    var p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
    progress.style.width = (p * 100).toFixed(2) + "%";
  }
  window.addEventListener("scroll", paintProgress, { passive: true });
  window.addEventListener("resize", paintProgress);
  paintProgress();

  /* ---------- 移动端目录 ---------- */
  var burger = doc.querySelector("[data-burger]");
  if (burger) {
    burger.addEventListener("click", function () {
      var open = body.classList.toggle("nav-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    doc.addEventListener("click", function (e) {
      if (!body.classList.contains("nav-open")) return;
      if (e.target.closest(".sidebar") || e.target.closest("[data-burger]")) return;
      body.classList.remove("nav-open");
      burger.setAttribute("aria-expanded", "false");
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && body.classList.contains("nav-open")) {
        body.classList.remove("nav-open");
        burger.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- 页内目录高亮 ---------- */
  var tocLinks = Array.prototype.slice.call(doc.querySelectorAll("[data-toc] a"));
  if (tocLinks.length) {
    var map = {};
    var targets = [];
    tocLinks.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute("href").slice(1));
      var el = doc.getElementById(id);
      if (el) {
        map[id] = a;
        targets.push(el);
      }
    });
    var current = null;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var a = map[entry.target.id];
          if (!a || a === current) return;
          if (current) current.classList.remove("is-active");
          a.classList.add("is-active");
          current = a;
        });
      },
      { rootMargin: "-88px 0px -68% 0px", threshold: 0 }
    );
    targets.forEach(function (t) {
      observer.observe(t);
    });
  }

  /* ---------- 标题锚点 ---------- */
  doc.querySelectorAll(".article h2[id], .article h3[id]").forEach(function (h) {
    var a = doc.createElement("a");
    a.className = "anchor";
    a.href = "#" + h.id;
    a.setAttribute("aria-label", "链接到本节：" + h.textContent.trim());
    a.textContent = "#";
    h.appendChild(a);
  });

  /* ---------- 自评打分 ---------- */
  var score = doc.querySelector("[data-score]");
  if (score) {
    var rows = Array.prototype.slice.call(score.querySelectorAll(".score__row"));
    var totalEl = score.querySelector("[data-score-total]");
    var noteEl = score.querySelector("[data-score-note]");
    var resetBtn = score.querySelector("[data-score-reset]");
    var KEY = "zywiki.score.v1";
    var state = {};

    try {
      state = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch (e) {
      state = {};
    }

    function render() {
      var sum = 0;
      var filled = 0;
      rows.forEach(function (row) {
        var key = row.getAttribute("data-key");
        var val = state[key] || 0;
        if (val) {
          sum += val;
          filled += 1;
        }
        row.querySelectorAll(".score__dot").forEach(function (dot) {
          var on = Number(dot.getAttribute("data-value")) === val;
          dot.setAttribute("aria-pressed", on ? "true" : "false");
        });
      });
      if (totalEl) {
        totalEl.innerHTML =
          filled === 0
            ? "还没有打分"
            : "已评 <b>" + filled + "</b>/ 5 项，合计 <b>" + sum + "</b> 分";
      }
      if (noteEl) {
        if (filled === 0) {
          noteEl.textContent = "点数字 1–5 给每一项打分，分数会保存在这台设备上。";
        } else if (filled < 5) {
          noteEl.textContent = "还剩 " + (5 - filled) + " 项没打分。";
        } else if (sum === 15) {
          noteEl.textContent =
            "五项都是 3 分，也就是平均水平。平均水平在求职时的意思是：简历和成千上万份简历长得一样。";
        } else {
          noteEl.textContent =
            "五项都打完了。接下来回答：哪一项分数最低？哪一项你自己能动？接下来半年先动哪一项？";
        }
      }
    }

    score.addEventListener("click", function (e) {
      var dot = e.target.closest(".score__dot");
      if (!dot) return;
      var key = dot.closest(".score__row").getAttribute("data-key");
      var val = Number(dot.getAttribute("data-value"));
      state[key] = state[key] === val ? 0 : val;
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (err) {}
      render();
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        state = {};
        try {
          localStorage.removeItem(KEY);
        } catch (err) {}
        render();
      });
    }

    render();
  }

  /* ---------- 站内搜索 ---------- */
  var search = doc.querySelector("[data-search]");
  var trigger = doc.querySelector("[data-search-open]");
  if (!search || !trigger) return;

  var input = search.querySelector(".search__input");
  var list = search.querySelector(".search__results");
  var emptyEl = search.querySelector(".search__empty");
  var index = null;
  var loading = null;
  var active = -1;
  var hits = [];

  function load() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    loading = fetch("search.json", { cache: "force-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("search.json " + r.status);
        return r.json();
      })
      .then(function (data) {
        index = data;
        return data;
      })
      .catch(function () {
        index = [];
        return index;
      });
    return loading;
  }

  function open() {
    search.classList.add("is-open");
    search.removeAttribute("hidden");
    doc.documentElement.style.overflow = "hidden";
    load().then(function () {
      input.focus();
      input.select();
    });
  }

  function close() {
    search.classList.remove("is-open");
    doc.documentElement.style.overflow = "";
    active = -1;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function highlight(text, terms) {
    var safe = escapeHtml(text);
    if (!terms.length) return safe;
    var pattern = terms
      .filter(Boolean)
      .map(function (t) {
        return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("|");
    if (!pattern) return safe;
    return safe.replace(new RegExp("(" + pattern + ")", "gi"), "<mark>$1</mark>");
  }

  function snippet(text, terms) {
    var lower = text.toLowerCase();
    var at = -1;
    terms.forEach(function (t) {
      var i = lower.indexOf(t);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    });
    if (at < 0) at = 0;
    var start = Math.max(0, at - 32);
    var cut = text.slice(start, start + 96);
    return (start > 0 ? "…" : "") + cut + (start + 96 < text.length ? "…" : "");
  }

  function renderResults(terms) {
    list.innerHTML = "";
    emptyEl.hidden = hits.length > 0;
    hits.slice(0, 24).forEach(function (hit, i) {
      var li = doc.createElement("li");
      var a = doc.createElement("a");
      a.className = "search__hit" + (i === active ? " is-active" : "");
      a.href = hit.u;
      a.innerHTML =
        '<span class="hit__where">' +
        escapeHtml(hit.p) +
        '</span><span class="hit__title">' +
        highlight(hit.h, terms) +
        "</span>" +
        (hit.x ? '<span class="hit__snippet">' + highlight(snippet(hit.x, terms), terms) + "</span>" : "");
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  function run() {
    var q = input.value.trim().toLowerCase();
    if (!q) {
      hits = [];
      list.innerHTML = "";
      emptyEl.hidden = true;
      emptyEl.textContent = "输入关键词，搜索全书。";
      return;
    }
    var terms = q.split(/\s+/).filter(Boolean);
    load().then(function (data) {
      hits = data
        .map(function (item) {
          var hay = (item.t + " " + item.h + " " + item.x).toLowerCase();
          var score = 0;
          for (var i = 0; i < terms.length; i++) {
            var t = terms[i];
            if (hay.indexOf(t) < 0) return null;
            score += item.h.toLowerCase().indexOf(t) >= 0 ? 6 : 1;
            if (item.t.toLowerCase().indexOf(t) >= 0) score += 3;
          }
          return { item: item, score: score };
        })
        .filter(Boolean)
        .sort(function (a, b) {
          return b.score - a.score;
        })
        .map(function (r) {
          return r.item;
        });
      active = hits.length ? 0 : -1;
      renderResults(terms);
      if (!hits.length) {
        emptyEl.hidden = false;
        emptyEl.textContent = "没有找到「" + input.value.trim() + "」，换个词试试。";
      }
    });
  }

  trigger.addEventListener("click", open);
  search.addEventListener("click", function (e) {
    if (e.target === search) close();
  });
  doc.querySelectorAll("[data-search-close]").forEach(function (b) {
    b.addEventListener("click", close);
  });
  input.addEventListener("input", run);

  doc.addEventListener("keydown", function (e) {
    var isOpen = search.classList.contains("is-open");
    if (!isOpen) {
      if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && !/input|textarea/i.test(e.target.tagName)) {
        e.preventDefault();
        open();
      }
      return;
    }
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!hits.length) return;
      e.preventDefault();
      active = e.key === "ArrowDown" ? (active + 1) % hits.length : (active - 1 + hits.length) % hits.length;
      renderResults(input.value.trim().toLowerCase().split(/\s+/).filter(Boolean));
      var el = list.querySelectorAll(".search__hit")[active];
      if (el) el.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      if (active >= 0 && hits[active]) window.location.href = hits[active].u;
    }
  });
})();
