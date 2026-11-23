/* Worksheet Bank: register the service worker, offer install, prompt for updates. */
(function () {
  "use strict";
  var VERSION = "1.6";
  var UPDATE_WAIT_MS = 8000;
  var CHECK_MS = 2 * 60 * 1000;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  }
  function isIos() {
    var ua = window.navigator.userAgent || "";
    var iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return iOS && !window.MSStream;
  }

  function injectStyles() {
    if (document.getElementById("pwa-styles")) return;
    var s = document.createElement("style");
    s.id = "pwa-styles";
    s.textContent = [
      ".pwa-update{position:fixed;left:50%;bottom:calc(1rem + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:80;",
      "width:min(26rem,calc(100% - 2rem));background:#1f3b66;color:#fff;border-radius:1.1rem;padding:.7rem .8rem;box-shadow:0 .5rem 1.75rem rgba(30,50,80,.28);",
      "display:flex;align-items:center;gap:.65rem;font-family:inherit}",
      ".pwa-update p{margin:0;font-weight:800;font-size:.95rem;line-height:1.25;flex:1}",
      ".pwa-update .ver{display:block;font-size:.75rem;font-weight:700;opacity:.8;margin-top:.15rem}",
      ".pwa-update button{appearance:none;border:none;border-radius:999px;min-height:2.5rem;padding:0 .95rem;font-weight:800;font-family:inherit;cursor:pointer}",
      ".pwa-update .later{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.45)}",
      ".pwa-update .go{background:#ffd51a;color:#3a2a00}",
      ".pwa-update button[disabled]{opacity:.6;cursor:default}",
      ".ios-hint{display:none;position:fixed;left:50%;bottom:calc(1rem + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:80;",
      "width:min(22rem,calc(100% - 2rem));background:#fff;color:#1a1a1a;border-radius:1.1rem;padding:1rem 1.1rem .85rem;text-align:center;",
      "box-shadow:0 .5rem 1.75rem rgba(30,50,80,.22);font-family:inherit}",
      ".ios-hint.open{display:block}",
      ".ios-hint p{margin:0 0 .7rem;font-weight:700;line-height:1.35}",
      ".ios-hint button{appearance:none;border:none;background:#2a6edb;color:#fff;font-weight:800;border-radius:999px;min-height:2.5rem;padding:0 1rem;cursor:pointer;font-family:inherit}",
      ".install-btn{appearance:none;border:none;background:#ffd51a;color:#3a2a00;font-weight:800;border-radius:999px;padding:.55rem 1.15rem;",
      "min-height:2.75rem;cursor:pointer;font-family:inherit;font-size:1rem;box-shadow:0 2px 0 rgba(0,0,0,.12)}",
      ".install-btn:active{transform:translateY(1px)}",
      ".pwa-actions{margin:.8rem 0 0;display:flex;justify-content:center;gap:.5rem}"
    ].join("");
    document.head.appendChild(s);
  }

  var dismissed = false, updating = false, remoteId = null, registration = null, deferredPrompt = null;

  function versionUrl() {
    return new URL("version.json?t=" + Date.now(), document.baseURI).href;
  }
  async function fetchRemoteVersion(signal) {
    var res = await fetch(versionUrl(), { cache: "no-store", signal: signal });
    if (!res.ok) return null;
    var data = await res.json();
    return (data && (data.version || data.id || data.built)) || null;
  }

  function showBanner() {
    if (dismissed) return;
    var el = document.getElementById("pwa-update");
    if (!el) {
      el = document.createElement("div");
      el.id = "pwa-update";
      el.className = "pwa-update";
      el.setAttribute("role", "status");
      el.innerHTML = '<p>A new version of Worksheet Bank is ready.<span class="ver"></span></p>'
        + '<button type="button" class="later">Later</button>'
        + '<button type="button" class="go">Update</button>';
      el.querySelector(".later").addEventListener("click", function () { dismissed = true; el.remove(); });
      el.querySelector(".go").addEventListener("click", function () { applyUpdate(); });
      document.body.appendChild(el);
    }
    var ver = el.querySelector(".ver");
    if (ver) ver.textContent = remoteId && remoteId !== VERSION ? ("Version " + VERSION + " → Version " + remoteId) : "";
    el.querySelector(".go").disabled = updating;
    el.querySelector(".go").textContent = updating ? "Updating…" : "Update";
  }

  function waitForWaiting(reg, timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        clearInterval(poll); clearTimeout(to);
        resolve(ok);
      }
      function inspect() {
        if (reg.waiting) finish(true);
      }
      inspect();
      if (reg.installing) {
        reg.installing.addEventListener("statechange", inspect);
      }
      var poll = setInterval(inspect, 200);
      var to = setTimeout(function () { finish(false); }, timeoutMs);
    });
  }

  async function applyUpdate() {
    if (updating) return;
    updating = true;
    showBanner();
    var reloaded = false;
    function reload() {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    }
    try {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener("controllerchange", reload);
        var reg = registration || await navigator.serviceWorker.getRegistration();
        if (reg) {
          if (!reg.waiting) {
            try { await reg.update(); } catch (e) {}
            await waitForWaiting(reg, UPDATE_WAIT_MS);
          }
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
            setTimeout(reload, 1500);
            return;
          }
        }
      }
    } catch (e) {}
    try {
      if (navigator.serviceWorker) {
        var regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function (r) { return r.unregister(); }));
      }
      if (window.caches) {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }
    } catch (e) {}
    reload();
  }

  async function checkVersion() {
    try {
      var id = await fetchRemoteVersion();
      if (id && id !== VERSION) {
        remoteId = id;
        if (registration) { try { registration.update(); } catch (e) {} }
        showBanner();
      }
    } catch (e) { /* offline */ }
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    var url = new URL("sw.js", document.baseURI).href;
    navigator.serviceWorker.register(url, { scope: "./" }).then(function (reg) {
      registration = reg;
      if (reg.waiting) showBanner();
      reg.addEventListener("updatefound", function () {
        var w = reg.installing;
        if (!w) return;
        w.addEventListener("statechange", function () {
          if (w.state === "installed" && navigator.serviceWorker.controller) showBanner();
        });
      });
    }).catch(function () { /* registration failed (e.g. file://) */ });
  }

  function setupInstall() {
    var btn = document.getElementById("installBtn");
    if (!btn) return;
    if (isStandalone()) { btn.hidden = true; return; }

    function showIosHint() {
      var hint = document.getElementById("iosHint");
      if (!hint) {
        hint = document.createElement("div");
        hint.id = "iosHint";
        hint.className = "ios-hint";
        hint.setAttribute("role", "dialog");
        hint.innerHTML = "<p>To install this app, tap the Share button, then <strong>Add to Home Screen</strong>.</p><button type='button'>Got it</button>";
        hint.querySelector("button").addEventListener("click", function () { hint.classList.remove("open"); });
        document.body.appendChild(hint);
      }
      hint.classList.add("open");
    }

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      btn.hidden = false;
    });
    window.addEventListener("appinstalled", function () {
      deferredPrompt = null;
      btn.hidden = true;
    });

    if (isIos()) btn.hidden = false;

    btn.addEventListener("click", function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function () { deferredPrompt = null; btn.hidden = true; });
        return;
      }
      if (isIos()) showIosHint();
    });
  }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(function () {
    injectStyles();
    setupInstall();
    registerSW();
    checkVersion();
    setInterval(checkVersion, CHECK_MS);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") checkVersion();
    });
  });
})();
