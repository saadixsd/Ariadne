/*
  Ariadne early access: the staged door. Vanilla JS, no inline script (the CSP allows
  only this file and Turnstile).

    1. email + Turnstile -> POST /api/early-access saves the row, returns a signed token
    2. the door opens; the thread writes each question in turn; every answer (or skip)
       -> PATCH /api/early-access { token, ... } fills the same row
    3. the thread ties a knot: thank you

  Without this script the page loads nojs.css and is one plain form. Under
  prefers-reduced-motion every transition is instant (CSS), and the waits here are 0.
*/
(function () {
  "use strict";

  var form = document.getElementById("ea");
  if (!form) return;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var EMAIL = /^[^\s@"<>(),;:\\[\]]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zA-Z]{2,63}$/;
  var STEPS = ["usesAiFor", "tools", "switching"];
  var door = form.closest(".door");
  var input = document.getElementById("ea-email");
  var msg = document.getElementById("ea-msg");
  var box = document.getElementById("ea-turnstile");
  var done = document.getElementById("ea-done");
  var startButton = form.querySelector('[data-next="email"]');
  var current = "email";
  var token = null;
  var queue = [];
  var widget = null;
  var human = "";
  var humanWaiters = [];
  var humanFailed = false;
  var sending = false;

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, reduced ? 0 : ms); });
  }

  function step(name) {
    return form.querySelector('[data-step="' + name + '"]');
  }

  function say(text, tone) {
    msg.textContent = text || "";
    if (tone) msg.setAttribute("data-tone", tone);
    else msg.removeAttribute("data-tone");
  }

  function busy(button, on, label) {
    if (!button) return;
    if (on) button.setAttribute("data-label", button.textContent);
    button.disabled = on;
    button.textContent = on ? label : button.getAttribute("data-label") || button.textContent;
  }

  // ---------- Turnstile (async script: render when it lands) ----------
  function settle(value) {
    human = value || "";
    var list = humanWaiters;
    humanWaiters = [];
    list.forEach(function (resolve) { resolve(human); });
  }
  function renderTurnstile() {
    if (widget !== null || !window.turnstile) return;
    widget = window.turnstile.render(box, {
      sitekey: box.getAttribute("data-sitekey"),
      action: "early-access",
      appearance: "interaction-only",
      theme: "light",
      size: "flexible",
      "refresh-expired": "auto",
      callback: function (value) { humanFailed = false; settle(value); },
      "expired-callback": function () { human = ""; },
      "error-callback": function () { humanFailed = true; settle(""); return true; },
    });
  }
  if (window.turnstile) renderTurnstile();
  else {
    var tries = 0;
    var poll = setInterval(function () {
      tries += 1;
      if (window.turnstile) { clearInterval(poll); renderTurnstile(); }
      else if (tries > 100) clearInterval(poll);
    }, 200);
  }
  function humanToken(ms) {
    if (human) return Promise.resolve(human);
    return new Promise(function (resolve) {
      humanWaiters.push(resolve);
      setTimeout(function () { resolve(human); }, ms);
    });
  }
  function resetHuman() {
    human = "";
    if (widget !== null && window.turnstile) window.turnstile.reset(widget);
  }

  function api(method, body) {
    return fetch("/api/early-access", {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (response) {
      return response.json().catch(function () { return {}; });
    });
  }

  // ---------- step 1: the email ----------
  function submitEmail() {
    var email = input.value.trim();
    if (!EMAIL.test(email) || email.length > 254) {
      input.setAttribute("aria-invalid", "true");
      say("That email doesn't look right. Check it and try again.", "error");
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    if (!window.turnstile) {
      say("The human check didn't load. Turn off any blocker for this page, then reload.", "error");
      return;
    }
    sending = true;
    busy(startButton, true, "Opening…");
    if (!human) say("Checking you're human…", "info");
    var params = new URLSearchParams(location.search);
    var utm = {};
    ["source", "medium", "campaign"].forEach(function (key) {
      var value = params.get("utm_" + key);
      if (value) utm[key] = value.slice(0, 80);
    });
    humanToken(8000)
      .then(function (value) {
        if (!value) {
          throw { message: humanFailed ? "We couldn't confirm you're human. Reload the page and try again." : "Still checking you're human. Give it a moment, then press the button again." };
        }
        say("");
        return api("POST", { email: email, turnstileToken: value, referrer: document.referrer || "", utm: utm });
      })
      .then(function (body) {
        if (body.code === "received" || body.code === "already") {
          token = body.token;
          queue = STEPS.filter(function (name) { return (body.remaining || []).indexOf(name) !== -1; });
          return openDoor(body.code === "already" && !token);
        }
        if (body.code === "invalid_email") { input.setAttribute("aria-invalid", "true"); input.focus(); }
        throw { message: body.message };
      })
      .catch(function (error) {
        resetHuman();
        busy(startButton, false);
        sending = false;
        say((error && error.message) || "We couldn't reach the server. Check your connection and try again.", "error");
      });
  }

  // ---------- the door opens ----------
  function openDoor(alreadyDone) {
    // hold the door's height so the swing doesn't jump the page
    door.style.minHeight = door.offsetHeight + "px";
    step("email").classList.add("leaving");
    return wait(260)
      .then(function () {
        step("email").classList.add("gone");
        // a disabled default button would block Enter-to-submit on the questions
        startButton.type = "button";
        door.setAttribute("data-stage", "open");
        return wait(950);
      })
      .then(function () {
        sending = false;
        if (alreadyDone || !queue.length) return finish(alreadyDone);
        show(queue.shift());
      });
  }

  // ---------- steps 2-4: the thread writes each question ----------
  function show(name) {
    var el = step(name);
    current = name;
    el.classList.add("on");
    // restart the writing animation even if this element ran it before
    el.classList.remove("writing");
    void el.offsetWidth;
    el.classList.add("writing");
    var first = el.querySelector("input");
    wait(1500).then(function () { if (first && current === name) first.focus({ preventScroll: true }); });
    if (!reduced) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function answerFor(name) {
    var data = new FormData(form);
    if (name === "usesAiFor") return { usesAiFor: String(data.get("usesAiFor") || "").slice(0, 280) };
    if (name === "tools") return { tools: data.getAll("tools").map(String), toolsOther: String(data.get("toolsOther") || "").slice(0, 80) };
    return { switching: String(data.get("switching") || "") };
  }

  function advance(name, skip) {
    if (sending) return;
    var el = step(name);
    var next = queue.shift();
    var body = skip ? {} : answerFor(name);
    body.token = token;
    if (!next) body.done = true;
    var button = el.querySelector("[data-next]");
    sending = true;
    busy(button, true, "Saving…");
    say("");
    var nothing = skip && next; // a skip mid-way has nothing to save
    (nothing ? Promise.resolve({ code: "saved" }) : api("PATCH", body))
      .then(function (result) {
        if (result.code !== "saved") throw { message: result.message };
        el.classList.remove("on", "writing");
        busy(button, false);
        sending = false;
        if (next) show(next);
        else finish(false);
      })
      .catch(function (error) {
        if (next) queue.unshift(next);
        busy(button, false);
        sending = false;
        say((error && error.message) || "We couldn't save that. Check your connection and try again.", "error");
      });
  }

  // ---------- the knot ----------
  function finish(already) {
    if (already) {
      done.querySelector("[data-done-title]").textContent = "You're already in.";
      done.querySelector("[data-done-text]").textContent = "We already have your request and your answers. I read every one and invite a few people at a time, so there's nothing more to do.";
    }
    form.hidden = true;
    done.hidden = false;
    door.setAttribute("data-stage", "done");
    done.focus({ preventScroll: true });
    if (!reduced) done.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ---------- wiring ----------
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (current === "email") { if (!sending) submitEmail(); }
    else advance(current, false);
  });
  form.addEventListener("click", function (event) {
    var target = event.target;
    if (target && target.hasAttribute && target.hasAttribute("data-skip")) advance(current, true);
  });
  input.addEventListener("input", function () {
    if (input.getAttribute("aria-invalid") === "true") { input.removeAttribute("aria-invalid"); say(""); }
  });

  // a no-JS round trip that came back with an error
  var errors = { email: "That email doesn't look right. Check it and try again.", human: "We couldn't confirm you're human. Try again.", rate: "Too many tries from this network. Give it an hour, then try again.", later: "We couldn't check the form just now. Try again in a minute." };
  var e = new URLSearchParams(location.search).get("e");
  if (e && errors[e]) say(errors[e], "error");
})();
