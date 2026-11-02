import {
  bearing, distanceKm, cardinal, compassHeading, smoothAngle, turnNeeded, alignState,
  parseCoordinates, isShortLink, unwrapContinueUrl, norm360, fmtCoord,
} from "./lib.mjs";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem("vixor." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("vixor." + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---------------------------------------------------------------- state
const DEFAULT_MASTS = [
  { id: "aleklatten", name: "Aleklätten mast", lat: 57.904558, lon: 12.018408 },
  { id: "emmylund", name: "Emmylund mast", lat: 57.962096, lon: 12.142048 },
];
const state = {
  masts: store.get("masts", null) || DEFAULT_MASTS,
  selected: store.get("selected", null),
  declination: store.get("declination", 4.5), // grader öst, ungefärligt för Göteborgstrakten
  manualPos: store.get("manualPos", null),
  pos: null,         // {lat, lon, acc}
  heading: null,     // magnetiskt, utjämnat
  running: false,
  lastOrient: 0,
};
if (!state.masts.length) state.masts = DEFAULT_MASTS;
if (!state.masts.find((m) => m.id === state.selected)) state.selected = state.masts[0].id;
const saveMasts = () => { store.set("masts", state.masts); store.set("selected", state.selected); };

// ---------------------------------------------------------------- tabs
document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + b.dataset.view));
    window.scrollTo(0, 0);
  }),
);

// ---------------------------------------------------------------- dial
const SVGNS = "http://www.w3.org/2000/svg";
function buildRing() {
  const ring = $("ring");
  const mk = (tag, attrs, text) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  };
  for (let a = 0; a < 360; a += 10) {
    const major = a % 30 === 0;
    const r1 = 140, r2 = major ? 124 : 131;
    const s = Math.sin((a * Math.PI) / 180), c = Math.cos((a * Math.PI) / 180);
    ring.appendChild(mk("line", { x1: r1 * s, y1: -r1 * c, x2: r2 * s, y2: -r2 * c, class: major ? "major" : "" }));
  }
  [["N", 0], ["O", 90], ["S", 180], ["V", 270]].forEach(([t, a]) => {
    const s = Math.sin((a * Math.PI) / 180), c = Math.cos((a * Math.PI) / 180);
    ring.appendChild(mk("text", { x: 104 * s, y: -104 * c, class: t === "N" ? "n" : "" }, t));
  });
  const mm = $("mast-mark");
  mm.appendChild(mk("circle", { cx: 0, cy: -118, r: 11 }));
}
buildRing();

const trueHeading = () => (state.heading == null ? null : norm360(state.heading + state.declination));
const ownPos = () => state.pos || state.manualPos;
const selMast = () => state.masts.find((m) => m.id === state.selected);

function render() {
  const mast = selMast();
  $("no-mast").hidden = !!mast;
  $("aim-body").hidden = !mast;
  if (!mast) return;

  const me = ownPos();
  const th = trueHeading();
  let brg = null, dist = null;
  if (me) {
    brg = bearing(me.lat, me.lon, mast.lat, mast.lon);
    dist = distanceKm(me.lat, me.lon, mast.lat, mast.lon);
  }

  $("v-bearing").textContent = brg == null ? "–" : `${brg.toFixed(0)}° ${cardinal(brg)}`;
  $("v-heading").textContent = th == null ? "–" : `${th.toFixed(0)}° ${cardinal(th)}`;
  $("v-dist").textContent = dist == null ? "–" : dist < 1 ? `${(dist * 1000).toFixed(0)} m` : `${dist.toFixed(2)} km`;
  $("v-pos").textContent = me
    ? `${fmtCoord(me.lat, 5)}, ${fmtCoord(me.lon, 5)}${me.acc ? ` (±${Math.round(me.acc)} m)` : me.manual ? " (manuell)" : ""}`
    : "–";

  // ringen roterar så att norr hamnar rätt; mastmarkören sitter på bäringen
  const ring = $("ring"), mark = $("mast-mark"), arrow = $("arrow");
  ring.setAttribute("transform", `rotate(${th == null ? 0 : -th})`);
  mark.setAttribute("transform", `rotate(${brg == null ? 0 : brg - (th == null ? 0 : th)})`);
  mark.style.display = brg == null ? "none" : "";

  const banner = $("status-banner");
  const turnEl = $("turn-text");
  arrow.setAttribute("class", "arrow");

  if (!state.running) {
    setBanner(banner, "bad", "Tryck på Starta");
    turnEl.textContent = "–";
    return;
  }
  if (!me) { setBanner(banner, "warn", "Väntar på GPS…"); turnEl.textContent = "–"; return; }
  if (th == null) {
    setBanner(banner, "warn", "Väntar på kompass…");
    turnEl.textContent = state.noCompass ? "Ingen kompassdata. Rör telefonen i en åtta och kolla sensorbehörighet." : "–";
    return;
  }

  const turn = turnNeeded(brg, th);
  const st = alignState(turn);
  arrow.setAttribute("class", "arrow " + st);
  if (st === "good") {
    setBanner(banner, "good", "RÄTT RIKTNING");
    turnEl.textContent = `${Math.abs(turn).toFixed(0)}° fel`;
  } else {
    setBanner(banner, st, st === "warn" ? "Nästan" : "Vrid dig");
    turnEl.textContent = `${Math.abs(turn).toFixed(0)}° åt ${turn > 0 ? "höger ↻" : "vänster ↺"}`;
  }
}
function setBanner(el, cls, text) { el.className = "banner " + cls; el.textContent = text; }

