// =========================
// 1) PUT YOUR SUPABASE INFO HERE
// =========================
const SUPABASE_URL = "https://cemfumevmkckmlkyqrus.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VXhUaC_KIJQPoGXcJ5BMdg_BEx0i6wF";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================
// Helpers
// =========================
const $ = (id) => document.getElementById(id);

function toast(title, body = "", kind = "ok") {
  const t = $("toast");
  t.className = "toast show " + (kind === "ok" ? "ok" : "err");
  t.innerHTML = `
    <div class="tTitle">${escapeHtml(title)}</div>
    <div class="tBody">${escapeHtml(body)}</div>
  `;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

function showBanner(id, text) {
  const el = $(id);
  if (!text) { el.style.display = "none"; el.textContent = ""; return; }
  el.style.display = "block";
  el.textContent = text;
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}
function toISODate(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x.toISOString().slice(0,10);
}
function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
function round2(n) { return Math.round(n * 100) / 100; }
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function isQuarterHourIncrement(hours) {
  const x = Math.round(hours * 100) / 100;
  const q = x * 4;
  return Math.abs(q - Math.round(q)) < 1e-9;
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt
