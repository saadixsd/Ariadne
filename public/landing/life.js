/*
  Ariadne landing page: the page's life. Vanilla JS, no libraries. Ported from the old
  early-access site (landing/site/assets/life.js). A static file, so a page view still
  costs the Worker nothing.

    1. The red thread. One smooth curve computed from the real layout: it enters from the
       left edge, wanders the labyrinth beside the Door, runs under the threshold and drops
       down the page. It breathes a little, leans toward the pointer, gets tugged by
       scrolling, and carries a pulse of light toward the Door now and then.
    2. The Door listens. Reach for "Tie the Thread" and the leaves part a crack; press it
       and they swing open before the sign-up page loads.
    3. A pass, in miniature: Draft -> Challenge -> Judge, stopping at your knot. Nothing
       moves on until the visitor ties it off or sends it back. An animation of the steps,
       not a result: it shows no invented output.

  prefers-reduced-motion: the thread is drawn still, no pulses or sway, the Door does not
  swing, and the demo changes state without travelling. Everything here is decoration on
  top of a page that is complete without it.
*/
(function () {
  "use strict";

  var root = document.querySelector(".lp");
  if (!root || root.getAttribute("data-live") === "1") return;
  root.setAttribute("data-live", "1");
  root.classList.add("lp-live");

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Catmull-Rom through the points, as cubic Beziers: smooth, passes every point. */
  function curve(points) {
    var d = "M" + points[0][0].toFixed(1) + " " + points[0][1].toFixed(1);
    for (var i = 0; i < points.length - 1; i += 1) {
      var p0 = points[i - 1] || points[i];
      var p1 = points[i];
      var p2 = points[i + 1];
      var p3 = points[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += " C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) + " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
    }
    return d;
  }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function visibleNow() { return document.visibilityState !== "hidden"; }

  // =====================================================================
  // 1. The hero thread, and 2. the Door
  // =====================================================================
  var page = root.querySelector(".lp-hero");
  var door = page && page.querySelector(".lp-door");
  var svg = door && door.querySelector(".lp-hero-thread");
  if (page && door && svg) heroThread();

  function heroThread() {
    var line = svg.querySelector(".ht-line");
    var glow = svg.querySelector(".ht-glow");
    var bead = svg.querySelector(".ht-bead");
    var base = [];
    var weight = [];
    var pointer = null, eased = null;
    var tug = 0, lastScroll = window.scrollY;
    var running = false, inView = true, drawn = false;
    var pulse = null;
    var nextPulse = 0;
    var narrowFrom = -1, narrowTo = -1, narrowCap = 0;

    function layout() {
      var pr = page.getBoundingClientRect();
      var dr = door.getBoundingClientRect();
      var W = pr.width, H = pr.height;
      var dl = dr.left - pr.left, dt = dr.top - pr.top, db = dr.bottom - pr.top, drt = dr.right - pr.left;
      var cx = (dl + drt) / 2, h = db - dt, g = dl, below = H - db;
      narrowFrom = narrowTo = -1;
      svg.style.left = -dl + "px";
      svg.style.top = -dt + "px";
      svg.style.width = W + "px";
      svg.style.height = H + "px";
      svg.setAttribute("viewBox", "0 0 " + W.toFixed(0) + " " + H.toFixed(0));
      // the thread leads on down the page, into the next section
      var end = [[cx - 6, db + below * 0.7], [cx, H + 6]];
      if (g >= 170) {
        // wide: wander the open floor beside the Door, never closer than 28px to it
        var room = g - 28;
        base = [
          [-40, dt + h * 0.30],
          [room * 0.30, dt + h * 0.37],
          [room * 0.58, dt + h * 0.25],
          [room * 0.88, dt + h * 0.42],
          [room * 0.56, dt + h * 0.62],
          [room * 0.34, dt + h * 0.82],
          [room * 0.70, db + 14],
          [dl + (cx - dl) * 0.42, db + Math.min(40, below * 0.42)],
        ].concat(end);
      } else {
        // narrow: the Door nearly fills the width. The thread hangs from the logo's own
        // thread, runs down the thin gutter beside the arch and turns in under the threshold
        var mark = root.querySelector(".lp-top .lp-brand svg");
        var mr = mark && mark.getBoundingClientRect();
        var sx = mr && mr.width ? mr.left - pr.left + mr.width * 0.12 : Math.max(6, g * 0.5);
        var sy = mr && mr.width ? mr.bottom - pr.top - mr.height * 0.2 : Math.max(0, dt - 40);
        var gx = Math.max(5, g * 0.5);
        base = [
          [sx, sy],
          [gx + 2, dt + Math.min(40, h * 0.06)],
          [gx, dt + h * 0.32],
          [gx + 1, dt + h * 0.64],
          [gx, db - 18],
          [g + 36, db + Math.min(30, below * 0.3)],
        ].concat(end);
        narrowFrom = 1; narrowTo = 4; narrowCap = g + 8;
      }
      weight = base.map(function (p, i) { return i === 0 || i >= base.length - 2 ? 0.25 : 1; });
      weight[base.length - 1] = 0;
      if (narrowFrom >= 0) {
        weight[0] = 0;
        for (var q = narrowFrom; q <= narrowTo; q++) weight[q] = 0.3;
      }
      render(performance.now());
      if (!drawn) svg.style.setProperty("--len", String(Math.ceil(line.getTotalLength() * 1.15)));
    }

    function shaped(now) {
      var t = now / 1000;
      var amp = reduced ? 0 : 3.5 + Math.min(9, tug);
      var pr = eased && !reduced ? page.getBoundingClientRect() : null;
      return base.map(function (p, i) {
        var w = weight[i];
        var x = p[0] + Math.sin(t * 0.7 + i * 1.3) * amp * w;
        var y = p[1] + Math.cos(t * 0.55 + i * 0.9) * amp * w;
        if (pr) {
          var px = eased[0] - pr.left, py = eased[1] - pr.top;
          var dx = px - x, dy = py - y, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 260 && dist > 0.1) {
            var k = Math.pow(1 - dist / 260, 2) * 26 * w;
            x += (dx / dist) * k;
            y += (dy / dist) * k;
          }
        }
        if (i >= narrowFrom && i <= narrowTo) x = Math.min(x, narrowCap);
        return [x, y];
      });
    }

    function render(now) {
      var d = curve(shaped(now));
      line.setAttribute("d", d);
      glow.setAttribute("d", d);
    }

    function frame(now) {
      if (!running) return;
      if (pointer) {
        if (!eased) eased = pointer.slice();
        eased[0] += (pointer[0] - eased[0]) * 0.08;
        eased[1] += (pointer[1] - eased[1]) * 0.08;
      }
      tug *= 0.94;
      render(now);
      if (drawn && !pulse && now > nextPulse) firePulse(now, 3000);
      if (pulse) stepPulse(now);
      requestAnimationFrame(frame);
    }

    function firePulse(now, dur) {
      pulse = { start: now, dur: dur };
      svg.classList.add("pulsing");
    }
    function stepPulse(now) {
      var t = (now - pulse.start) / pulse.dur;
      var L = line.getTotalLength();
      if (t >= 1) {
        pulse = null;
        svg.classList.remove("pulsing");
        nextPulse = now + 5200 + Math.random() * 2600;
        return;
      }
      var dist = ease(t) * L;
      var seg = 90;
      glow.style.strokeDasharray = seg + " " + (L + seg);
      glow.style.strokeDashoffset = String(seg - dist);
      var pt = line.getPointAtLength(dist);
      bead.setAttribute("cx", pt.x.toFixed(1));
      bead.setAttribute("cy", pt.y.toFixed(1));
      svg.style.setProperty("--pulse", String(Math.min(1, t * 6, (1 - t) * 5)));
    }

    function start() {
      if (running || reduced || !inView || !visibleNow()) return;
      running = true;
      requestAnimationFrame(frame);
    }
    function stop() { running = false; }

    layout();
    if (reduced) {
      drawn = true;
      svg.classList.add("drawn", "settled");
    } else {
      requestAnimationFrame(function () {
        svg.classList.add("drawn");
        setTimeout(function () { svg.classList.add("settled"); }, 2500);
        setTimeout(function () { drawn = true; nextPulse = performance.now() + 600; }, 2300);
      });
      start();
    }

    if (window.ResizeObserver) {
      var pending = false;
      new ResizeObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; layout(); });
      }).observe(door);
    }
    window.addEventListener("resize", layout);
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) start(); else stop();
      }).observe(page);
    }
    document.addEventListener("visibilitychange", function () { if (visibleNow()) start(); else stop(); });
    window.addEventListener("pointermove", function (event) {
      if (event.pointerType === "mouse" || event.pointerType === "pen") pointer = [event.clientX, event.clientY];
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", function () { pointer = null; eased = null; });
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      tug = Math.min(9, tug + Math.abs(y - lastScroll) * 0.06);
      lastScroll = y;
    }, { passive: true });

    // ---------- 2. the Door listens, and opens ----------
    var cta = door.querySelector("[data-door-cta]");
    if (!cta) return;
    function attend(on) {
      if (door.getAttribute("data-stage") !== "closed") return;
      door.classList.toggle("attending", on);
      if (on && !reduced && drawn && !pulse) { firePulse(performance.now(), 1600); start(); }
    }
    cta.addEventListener("pointerenter", function () { attend(true); });
    cta.addEventListener("pointerleave", function () { attend(false); });
    cta.addEventListener("focus", function () { attend(true); });
    cta.addEventListener("blur", function () { attend(false); });
    cta.addEventListener("click", function (event) {
      // a modified click (new tab, etc.) or reduced motion: just follow the link
      if (reduced || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      var href = cta.getAttribute("href");
      door.classList.remove("attending");
      door.setAttribute("data-stage", "open");
      setTimeout(function () { window.location.assign(href); }, 650);
    });
    // Coming back with the browser's Back button restores the page from the cache: shut the door.
    window.addEventListener("pageshow", function (event) {
      if (event.persisted) door.setAttribute("data-stage", "closed");
    });
  }

  // =====================================================================
  // 3. A pass in miniature: Draft -> Challenge -> Judge (-> Tie Off)
  // =====================================================================
  var stage = root.querySelector(".lp-stage");
  if (stage) steps();

  function steps() {
    var row = stage.querySelector(".lp-steps");
    var hs = stage.querySelector(".lp-steps-thread");
    var baseLine = hs.querySelector(".hn-line");
    var trail = hs.querySelector(".hn-trail");
    var dot = hs.querySelector(".hn-pulse");
    var measure = hs.querySelector(".hn-measure");
    var status = document.getElementById("lp-demo-status");
    var nodes = {
      d: row.querySelector('[data-step="draft"]'),
      o: row.querySelector('[data-step="challenge"]'),
      y: row.querySelector('[data-step="judge"]'),
      t: row.querySelector('[data-step="tie"]'),
    };
    var tie = stage.querySelector('[data-act="tie"]');
    var back = stage.querySelector('[data-act="back"]');
    var again = stage.querySelector('[data-act="again"]');
    var actions = stage.querySelector(".lp-knot-actions");
    var at = { d: 0, o: 0, y: 0, t: 0 };
    var pos = 0;
    var run = 0;
    var started = false;

    stage.classList.add("live");

    function center(el) {
      var m = el.querySelector(".lp-monogram").getBoundingClientRect();
      var s = stage.getBoundingClientRect();
      return [m.left + m.width / 2 - s.left, m.top + m.height / 2 - s.top];
    }
    function span(a, b) {
      // a thread hanging between two hands: a soft sag, sideways when stacked
      var sag = 16;
      if (Math.abs(b[0] - a[0]) < 20) {
        var dy = b[1] - a[1];
        return " C" + (a[0] + sag) + " " + (a[1] + dy / 3) + " " + (b[0] + sag) + " " + (b[1] - dy / 3) + " " + b[0] + " " + b[1];
      }
      if (Math.abs(b[1] - a[1]) > 40) {
        // two-by-two grid: the thread drops from the end of one row to the start of the next
        var midY = (a[1] + b[1]) / 2;
        return " C" + a[0] + " " + (midY + 30) + " " + b[0] + " " + (midY - 30) + " " + b[0] + " " + b[1];
      }
      var dx = b[0] - a[0];
      return " C" + (a[0] + dx / 3) + " " + (a[1] + sag) + " " + (b[0] - dx / 3) + " " + (b[1] + sag) + " " + b[0] + " " + b[1];
    }
    function layout() {
      var s = stage.getBoundingClientRect();
      hs.style.width = s.width + "px";
      hs.style.height = s.height + "px";
      hs.setAttribute("viewBox", "0 0 " + s.width.toFixed(0) + " " + s.height.toFixed(0));
      var d = center(nodes.d), o = center(nodes.o), y = center(nodes.y), t = center(nodes.t);
      var start = "M" + d[0] + " " + d[1];
      var toO = start + span(d, o);
      var toY = toO + span(o, y);
      var full = toY + span(y, t);
      baseLine.setAttribute("d", full);
      trail.setAttribute("d", full);
      measure.setAttribute("d", toO);
      at.o = measure.getTotalLength();
      measure.setAttribute("d", toY);
      at.y = measure.getTotalLength();
      at.t = baseLine.getTotalLength();
      hs.style.setProperty("--len", String(Math.ceil(at.t)));
      place(Math.min(pos, at.t));
    }
    function place(dist) {
      pos = dist;
      var p = baseLine.getPointAtLength(dist);
      dot.setAttribute("cx", p.x.toFixed(1));
      dot.setAttribute("cy", p.y.toFixed(1));
    }
    function travel(from, to, ms, id) {
      return new Promise(function (resolve) {
        if (reduced) { place(to); resolve(); return; }
        var t0 = performance.now(), seg = 70, L = at.t;
        hs.classList.add("moving");
        function step(now) {
          if (id !== run) { hs.classList.remove("moving"); resolve(); return; }
          var k = Math.min(1, (now - t0) / ms);
          var dist = from + (to - from) * ease(k);
          place(dist);
          trail.style.strokeDasharray = seg + " " + (L + seg);
          trail.style.strokeDashoffset = String(to >= from ? seg - dist : -dist);
          if (k < 1) requestAnimationFrame(step);
          else { hs.classList.remove("moving"); resolve(); }
        }
        requestAnimationFrame(step);
      });
    }
    function pause(ms, id) {
      return new Promise(function (resolve) { setTimeout(function () { resolve(id === run); }, ms); });
    }
    function active(which) {
      Object.keys(nodes).forEach(function (k) { nodes[k].classList.toggle("is-active", k === which); });
    }
    function say(text) { status.textContent = text; }
    function waiting(on) {
      nodes.y.classList.toggle("is-waiting", on);
      actions.classList.toggle("on", on);
      tie.disabled = back.disabled = !on;
    }

    function pass() {
      var id = (run += 1);
      nodes.t.classList.remove("is-tied");
      again.hidden = true;
      waiting(false);
      place(0);
      active("d");
      say("Daedalus writes the draft from your brief.");
      return pause(1500, id)
        .then(function (ok) { if (!ok) return; say("He hands it along the thread…"); return travel(at.d, at.o, 1400, id); })
        .then(function () { if (id !== run) return; active("o"); say("Odysseus, a different model, looks for what is wrong, unsupported or missing."); return pause(2100, id); })
        .then(function (ok) { if (!ok) return; return travel(at.o, at.y, 1400, id); })
        .then(function () { if (id !== run) return; stopAtKnot(); });
    }
    function stopAtKnot() {
      active("y");
      waiting(true);
      say("It stops at your knot. Nothing moves on until you decide.");
    }

    tie.addEventListener("click", function () {
      if (tie.disabled) return;
      var id = (run += 1);
      waiting(false);
      travel(at.y, at.t, 900, id).then(function () {
        if (id !== run) return;
        active(null);
        nodes.t.classList.add("is-tied");
        say("Tied off. The answer is yours, and it says so.");
        again.hidden = false;
        again.focus({ preventScroll: true });
      });
    });
    back.addEventListener("click", function () {
      if (back.disabled) return;
      var id = (run += 1);
      waiting(false);
      say("Sent back with your note. Daedalus revises…");
      travel(at.y, at.d, 1400, id)
        .then(function () { if (id !== run) return; active("d"); return pause(1200, id); })
        .then(function (ok) { if (!ok) return; say("…Odysseus checks the new draft, and it comes back to you."); return travel(at.d, at.y, 1600, id); })
        .then(function () { if (id !== run) return; stopAtKnot(); tie.focus({ preventScroll: true }); });
    });
    again.addEventListener("click", function () { pass(); });

    layout();
    if (window.ResizeObserver) new ResizeObserver(function () { layout(); }).observe(stage);
    window.addEventListener("resize", layout);
    function begin() {
      if (started) return;
      started = true;
      stage.classList.add("drawn");
      setTimeout(pass, reduced ? 0 : 1100);
    }
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries, observer) {
        if (entries[0].isIntersecting) { observer.disconnect(); begin(); }
      }, { threshold: 0.35 }).observe(stage);
    } else begin();
  }
})();
