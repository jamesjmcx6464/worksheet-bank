/* Worksheet Bank profiles: emoji avatars, up to 5 profiles, 5 saved worksheets each.
   Shared by the home menu and every worksheet. Guest mode keeps the original
   ws-bank:<id>:<hash> autosave keys so existing work is not lost. */
(function (global) {
  "use strict";

  var MAX_PROFILES = 5;
  var MAX_SAVED = 5;
  var REG_KEY = "wsb.profiles";
  var THUMB_SIDE = 240;
  var EMOJIS = [
    "🦊", "🐼", "🐸", "🦄", "🐯", "🐰",
    "🐨", "🐧", "🦋", "🐢", "🐬", "🦁",
    "🐵", "🦉", "🐝", "🦖", "🐶", "🐱",
    "🌸", "🌈", "⭐", "🚀", "🎨", "🍎"
  ];

  var listeners = [];
  var cssInjected = false;
  var domReady = false;

  function guestProfile() {
    return { id: null, emoji: "👤", name: "Guest", guest: true };
  }

  function displayName(p) {
    if (!p || p.guest) return "Guest";
    var n = (p.name || "").trim();
    return n || "Friend";
  }

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }

  function isQuota(err) {
    return err && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" || err.code === 22);
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { return false; }
  }

  function emptyRegistry() {
    return { v: 1, current: null, profiles: [] };
  }

  function readRegistry() {
    var d = safeParse(localStorage.getItem(REG_KEY), null);
    if (!d || typeof d !== "object") return emptyRegistry();
    var list = Array.isArray(d.profiles) ? d.profiles : [];
    var clean = [];
    for (var i = 0; i < list.length && clean.length < MAX_PROFILES; i++) {
      var p = list[i];
      if (!p || !p.id) continue;
      clean.push({
        id: String(p.id),
        emoji: (p.emoji && String(p.emoji).trim()) || "⭐",
        name: String(p.name || "").trim().slice(0, 12),
        created: p.created || 0
      });
    }
    var current = d.current || null;
    if (current && !clean.some(function (p) { return p.id === current; })) current = null;
    return { v: 1, current: current, profiles: clean };
  }

  function writeRegistry(reg) {
    return safeSet(REG_KEY, JSON.stringify({ v: 1, current: reg.current || null, profiles: reg.profiles || [] }));
  }

  function currentId() {
    return readRegistry().current || null;
  }

  function findProfile(id) {
    if (!id) return null;
    var list = readRegistry().profiles;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function current() {
    var id = currentId();
    var p = findProfile(id);
    if (!p) return guestProfile();
    return { id: p.id, emoji: p.emoji, name: p.name, guest: false };
  }

  function autoKeyFor(profileId, worksheetId, imageHash) {
    var id = worksheetId || "demo";
    var hash = imageHash || "v1";
    if (!profileId) return "ws-bank:" + id + ":" + hash;
    return "wsb.p." + profileId + ".auto." + id + ":" + hash;
  }

  function autoKey(worksheetId, imageHash) {
    return autoKeyFor(currentId(), worksheetId, imageHash);
  }

  function savedKey(profileId, worksheetId) {
    return "wsb.p." + profileId + ".saved." + worksheetId;
  }

  function notify(prevId, nextId) {
    var ev;
    try { ev = new CustomEvent("wsb-profile-change", { detail: { previousId: prevId, currentId: nextId } }); }
    catch (e) { ev = document.createEvent("CustomEvent"); ev.initCustomEvent("wsb-profile-change", true, true, { previousId: prevId, currentId: nextId }); }
    document.dispatchEvent(ev);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](nextId, prevId); } catch (err) {}
    }
    refreshUI();
  }

  function setCurrent(id) {
    var reg = readRegistry();
    var prev = reg.current || null;
    var next = id || null;
    if (next && !findProfile(next)) next = null;
    if (prev === next) { refreshUI(); return current(); }
    reg.current = next;
    writeRegistry(reg);
    notify(prev, next);
    return current();
  }

  function newId() {
    return "p" + Date.now().toString(36) + Math.floor(Math.random() * 36).toString(36);
  }

  function create(opts) {
    var reg = readRegistry();
    if (reg.profiles.length >= MAX_PROFILES) return null;
    opts = opts || {};
    var p = {
      id: newId(),
      emoji: (opts.emoji && String(opts.emoji).trim()) || "⭐",
      name: String(opts.name || "").trim().slice(0, 12),
      created: Date.now()
    };
    reg.profiles.push(p);
    var prev = reg.current || null;
    reg.current = p.id;
    writeRegistry(reg);
    notify(prev, p.id);
    return p;
  }

  function update(id, opts) {
    var reg = readRegistry();
    for (var i = 0; i < reg.profiles.length; i++) {
      if (reg.profiles[i].id !== id) continue;
      if (opts && opts.emoji) reg.profiles[i].emoji = String(opts.emoji).trim();
      if (opts && opts.name != null) reg.profiles[i].name = String(opts.name).trim().slice(0, 12);
      writeRegistry(reg);
      refreshUI();
      return reg.profiles[i];
    }
    return null;
  }

  function allKeysWithPrefix(prefix) {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) keys.push(k);
      }
    } catch (e) {}
    return keys;
  }

  function remove(id) {
    if (!id) return false;
    var reg = readRegistry();
    var prevCurrent = reg.current || null;
    var next = reg.profiles.filter(function (p) { return p.id !== id; });
    if (next.length === reg.profiles.length) return false;
    reg.profiles = next;
    if (reg.current === id) reg.current = null;
    writeRegistry(reg);
    var prefix = "wsb.p." + id + ".";
    allKeysWithPrefix(prefix).forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    notify(prevCurrent, reg.current || null);
    return true;
  }

  function listSaved(profileId) {
    if (!profileId) return [];
    var prefix = "wsb.p." + profileId + ".saved.";
    var out = [];
    allKeysWithPrefix(prefix).forEach(function (k) {
      var rec = safeParse(localStorage.getItem(k), null);
      if (!rec || !rec.worksheetId) {
        rec = rec || {};
        rec.worksheetId = k.slice(prefix.length);
      }
      out.push(rec);
    });
    out.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
    return out;
  }

  function getSaved(profileId, worksheetId) {
    if (!profileId || !worksheetId) return null;
    return safeParse(localStorage.getItem(savedKey(profileId, worksheetId)), null);
  }

  function removeSaved(profileId, worksheetId) {
    if (!profileId || !worksheetId) return false;
    try { localStorage.removeItem(savedKey(profileId, worksheetId)); refreshUI(); return true; }
    catch (e) { return false; }
  }

  function makeThumb(canvas, maxSide, quality) {
    if (!canvas || !canvas.width) return "";
    maxSide = maxSide || THUMB_SIDE;
    quality = quality == null ? 0.7 : quality;
    try {
      var w = canvas.width, h = canvas.height;
      var s = Math.min(1, maxSide / Math.max(w, h, 1));
      var tw = Math.max(1, Math.round(w * s)), th = Math.max(1, Math.round(h * s));
      var c = document.createElement("canvas");
      c.width = tw; c.height = th;
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(canvas, 0, 0, tw, th);
      return c.toDataURL("image/jpeg", quality);
    } catch (e) { return ""; }
  }

  function saveWorksheet(profileId, rec) {
    if (!profileId || !rec || !rec.worksheetId) return { ok: false, reason: "missing" };
    var existing = listSaved(profileId);
    var already = getSaved(profileId, rec.worksheetId);
    if (!already && existing.length >= MAX_SAVED) return { ok: false, reason: "full", saved: existing };
    var payload = {
      worksheetId: String(rec.worksheetId),
      title: rec.title || ("Worksheet " + rec.worksheetId),
      file: rec.file || (rec.worksheetId + ".html"),
      savedAt: Date.now(),
      thumb: rec.thumb || "",
      state: rec.state || {}
    };
    var key = savedKey(profileId, payload.worksheetId);
    if (safeSet(key, JSON.stringify(payload))) { refreshUI(); return { ok: true, rec: payload }; }
    // Quota: shrink or drop the thumbnail and try again
    if (rec.canvas) payload.thumb = makeThumb(rec.canvas, 160, 0.5);
    else payload.thumb = "";
    if (payload.thumb && safeSet(key, JSON.stringify(payload))) { refreshUI(); return { ok: true, rec: payload, compacted: true }; }
    payload.thumb = "";
    if (safeSet(key, JSON.stringify(payload))) { refreshUI(); return { ok: true, rec: payload, compacted: true }; }
    return { ok: false, reason: "quota" };
  }

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  /* ---------------- UI ---------------- */

  var CSS = [
    ".wsb-back{display:none;position:fixed;inset:0;background:rgba(20,30,45,.45);z-index:90;align-items:center;justify-content:center;padding:1rem;padding:max(1rem,env(safe-area-inset-top)) max(1rem,env(safe-area-inset-right)) max(1rem,env(safe-area-inset-bottom)) max(1rem,env(safe-area-inset-left))}",
    ".wsb-back.open{display:flex;overflow:auto;align-items:flex-start}",
    ".wsb-panel{background:#fff;border-radius:1.25rem;padding:1.15rem 1.1rem 1.2rem;width:min(32rem,100%);max-height:92vh;overflow:auto;box-shadow:0 .5rem 1.75rem rgba(30,50,80,.16);position:relative;text-align:center;margin:auto}",
    ".wsb-panel h2{margin:0 2rem .85rem 0;font-size:1.45rem}",
    ".wsb-close{position:absolute;top:.55rem;right:.55rem;width:2.75rem;height:2.75rem;border-radius:50%;border:2px solid #1a1a1a;background:#fff;font-size:1.5rem;font-weight:900;line-height:1;cursor:pointer;touch-action:manipulation}",
    ".wsb-who-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(7.2rem,1fr));gap:.7rem}",
    ".who-tile{appearance:none;font-family:inherit;background:#fff;border:3px solid #d5dee8;border-radius:1.1rem;padding:.7rem .4rem .65rem;min-height:8.2rem;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.25rem;box-shadow:0 2px 0 rgba(0,0,0,.08);touch-action:manipulation;color:#1a1a1a}",
    ".who-tile:active{transform:scale(.97)}",
    ".who-tile.selected{border-color:#2a6edb;background:#eef5ff;box-shadow:0 0 0 3px rgba(42,110,219,.25)}",
    ".who-tile.new{border-style:dashed;background:#fffbe6}",
    ".who-emoji{font-size:2.6rem;line-height:1}",
    ".who-name{font-weight:800;font-size:.95rem;line-height:1.2}",
    ".who-edit{appearance:none;font-family:inherit;margin-top:.3rem;background:#fff;border:2px solid #cfd8e3;border-radius:999px;font-weight:800;font-size:.8rem;padding:.35rem .75rem;min-height:2.2rem;min-width:3.2rem;cursor:pointer;touch-action:manipulation}",
    ".wsb-emoji-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:.4rem;margin:.2rem 0 .9rem}",
    "@media(max-width:420px){.wsb-emoji-grid{grid-template-columns:repeat(4,1fr)}}",
    ".wsb-emoji{appearance:none;background:#f4f7fb;border:3px solid transparent;border-radius:.85rem;font-size:1.85rem;min-height:2.75rem;cursor:pointer;touch-action:manipulation;line-height:1;padding:.15rem}",
    ".wsb-emoji.selected{border-color:#2a6edb;background:#eef5ff}",
    ".wsb-field{display:block;text-align:left;font-weight:800;margin:0 0 .9rem}",
    ".wsb-field input{width:100%;margin-top:.3rem;min-height:2.75rem;font:inherit;font-size:1.15rem;font-weight:700;border:2.5px solid #1a1a1a;border-radius:.8rem;padding:.4rem .7rem}",
    ".wsb-actions{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;margin-top:.3rem;position:sticky;bottom:0;background:#fff;padding-top:.4rem}",
    ".wsb-btn{appearance:none;font-family:inherit;border:2px solid transparent;border-radius:999px;min-height:2.75rem;padding:0 1.1rem;font-size:1rem;font-weight:800;cursor:pointer;touch-action:manipulation;box-shadow:0 2px 0 rgba(0,0,0,.08)}",
    ".wsb-btn-good{background:#1f9d55;color:#fff}",
    ".wsb-btn-ghost{background:#fff;border-color:#cfd8e3;color:#334}",
    ".wsb-btn-oops{background:#ef6a12;color:#fff}",
    ".wsb-hint{margin:0 0 1rem;font-weight:600;color:#334}",
    ".wsb-replace-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(6.4rem,1fr));gap:.5rem;margin:.35rem 0 .7rem}",
    ".wsb-replace-card{appearance:none;font-family:inherit;background:#fff;border:3px solid #d5dee8;border-radius:1rem;padding:.4rem;cursor:pointer;text-align:center;touch-action:manipulation;color:#1a1a1a}",
    ".wsb-replace-card:active{transform:scale(.97)}",
    ".wsb-replace-card img,.wsb-replace-card .noimg{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border-radius:.7rem;display:grid;place-items:center;font-size:1.8rem}",
    ".wsb-replace-card .t{display:block;font-weight:800;font-size:.85rem;margin:.35rem .15rem .2rem;line-height:1.2}",
    ".profile-bar{appearance:none;font-family:inherit;display:flex;align-items:center;gap:.7rem;margin:0 auto 1rem;background:rgba(255,255,255,.18);border:3px solid rgba(255,255,255,.55);color:#fff;border-radius:999px;padding:.35rem .9rem .35rem .4rem;min-height:3.1rem;max-width:22rem;width:100%;cursor:pointer;text-align:left;touch-action:manipulation}",
    ".profile-bar:active{transform:scale(.99)}",
    ".profile-bar-emoji{width:2.5rem;height:2.5rem;border-radius:50%;background:#fff;display:grid;place-items:center;font-size:1.55rem;flex-shrink:0}",
    ".profile-bar-text{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.15}",
    ".profile-bar-kicker{font-size:.7rem;font-weight:700;opacity:.9;text-transform:uppercase;letter-spacing:.04em}",
    ".profile-bar-name{font-size:1.15rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".profile-bar-chevron{font-size:.8rem;opacity:.9}",
    ".saved-row{margin:1rem 0 0}",
    ".saved-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(8.5rem,1fr));gap:.85rem}",
    ".saved-card-wrap{position:relative}",
    ".saved-card{background:#fff;border-radius:1.1rem;box-shadow:0 .4rem 1.2rem rgba(30,50,80,.15);text-decoration:none;color:inherit;display:flex;flex-direction:column;overflow:hidden;border:3px solid #1f9d55}",
    ".saved-card img,.saved-card .noimg{width:100%;aspect-ratio:4/5;object-fit:contain;background:#fff;display:grid;place-items:center;font-size:2.2rem}",
    ".saved-card .t{font-weight:800;padding:.5rem .6rem .65rem;font-size:.95rem;line-height:1.2;border-top:2px solid #eef2f7;background:#eaf8ef}",
    ".saved-remove{position:absolute;top:-.4rem;right:-.4rem;width:2.2rem;height:2.2rem;border-radius:50%;border:2px solid #1a1a1a;background:#ff6b6b;color:#fff;font-weight:900;font-size:1.1rem;line-height:1;cursor:pointer;padding:0;z-index:2;touch-action:manipulation}",
    ".tile{position:relative}",
    ".tile.is-saved{border-color:#1f9d55}",
    ".saved-badge{position:absolute;top:.4rem;right:.4rem;background:#1f9d55;color:#fff;font-weight:800;font-size:.7rem;letter-spacing:.02em;padding:.2rem .45rem;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.18)}",
    ".profile-chip{appearance:none;font-family:inherit;flex-shrink:0;width:2.75rem;height:2.75rem;border-radius:50%;border:2.5px solid #1a1a1a;background:#fff;font-size:1.35rem;cursor:pointer;display:inline-grid;place-items:center;padding:0;touch-action:manipulation;line-height:1}",
    "@media print{.wsb-back,.profile-bar,.profile-chip,#profileSaveBtn,.saved-badge,.saved-remove{display:none !important}}"
  ].join("");

  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;
    var s = document.createElement("style");
    s.id = "wsb-profiles-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(html) {
    var d = document.createElement("div");
    d.innerHTML = html;
    return d.firstElementChild;
  }

  function ensureModals() {
    if (document.getElementById("wsbWhoBack")) return;
    var wrap = document.createElement("div");
    wrap.id = "wsbModals";
    wrap.innerHTML =
      '<div class="wsb-back" id="wsbWhoBack" role="dialog" aria-modal="true" aria-labelledby="wsbWhoTitle">' +
        '<div class="wsb-panel">' +
          '<button type="button" class="wsb-close" id="wsbWhoClose" aria-label="Close">×</button>' +
          '<h2 id="wsbWhoTitle">Who\'s playing?</h2>' +
          '<p class="wsb-hint" id="wsbWhoHint">Tap your picture to start.</p>' +
          '<div class="wsb-who-grid" id="wsbWhoGrid"></div>' +
        '</div>' +
      '</div>' +
      '<div class="wsb-back" id="wsbEditBack" role="dialog" aria-modal="true" aria-labelledby="wsbEditTitle">' +
        '<div class="wsb-panel">' +
          '<button type="button" class="wsb-close" id="wsbEditClose" aria-label="Close">×</button>' +
          '<h2 id="wsbEditTitle">New profile</h2>' +
          '<p class="wsb-hint">Pick a picture. A name is optional.</p>' +
          '<div class="wsb-emoji-grid" id="wsbEmojiGrid"></div>' +
          '<label class="wsb-field">Name <span style="font-weight:600;color:#5a6570">(optional)</span>' +
            '<input type="text" id="wsbNameInput" maxlength="12" autocomplete="off" spellcheck="false" placeholder="Your name">' +
          '</label>' +
          '<div class="wsb-actions">' +
            '<button type="button" class="wsb-btn wsb-btn-ghost" id="wsbEditCancel">Cancel</button>' +
            '<button type="button" class="wsb-btn wsb-btn-good" id="wsbEditSave">Save profile</button>' +
          '</div>' +
          '<div class="wsb-actions" style="margin-top:.8rem">' +
            '<button type="button" class="wsb-btn wsb-btn-oops" id="wsbEditDelete" hidden>Delete profile</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="wsb-back" id="wsbConfirmBack" role="dialog" aria-modal="true" aria-labelledby="wsbConfirmTitle">' +
        '<div class="wsb-panel" style="width:min(22rem,100%)">' +
          '<h2 id="wsbConfirmTitle">Are you sure?</h2>' +
          '<p class="wsb-hint" id="wsbConfirmMsg"></p>' +
          '<div class="wsb-actions">' +
            '<button type="button" class="wsb-btn wsb-btn-ghost" id="wsbConfirmNo">Keep it</button>' +
            '<button type="button" class="wsb-btn wsb-btn-oops" id="wsbConfirmYes">Yes, delete</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="wsb-back" id="wsbReplaceBack" role="dialog" aria-modal="true" aria-labelledby="wsbReplaceTitle">' +
        '<div class="wsb-panel">' +
          '<button type="button" class="wsb-close" id="wsbReplaceClose" aria-label="Close">×</button>' +
          '<h2 id="wsbReplaceTitle">Pick one to replace</h2>' +
          '<p class="wsb-hint">This profile already has 5 saved worksheets. Tap one to replace it, or cancel.</p>' +
          '<div class="wsb-replace-grid" id="wsbReplaceGrid"></div>' +
          '<div class="wsb-actions"><button type="button" class="wsb-btn wsb-btn-ghost" id="wsbReplaceCancel">Cancel</button></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    function closeIfBackdrop(backId) {
      return function (e) { if (e.target.id === backId) closeAll(); };
    }
    document.getElementById("wsbWhoClose").addEventListener("click", closeWho);
    document.getElementById("wsbWhoBack").addEventListener("click", closeIfBackdrop("wsbWhoBack"));
    document.getElementById("wsbEditClose").addEventListener("click", closeEdit);
    document.getElementById("wsbEditCancel").addEventListener("click", closeEdit);
    document.getElementById("wsbEditBack").addEventListener("click", closeIfBackdrop("wsbEditBack"));
    document.getElementById("wsbEditSave").addEventListener("click", commitEdit);
    document.getElementById("wsbEditDelete").addEventListener("click", deleteFromEditor);
    document.getElementById("wsbConfirmNo").addEventListener("click", function () { closeBox("wsbConfirmBack"); });
    document.getElementById("wsbReplaceCancel").addEventListener("click", closeReplace);
    document.getElementById("wsbReplaceClose").addEventListener("click", closeReplace);
    document.getElementById("wsbReplaceBack").addEventListener("click", closeIfBackdrop("wsbReplaceBack"));
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (isOpen("wsbConfirmBack")) { closeBox("wsbConfirmBack"); return; }
      if (isOpen("wsbReplaceBack")) { closeReplace(); return; }
      if (isOpen("wsbEditBack")) { closeEdit(); return; }
      if (isOpen("wsbWhoBack")) closeWho();
    });
  }

  function isOpen(id) {
    var n = document.getElementById(id);
    return !!(n && n.classList.contains("open"));
  }
  function openBox(id) { var n = document.getElementById(id); if (n) n.classList.add("open"); }
  function closeBox(id) { var n = document.getElementById(id); if (n) n.classList.remove("open"); }

  var pendingSave = false;
  var pendingConfirm = null;
  var pendingReplace = null;
  var editId = null;
  var editEmoji = EMOJIS[0];

  function closeAll() {
    closeWho(); closeEdit(); closeBox("wsbConfirmBack"); closeReplace();
  }
  function closeWho() { closeBox("wsbWhoBack"); pendingSave = false; }
  function closeEdit() { closeBox("wsbEditBack"); }
  function closeReplace() {
    closeBox("wsbReplaceBack");
    if (pendingReplace && pendingReplace.onCancel) {
      try { pendingReplace.onCancel(); } catch (e) {}
    }
    pendingReplace = null;
  }

  function renderWho() {
    ensureModals();
    var grid = document.getElementById("wsbWhoGrid");
    if (!grid) return;
    grid.innerHTML = "";
    var reg = readRegistry();
    var cur = reg.current || null;

    function addTile(opts) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "who-tile" + (opts.selected ? " selected" : "") + (opts.cls ? " " + opts.cls : "");
      if (opts.id != null) b.setAttribute("data-id", opts.id);
      if (opts.guest) b.classList.add("guest");
      if (opts.isNew) b.id = "wsbNewTile";
      b.innerHTML = '<span class="who-emoji">' + (opts.emoji || "") + '</span><span class="who-name">' + escapeHtml(opts.name || "") + "</span>";
      if (opts.onClick) b.addEventListener("click", opts.onClick);
      if (opts.onEdit) {
        var ed = document.createElement("button");
        ed.type = "button";
        ed.className = "who-edit";
        ed.textContent = "Edit";
        ed.addEventListener("click", function (e) { e.stopPropagation(); opts.onEdit(); });
        b.appendChild(ed);
      }
      grid.appendChild(b);
    }

    addTile({
      id: "",
      guest: true,
      emoji: "👤",
      name: "Guest",
      selected: !cur,
      onClick: function () {
        var wantSave = pendingSave;
        setCurrent(null);
        closeWho();
        if (wantSave) toast("Pick a profile to save your work.");
      }
    });

    reg.profiles.forEach(function (p) {
      addTile({
        id: p.id,
        emoji: p.emoji,
        name: displayName(p),
        selected: cur === p.id,
        onClick: function () {
          var wantSave = pendingSave;
          setCurrent(p.id);
          closeWho();
          if (wantSave) dispatchReadyToSave();
        },
        onEdit: function () { openEditor(p.id); }
      });
    });

    if (reg.profiles.length < MAX_PROFILES) {
      addTile({
        isNew: true,
        cls: "new",
        emoji: "＋",
        name: "New",
        onClick: function () { openEditor(null); }
      });
    }
  }

  function openWho(opts) {
    ensureModals();
    pendingSave = !!(opts && opts.reason === "save");
    var hint = document.getElementById("wsbWhoHint");
    if (hint) hint.textContent = pendingSave ? "Pick or create a profile to save this worksheet." : "Tap your picture to start.";
    renderWho();
    openBox("wsbWhoBack");
  }

  function renderEmojiGrid() {
    var grid = document.getElementById("wsbEmojiGrid");
    if (!grid) return;
    grid.innerHTML = "";
    EMOJIS.forEach(function (em) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "wsb-emoji" + (em === editEmoji ? " selected" : "");
      b.textContent = em;
      b.setAttribute("aria-label", "Choose " + em);
      b.addEventListener("click", function () {
        editEmoji = em;
        renderEmojiGrid();
      });
      grid.appendChild(b);
    });
  }

  function openEditor(id) {
    ensureModals();
    editId = id || null;
    var title = document.getElementById("wsbEditTitle");
    var del = document.getElementById("wsbEditDelete");
    var input = document.getElementById("wsbNameInput");
    if (editId) {
      var p = findProfile(editId);
      if (!p) return;
      if (title) title.textContent = "Edit profile";
      editEmoji = p.emoji || EMOJIS[0];
      if (input) input.value = p.name || "";
      if (del) del.hidden = false;
    } else {
      if (title) title.textContent = "New profile";
      editEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      if (input) input.value = "";
      if (del) del.hidden = true;
    }
    renderEmojiGrid();
    openBox("wsbEditBack");
    if (input) setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);
  }

  function commitEdit() {
    var input = document.getElementById("wsbNameInput");
    var name = input ? input.value : "";
    var wantSave = pendingSave;
    if (editId) {
      update(editId, { emoji: editEmoji, name: name });
      closeEdit();
      renderWho();
      return;
    }
    var p = create({ emoji: editEmoji, name: name });
    closeEdit();
    closeWho();
    if (!p) { toast("You already have 5 profiles."); return; }
    if (wantSave) dispatchReadyToSave();
  }

  function deleteFromEditor() {
    if (!editId) return;
    var p = findProfile(editId);
    if (!p) return;
    confirmKid(
      "Delete " + p.emoji + " " + displayName(p) + "? Their saved worksheets will be gone.",
      "Yes, delete",
      "Keep it",
      function () {
        var id = editId;
        closeEdit();
        closeWho();
        remove(id);
      }
    );
  }

  function confirmKid(message, yesLabel, noLabel, onYes) {
    ensureModals();
    var msg = document.getElementById("wsbConfirmMsg");
    var yes = document.getElementById("wsbConfirmYes");
    var no = document.getElementById("wsbConfirmNo");
    if (msg) msg.textContent = message;
    if (yes) yes.textContent = yesLabel || "Yes, delete";
    if (no) no.textContent = noLabel || "Keep it";
    pendingConfirm = onYes;
    yes.onclick = function () {
      var fn = pendingConfirm;
      pendingConfirm = null;
      closeBox("wsbConfirmBack");
      if (fn) fn();
    };
    openBox("wsbConfirmBack");
  }

  function openReplace(saved, handlers) {
    ensureModals();
    pendingReplace = handlers || {};
    var grid = document.getElementById("wsbReplaceGrid");
    if (grid) {
      grid.innerHTML = "";
      (saved || []).forEach(function (rec) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "wsb-replace-card";
        b.setAttribute("data-id", rec.worksheetId);
        var img = rec.thumb
          ? '<img src="' + rec.thumb + '" alt="">'
          : '<div class="noimg">🖍️</div>';
        b.innerHTML = img + '<span class="t">' + escapeHtml(rec.title || rec.worksheetId) + "</span>";
        b.addEventListener("click", function () {
          var fn = pendingReplace && pendingReplace.onPick;
          pendingReplace = null;
          closeBox("wsbReplaceBack");
          if (fn) fn(rec.worksheetId);
        });
        grid.appendChild(b);
      });
    }
    openBox("wsbReplaceBack");
  }

  function dispatchReadyToSave() {
    var ev;
    try { ev = new CustomEvent("wsb-ready-to-save"); }
    catch (e) { ev = document.createEvent("CustomEvent"); ev.initCustomEvent("wsb-ready-to-save", true, true, null); }
    document.dispatchEvent(ev);
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    if (t && t.classList) {
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
      return;
    }
    // menu has no toast: use a lightweight one
    var n = document.getElementById("wsbToast");
    if (!n) {
      n = document.createElement("div");
      n.id = "wsbToast";
      n.setAttribute("role", "status");
      n.style.cssText = "position:fixed;left:50%;bottom:1.2rem;transform:translateX(-50%);background:#1a1a1a;color:#fff;font-weight:800;padding:.7rem 1.1rem;border-radius:999px;z-index:95;max-width:90vw;text-align:center";
      document.body.appendChild(n);
    }
    n.textContent = msg;
    n.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { n.hidden = true; }, 2600);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fileFor(rec) {
    var f = rec.file || (rec.worksheetId + ".html");
    if (!/\.html$/i.test(f)) f += ".html";
    return f;
  }

  function refreshBar() {
    var bar = document.getElementById("profileBar");
    var chip = document.getElementById("profileChip");
    var cur = current();
    var name = displayName(cur);
    if (bar) {
      var em = bar.querySelector(".profile-bar-emoji");
      var nm = bar.querySelector(".profile-bar-name");
      if (em) em.textContent = cur.emoji;
      if (nm) nm.textContent = name;
      bar.setAttribute("aria-label", "Who's playing? " + name);
    }
    if (chip) {
      chip.textContent = cur.emoji;
      chip.setAttribute("aria-label", "Current profile: " + name + ". Switch profile");
      chip.title = name;
    }
  }

  function refreshSavedRow() {
    var row = document.getElementById("savedRow");
    var grid = document.getElementById("savedGrid");
    if (!row || !grid) return;
    var cur = current();
    var saved = cur.guest ? [] : listSaved(cur.id);
    grid.innerHTML = "";
    if (!saved.length) { row.hidden = true; return; }
    row.hidden = false;
    saved.forEach(function (rec) {
      var wrap = document.createElement("div");
      wrap.className = "saved-card-wrap";
      var a = document.createElement("a");
      a.className = "saved-card";
      a.href = fileFor(rec) + "#saved";
      a.setAttribute("data-id", rec.worksheetId);
      a.innerHTML = (rec.thumb ? '<img src="' + rec.thumb + '" alt="">' : '<div class="noimg">🖍️</div>') +
        '<span class="t">' + escapeHtml(rec.title || rec.worksheetId) + "</span>";
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "saved-remove";
      rm.setAttribute("aria-label", "Remove " + (rec.title || rec.worksheetId));
      rm.textContent = "×";
      rm.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        confirmKid(
          "Remove " + (rec.title || rec.worksheetId) + " from " + cur.emoji + " " + displayName(cur) + "'s saved work?",
          "Yes, remove",
          "Keep it",
          function () { removeSaved(cur.id, rec.worksheetId); }
        );
      });
      wrap.appendChild(a);
      wrap.appendChild(rm);
      grid.appendChild(wrap);
    });
  }

  function refreshBadges() {
    var tiles = document.querySelectorAll("a.tile[data-id]");
    if (!tiles.length) return;
    var cur = current();
    var ids = {};
    if (!cur.guest) {
      listSaved(cur.id).forEach(function (rec) { ids[rec.worksheetId] = true; });
    }
    Array.prototype.forEach.call(tiles, function (tile) {
      var id = tile.getAttribute("data-id");
      var on = !!ids[id];
      tile.classList.toggle("is-saved", on);
      var badge = tile.querySelector(".saved-badge");
      if (on && !badge) {
        badge = document.createElement("span");
        badge.className = "saved-badge";
        badge.textContent = "saved";
        tile.appendChild(badge);
      } else if (!on && badge) {
        badge.remove();
      }
    });
  }

  function refreshUI() {
    if (!domReady) return;
    refreshBar();
    refreshSavedRow();
    refreshBadges();
  }

  function bindChrome() {
    var bar = document.getElementById("profileBar");
    if (bar) bar.addEventListener("click", function () { openWho(); });
    var chip = document.getElementById("profileChip");
    if (chip) chip.addEventListener("click", function () { openWho(); });
    refreshUI();
  }

  function boot() {
    injectCSS();
    ensureModals();
    domReady = true;
    bindChrome();
  }

  var api = {
    MAX_PROFILES: MAX_PROFILES,
    MAX_SAVED: MAX_SAVED,
    EMOJIS: EMOJIS,
    REG_KEY: REG_KEY,
    autoKey: autoKey,
    autoKeyFor: autoKeyFor,
    currentId: currentId,
    current: current,
    list: function () { return readRegistry().profiles.slice(); },
    setCurrent: setCurrent,
    create: create,
    update: update,
    remove: remove,
    listSaved: listSaved,
    getSaved: getSaved,
    saveWorksheet: saveWorksheet,
    removeSaved: removeSaved,
    makeThumb: makeThumb,
    openWho: openWho,
    closeWho: closeWho,
    openEditor: openEditor,
    openReplace: openReplace,
    confirm: confirmKid,
    refreshUI: refreshUI,
    onChange: onChange,
    toast: toast,
    displayName: displayName
  };
  global.WSB = api;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);
