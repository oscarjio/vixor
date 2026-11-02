// Vixor - ren logik utan DOM, så den kan enhetstestas i Node.

const R_KM = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export const norm360 = (a) => ((a % 360) + 360) % 360;
export const norm180 = (a) => {
  const x = norm360(a);
  return x > 180 ? x - 360 : x;
};

/** Initial bäring (sann, grader 0-360) från punkt 1 till punkt 2. */
export function bearing(lat1, lon1, lat2, lon2) {
  const p1 = rad(lat1), p2 = rad(lat2), dl = rad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(deg(Math.atan2(y, x)));
}

/** Storcirkelavstånd i km (haversine). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dp = rad(lat2 - lat1), dl = rad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const CARD = ["N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO", "S", "SSV", "SV", "VSV", "V", "VNV", "NV", "NNV"];
export const cardinal = (b) => CARD[Math.round(norm360(b) / 22.5) % 16];

/**
 * Kompassriktning (grader från norr, medurs) ur DeviceOrientation (absolut).
 * Telefon liggande: överkanten pekar. Telefon stående: baksidan (kameran) pekar.
 */
export function compassHeading(alpha, beta, gamma) {
  const a = rad(alpha), b = rad(beta), g = rad(gamma);
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  const m12 = -cB * sA, m22 = cA * cB, m32 = sB;
  const m13 = cG * sA * sB + cA * sG;
  const m23 = sA * sG - cA * cG * sB;
  if (Math.abs(m32) > 0.7) {
    return norm360(deg(Math.atan2(-m13, -m23)));
  }
  return norm360(deg(Math.atan2(m12, m22)));
}

/** Medelvärde-utjämning av vinklar (hanterar 359 -> 1). factor 0..1 */
export function smoothAngle(prev, next, factor = 0.25) {
  if (prev == null) return next;
  const d = norm180(next - prev);
  return norm360(prev + d * factor);
}

/** Hur många grader du ska vrida dig. Positivt = åt höger. */
export function turnNeeded(bearingTrue, headingTrue) {
  return norm180(bearingTrue - headingTrue);
}

export function alignState(turn, tolGood = 5, tolWarn = 15) {
  const a = Math.abs(turn);
  if (a <= tolGood) return "good";
  if (a <= tolWarn) return "warn";
  return "bad";
}

const validLat = (v) => Number.isFinite(v) && Math.abs(v) <= 90;
const validLon = (v) => Number.isFinite(v) && Math.abs(v) <= 180;
const pair = (lat, lon) => {
  lat = Number(lat); lon = Number(lon);
  return validLat(lat) && validLon(lon) ? { lat, lon } : null;
};

function dmsToDec(d, m, s, hemi) {
  let v = Number(d) + Number(m || 0) / 60 + Number(s || 0) / 3600;
  if (/[SsWwVv]/.test(hemi || "")) v = -v; // S och V (väst) = negativt
  return v;
}

export const isShortLink = (t) => /(?:^|\/\/)(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(t.trim());

/**
 * Plockar koordinater ur fri text: "57.7089, 11.9746", Google Maps-länk,
 * eller grader/minuter/sekunder ("57°42'32\"N 11°58'29\"E").
 * Returnerar { lat, lon } eller null.
 */
export function parseCoordinates(input) {
  if (!input) return null;
  let t = String(input).trim();
  try { t = decodeURIComponent(t); } catch { /* lämna som det är */ }
  t = t.replace(/′|’/g, "'").replace(/″|”/g, '"').replace(/ /g, " ");

  // 1) Google Maps: !3d<lat>!4d<lon> (själva nålen) har företräde
  let m = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) { const p = pair(m[1], m[2]); if (p) return p; }

  // 2) ?q= / ll= / query= / destination= / center= med "lat,lon"
  m = t.match(/[?&](?:q|ll|query|destination|center|daddr)=\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (m) { const p = pair(m[1], m[2]); if (p) return p; }

  // 3) /@lat,lon,zoom
  m = t.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) { const p = pair(m[1], m[2]); if (p) return p; }

  // 4) Grader/minuter/sekunder med N/S och E/O/W/V
  const dms = /(\d{1,3})\s*[°º]\s*(?:(\d{1,2})\s*'\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|'')\s*)?([NSns])[\s,;]*(\d{1,3})\s*[°º]\s*(?:(\d{1,2})\s*'\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|'')\s*)?([EOWeowvV])/;
  m = t.match(dms);
  if (m) {
    const p = pair(dmsToDec(m[1], m[2], m[3], m[4]), dmsToDec(m[5], m[6], m[7], m[8]));
    if (p) return p;
  }

  // 5) Decimala grader, ev. med komma som decimaltecken: "57,7089; 11,9746" eller "57.7089, 11.9746"
  m = t.match(/(?<![\d.,])(-?\d{1,2}[.,]\d+)\s*[;,\s]\s*\+?\s*(-?\d{1,3}[.,]\d+)/);
  if (m) {
    const p = pair(m[1].replace(",", "."), m[2].replace(",", "."));
    if (p) return p;
  }
  return null;
}

/** Plockar den "riktiga" Maps-adressen ur en redirect-URL (t.ex. consent.google.com?continue=...). */
export function unwrapContinueUrl(u) {
  try {
    const url = new URL(u);
    const c = url.searchParams.get("continue");
    return c ? c : u;
  } catch { return u; }
}

export const fmtCoord = (v, d = 5) => Number(v).toFixed(d);