// ---------------------------------------------------------------- sensors
let watchId = null;
function startGps() {
  if (!("geolocation" in navigator)) { setBanner($("status-banner"), "warn", "GPS saknas, ange position manuellt"); return; }
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(
    (p) => { state.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }; render(); },
    (e) => { state.pos = null; $("v-pos").textContent = e.code === 1 ? "Plats nekad: tillåt plats i Android-inställningar" : "GPS-fel: " + e.message; render(); },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
  );
}

function onOrient(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading; // iOS
  else if (e.alpha != null && e.beta != null && e.gamma != null && (e.absolute || e.type === "deviceorientationabsolute")) {
    h = compassHeading(e.alpha, e.beta, e.gamma);
  }
  if (h == null) return;
  state.heading = smoothAngle(state.heading, h, 0.2);
  const now = performance.now();
  if (now - state.lastOrient > 60) { state.lastOrient = now; render(); }
}

let orientTimer = null;
async function startOrientation() {
  // Lyssnarna läggs alltid på först. Behörighetsfrågan (iOS, vissa nya WebViews) får aldrig blockera.
  window.removeEventListener("deviceorientationabsolute", onOrient, true);
  window.removeEventListener("deviceorientation", onOrient, true);
  window.addEventListener("deviceorientationabsolute", onOrient, true);
  window.addEventListener("deviceorientation", onOrient, true); // tar bara emot absoluta värden, se onOrient
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission().catch(() => {});
    }
  } catch { /* ignore */ }
  clearTimeout(orientTimer);
  orientTimer = setTimeout(() => {
    if (state.running && state.heading == null) {
      state.noCompass = true;
      render();
    }
  }, 3000);
}

let wake = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator) wake = await navigator.wakeLock.request("screen");
    else if (wake) { await wake.release(); wake = null; }
  } catch { /* ignore */ }
}

$("btn-start").addEventListener("click", async () => {
  if (state.running) {
    state.running = false;
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    window.removeEventListener("deviceorientationabsolute", onOrient, true);
    window.removeEventListener("deviceorientation", onOrient, true);
    $("btn-start").textContent = "Starta";
    keepAwake(false);
    render();
    return;
  }
  state.running = true;
  state.heading = null;
  state.noCompass = false;
  $("btn-start").textContent = "Stoppa";
  startGps();
  await startOrientation();
  keepAwake(true);
  render();
});

$("btn-calib").addEventListener("click", () => {
  alert("Kalibrera kompassen: håll telefonen borta från metall och magneter och rör den i en åtta (∞) i luften några gånger. Kompassen blir noggrannare efter det.");
});

// ---------------------------------------------------------------- settings
$("decl").value = state.declination;
$("decl").addEventListener("change", () => {
  const v = parseFloat(String($("decl").value).replace(",", "."));
  if (Number.isFinite(v) && Math.abs(v) <= 30) { state.declination = v; store.set("declination", v); render(); }
});
$("btn-manual").addEventListener("click", async () => {
  const msg = $("manual-msg");
  const r = await resolveInput($("manual-pos").value, msg);
  if (r) {
    state.manualPos = { lat: r.lat, lon: r.lon, manual: true };
    store.set("manualPos", state.manualPos);
    msg.textContent = `Manuell position sparad: ${fmtCoord(r.lat)}, ${fmtCoord(r.lon)}. GPS har företräde när den finns.`;
    render();
  }
});

