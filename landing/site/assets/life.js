/*
  Ariadne early access: the page's life. Vanilla JS, no libraries, no inline script.
  Runs only in the browser (static asset), so a page view still costs no Worker CPU.

    1. The red thread. One continuous, smooth curve computed from the real layout:
       it enters from the left edge, wanders the labyrinth beside the Door, runs under
       the threshold and drops down the page into "Ariadne's thread". It breathes a
       little, leans toward the pointer, gets tugged by scrolling, and carries a pulse
       of light toward the Door now and then (and on every few keystrokes).
    2. The Door listens. Focus the email and the leaves part a crack; once the email
       looks right they open a little more. (The real opening is early-access.js.)
    3. The hands. A miniature pass: a pulse runs Odysseus -> Daedalus -> You and stops
       at the knot. Nothing moves until the visitor ties it or sends it back.

  prefers-reduced-motion: the thread is drawn still, no pulses or sway, and the demo
  changes state without travelling. Everything here is decoration on top of a page
  that works without it (nojs.css hides it).
*/
(function () {
  "use strict";

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NS = "http://www.w3.org/2000/svg";

  // ---------- geometry helpers ----------
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
  // 1. The hero thread
  // =====================================================================
  var page = document.querySelector(".door-page");
  var door = page && page.querySelector(".door");
  var svg = door && door.querySelector(".hero-thread");
  if (page && door && svg) heroThread();

  function heroThread() {
    var line = svg.querySelector(".ht-line");
    var glow = svg.querySelector(".ht-glow");
    var bead = svg.querySelector(".ht-bead");
    var leadsOn = !!document.querySelector(".hands"); // the thread continues into the next section
    var base = [];       // resting points, in hero coordinates
    var weight = [];     // how much each point may move (ends stay pinned)
    var pointer = null, eased = null;
    var tug = 0, lastScroll = window.scrollY;
    var running = false, inView = true, drawn = false, len = 0;
    var pulse = null;    // { start, dur }
    var nextPulse = 0;
    // an open door draws the thread in along the floor and through its foot
    var pulls = [];
    var narrowFrom = -1, narrowTo = -1, narrowCap = 0;      // [index, x, y]: where a point eases to as the door opens
    var through = 0, throughTarget = 0;

    function layout() {
      var pr = page.getBoundingClientRect();
      var dr = door.getBoundingClientRect();
      var W = pr.width, H = pr.height;
      var dl = dr.left - pr.left, dt = dr.top - pr.top, db = dr.bottom - pr.top, drt = dr.right - pr.left;
      var cx = (dl + drt) / 2, h = db - dt, g = dl, below = H - db;
      narrowFrom = narrowTo = -1;
      // the svg covers the whole hero, but lives inside the door (so it sits behind the leaves)
      svg.style.left = -dl + "px";
      svg.style.top = -dt + "px";
      svg.style.width = W + "px";
      svg.style.height = H + "px";
      svg.setAttribute("viewBox", "0 0 " + W.toFixed(0) + " " + H.toFixed(0));
      var end = leadsOn ? [[cx - 6, db + below * 0.7], [cx, H + 6]] : [[cx - 4, db + Math.min(64, below * 0.55)]];
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
        // thread, runs down the thin gutter beside the arch (so it is there on the first
        // screen, never over the form), and turns in under the threshold to the Door's foot
        var mark = document.querySelector("header.top svg");
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
        narrowFrom = 1; narrowTo = 4; narrowCap = g + 8;   // gutter points: quiet, and kept off the doorway
      }
      var fi = leadsOn ? base.length - 2 : base.length - 1;
      var px = base[fi - 2][0];       // never pull back past the point before, or the thread doubles back
      pulls = [[fi, cx, db + 5], [fi - 1, px + (cx - px) * 0.55, db + 16]];
      weight = base.map(function (p, i) { return i === 0 || i >= base.length - (leadsOn ? 2 : 1) ? 0.25 : 1; });
      if (leadsOn) weight[base.length - 1] = 0;
      if (narrowFrom >= 0) {
        weight[0] = 0;   // tied to the logo
        for (var q = narrowFrom; q <= narrowTo; q++) weight[q] = 0.3;
      }
      render(performance.now());
      len = line.getTotalLength();
      if (!drawn) {
        svg.style.setProperty("--len", String(Math.ceil(len * 1.15)));
      }
    }

    function shaped(now) {
      var t = now / 1000;
      var amp = reduced ? 0 : 3.5 + Math.min(9, tug);
      var pr = null;
      if (eased && !reduced) pr = page.getBoundingClientRect();
      return base.map(function (p, i) {
        var w = weight[i];
        var bx = p[0], by = p[1];
        for (var k = 0; through > 0 && k < pulls.length; k++) {
          if (pulls[k][0] !== i) continue;
          bx += (pulls[k][1] - bx) * through;
          by += (pulls[k][2] - by) * through;
          w *= 1 - through * 0.8;
        }
        var x = bx + Math.sin(t * 0.7 + i * 1.3) * amp * w;
        var y = by + Math.cos(t * 0.55 + i * 0.9) * amp * w;
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

    var tail = svg.querySelector(".ht-end");
    function render(now) {
      var pts = shaped(now);
      var d = curve(pts);
      line.setAttribute("d", d);
      glow.setAttribute("d", d);
      if (!leadsOn && tail) {
        // nothing below to run into: the thread ends on a bead instead of stopping dead
        var last = pts[pts.length - 1];
        tail.setAttribute("cx", last[0].toFixed(1));
        tail.setAttribute("cy", last[1].toFixed(1));
      }
    }

    function frame(now) {
      if (!running) return;
      if (pointer) {
        if (!eased) eased = pointer.slice();
        eased[0] += (pointer[0] - eased[0]) * 0.08;
        eased[1] += (pointer[1] - eased[1]) * 0.08;
      }
      tug *= 0.94;
      through += (throughTarget - through) * 0.045;
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
      // fade in at the start, out as it reaches the end
      svg.style.setProperty("--pulse", String(Math.min(1, t * 6, (1 - t) * 5)));
    }

    function start() {
      if (running || reduced || !inView || !visibleNow()) return;
      running = true;
      requestAnimationFrame(frame);
    }
    function stop() { running = false; }

    // when the door opens, the thread is drawn in through its foot
    function stageChanged() {
      var stage = door.getAttribute("data-stage");
      throughTarget = stage === "open" || stage === "done" ? 1 : 0;
      start();
      if (!running) { through = throughTarget; render(performance.now()); }
    }
    if (window.MutationObserver) new MutationObserver(stageChanged).observe(door, { attributes: true, attributeFilter: ["data-stage"] });
    throughTarget = through = /open|done/.test(door.getAttribute("data-stage") || "") ? 1 : 0;

    layout();
    if (reduced) {
      drawn = true;
      svg.classList.add("drawn", "settled");
    } else {
      // write the thread on, then let it live
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

    // ---------- 2. the Door listens ----------
    var input = document.getElementById("ea-email");
    if (!input) return;
    var EMAIL = /^[^\s@"<>(),;:\\[\]]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zA-Z]{2,63}$/;
    var keys = 0, lastKeyPulse = 0;
    function mood() {
      var value = input.value.trim();
      var focused = document.activeElement === input;
      door.classList.toggle("attending", focused || value.length > 0);
      door.classList.toggle("ajar", EMAIL.test(value));
    }
    input.addEventListener("focus", mood);
    input.addEventListener("blur", mood);
    input.addEventListener("input", function () {
      mood();
      keys += 1;
      var now = performance.now();
      tug = Math.min(9, tug + 2.5);
      // every few keystrokes, a quicker pulse runs to the Door
      if (!reduced && drawn && !pulse && keys % 4 === 1 && now - lastKeyPulse > 1500) {
        lastKeyPulse = now;
        firePulse(now, 1600);
        start();
      }
    });
    mood();
  }

  // =====================================================================
  // 3. The hands: a pass in miniature
  // =====================================================================
  var stage = document.querySelector(".hands-stage");
  if (stage) hands();

  function hands() {
    var row = stage.querySelector(".hands-row");
    var hs = stage.querySelector(".hands-thread");
    var base = hs.querySelector(".hn-line");
    var trail = hs.querySelector(".hn-trail");
    var dot = hs.querySelector(".hn-pulse");
    var measure = hs.querySelector(".hn-measure");
    var status = document.getElementById("hands-status");
    var nodes = {
      o: row.querySelector('[data-hand="o"]'),
      d: row.querySelector('[data-hand="d"]'),
      y: row.querySelector('[data-hand="y"]'),
    };
    var tie = stage.querySelector('[data-act="tie"]');
    var back = stage.querySelector('[data-act="back"]');
    var again = stage.querySelector('[data-act="again"]');
    var actions = stage.querySelector(".knot-actions");
    var at = { o: 0, d: 0, y: 0 };  // length along the thread at each hand
    var pos = 0;                     // where the pulse is now
    var run = 0;                     // bumps to cancel a running sequence
    var started = false;

    stage.classList.add("live");

    function center(el) {
      var m = el.querySelector(".monogram").getBoundingClientRect();
      var s = stage.getBoundingClientRect();
      return [m.left + m.width / 2 - s.left, m.top + m.height / 2 - s.top];
    }
    function span(a, b, vertical) {
      // a thread hanging between two hands: a soft sag, sideways when stacked
      var sag = 16;
      if (vertical) {
        var dy = b[1] - a[1];
        return " C" + (a[0] + sag) + " " + (a[1] + dy / 3) + " " + (b[0] + sag) + " " + (b[1] - dy / 3) + " " + b[0] + " " + b[1];
      }
      var dx = b[0] - a[0];
      return " C" + (a[0] + dx / 3) + " " + (a[1] + sag) + " " + (b[0] - dx / 3) + " " + (b[1] + sag) + " " + b[0] + " " + b[1];
    }
    function layout() {
      var s = stage.getBoundingClientRect();
      hs.style.width = s.width + "px";
      hs.style.height = s.height + "px";
      hs.setAttribute("viewBox", "0 0 " + s.width.toFixed(0) + " " + s.height.toFixed(0));
      var o = center(nodes.o), d = center(nodes.d), y = center(nodes.y);
      var vertical = Math.abs(d[0] - o[0]) < 20;
      var first = "M" + o[0] + " " + o[1] + span(o, d, vertical);
      var full = first + span(d, y, vertical);
      base.setAttribute("d", full);
      trail.setAttribute("d", full);
      measure.setAttribute("d", first);
      at = { o: 0, d: measure.getTotalLength(), y: base.getTotalLength() };
      hs.style.setProperty("--len", String(Math.ceil(at.y)));
      place(pos > at.y ? at.y : pos);
    }
    function place(dist) {
      pos = dist;
      var p = base.getPointAtLength(dist);
      dot.setAttribute("cx", p.x.toFixed(1));
      dot.setAttribute("cy", p.y.toFixed(1));
    }
    function travel(from, to, ms, id) {
      return new Promise(function (resolve) {
        if (reduced) { place(to); resolve(); return; }
        var t0 = performance.now(), seg = 70, L = at.y;
        hs.classList.add("moving");
        function step(now) {
          if (id !== run) { hs.classList.remove("moving"); resolve(); return; }
          var t = Math.min(1, (now - t0) / ms);
          var dist = from + (to - from) * ease(t);
          place(dist);
          trail.style.strokeDasharray = seg + " " + (L + seg);
          trail.style.strokeDashoffset = String(to >= from ? seg - dist : -dist);
          if (t < 1) requestAnimationFrame(step);
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
      nodes.y.classList.remove("is-tied");
      again.hidden = true;
      waiting(false);
      place(0);
      active("o");
      say("Odysseus reads your brief and maps the corners.");
      return pause(1500, id)
        .then(function (ok) { if (!ok) return; say("He hands what he found along the thread…"); return travel(at.o, at.d, 1500, id); })
        .then(function () { if (id !== run) return; active("d"); say("Daedalus drafts from it, and Odysseus questions the draft."); return pause(1900, id); })
        .then(function (ok) { if (!ok) return; return travel(at.d, at.y, 1500, id); })
        .then(function () { if (id !== run) return; stopAtKnot(); });
    }
    function stopAtKnot() {
      active("y");
      waiting(true);
      say("It stops at your knot. Nothing moves on until you decide.");
    }

    tie.addEventListener("click", function () {
      if (tie.disabled) return;
      run += 1;
      waiting(false);
      nodes.y.classList.add("is-tied");
      active(null);
      say("Tied. Only now does the work move on to the next step.");
      again.hidden = false;
      again.focus({ preventScroll: true });
    });
    back.addEventListener("click", function () {
      if (back.disabled) return;
      var id = (run += 1);
      waiting(false);
      say("Sent back with your note. Daedalus revises…");
      travel(at.y, at.d, 1200, id)
        .then(function () { if (id !== run) return; active("d"); return pause(1300, id); })
        .then(function (ok) { if (!ok) return; say("…Odysseus checks the new draft, and it comes back to you."); return travel(at.d, at.y, 1400, id); })
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
      }, { threshold: 0.45 }).observe(stage);
    } else begin();
  }
})();