// ---------------------------------------------------------------- koordinater / Maps-länkar
async function resolveInput(text, msgEl) {
  let r = parseCoordinates(text);
  if (r) return r;
  if (isShortLink(text || "")) {
    msgEl.textContent = "Hämtar länk…";
    const cap = window.Capacitor, http = cap && cap.Plugins && cap.Plugins.CapacitorHttp;
    try {
      if (http) {
        const res = await http.get({ url: text.trim(), connectTimeout: 15000, readTimeout: 15000 });
        const finalUrl = unwrapContinueUrl(res.url || "");
        r = parseCoordinates(finalUrl) || parseCoordinates(typeof res.data === "string" ? res.data : "");
        if (r) return r;
      }
    } catch { /* faller igenom till meddelandet nedan */ }
    msgEl.textContent = "Kunde inte läsa kortlänken. Öppna den i webbläsaren och kopiera den långa adressen eller koordinaterna.";
    return null;
  }
  msgEl.textContent = "Hittade inga koordinater. Skriv t.ex. 57.9045, 12.0184 eller klistra in en Maps-länk.";
  return null;
}

// ---------------------------------------------------------------- mastlista
function renderMasts() {
  const list = $("mast-list");
  list.textContent = "";
  state.masts.forEach((m) => {
    const d = document.createElement("div");
    d.className = "mast";
    const dist = ownPos() ? distanceKm(ownPos().lat, ownPos().lon, m.lat, m.lon) : null;
    d.innerHTML = `<div class="n"></div><div class="c"></div><div class="row"><button class="primary sel">Rikta mot</button><button class="ghost edit">Byt namn</button><button class="ghost danger del">Ta bort</button></div>`;
    d.querySelector(".n").textContent = m.name + (m.id === state.selected ? "  ✓" : "");
    d.querySelector(".c").textContent = `${fmtCoord(m.lat, 6)}, ${fmtCoord(m.lon, 6)}` + (dist != null ? `  ·  ${dist.toFixed(2)} km härifrån` : "");
    d.querySelector(".sel").addEventListener("click", () => {
      state.selected = m.id; saveMasts(); fillSelect(); renderMasts(); render();
      document.querySelector('.tabs button[data-view="aim"]').click();
    });
    d.querySelector(".edit").addEventListener("click", () => {
      const n = prompt("Nytt namn", m.name);
      if (n && n.trim()) { m.name = n.trim(); saveMasts(); fillSelect(); renderMasts(); }
    });
    d.querySelector(".del").addEventListener("click", () => {
      if (!confirm(`Ta bort ${m.name}?`)) return;
      state.masts = state.masts.filter((x) => x.id !== m.id);
      if (state.selected === m.id) state.selected = state.masts[0] ? state.masts[0].id : null;
      saveMasts(); fillSelect(); renderMasts(); render();
    });
    list.appendChild(d);
  });
  if (!state.masts.length) list.innerHTML = '<div class="card hint">Inga master sparade än.</div>';
}

function fillSelect() {
  const sel = $("mast-select");
  sel.textContent = "";
  state.masts.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id; o.textContent = m.name; o.selected = m.id === state.selected;
    sel.appendChild(o);
  });
}
$("mast-select").addEventListener("change", (e) => { state.selected = e.target.value; saveMasts(); render(); renderMasts(); });

$("m-save").addEventListener("click", async () => {
  const msg = $("m-msg");
  const name = $("m-name").value.trim();
  if (!name) { msg.textContent = "Ange ett namn på masten."; return; }
  const r = await resolveInput($("m-input").value, msg);
  if (!r) return;
  const id = "m" + Date.now().toString(36);
  state.masts.push({ id, name, lat: r.lat, lon: r.lon });
  state.selected = id;
  saveMasts(); fillSelect(); renderMasts(); render();
  $("m-name").value = ""; $("m-input").value = "";
  msg.textContent = `Sparade ${name}: ${fmtCoord(r.lat, 6)}, ${fmtCoord(r.lon, 6)}`;
});

// ---------------------------------------------------------------- start
fillSelect();
renderMasts();
render();

// Gör tillstånd/testning möjligt utan riktig sensor (används av testskripten)
window.__vixor = { state, render, onOrient };
