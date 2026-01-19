// =========================
// 1) PUT YOUR SUPABASE INFO HERE
// =========================
const SUPABASE_URL = "https://cemfumevmkckmlkyqrus.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VXhUaC_KIJQPoGXcJ5BMdg_BEx0i6wF";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================
// HELPERS
// =========================
const $ = (id) => document.getElementById(id);

function toast(title, body = "", kind = "ok") {
  const t = $("toast");
  t.className = "toast show " + (kind === "ok" ? "ok" : "err");
  t.innerHTML = `<div class="tTitle">${escapeHtml(title)}</div><div class="tBody">${escapeHtml(body)}</div>`;
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
function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function isQuarterHourIncrement(hours) {
  const x = Math.round(hours * 100) / 100;
  return Math.abs(x * 4 - Math.round(x * 4)) < 1e-9;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function dayName(iso) {
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(iso).getDay()];
}

// =========================
// PERIOD LOGIC
// =========================
const ANCHOR = "2026-01-05"; // Monday

function periodStartForDate(selectedISO) {
  const a = new Date(ANCHOR);
  const s = new Date(selectedISO);
  const diffDays = Math.floor((s - a) / 86400000);
  const k = Math.floor(diffDays / 14);
  a.setDate(a.getDate() + k * 14);
  return toISODate(a);
}

function buildPeriodDays(startISO) {
  return Array.from({length:14}, (_,i) => addDays(startISO, i));
}

function weekIndexWithinPeriod(dayISO, periodStartISO) {
  const diff = Math.floor((new Date(dayISO) - new Date(periodStartISO)) / 86400000);
  return diff < 7 ? 1 : 2;
}

// =========================
// STATE
// =========================
let pro = {
  email: null,
  approver_email: null,
  period_start: null,
  timesheet: null,
  entries: [],
  projects: [],
  activities: [],
  statuses: [],
  dirty: false,
  autosaveTimer: null
};

// =========================
// TABS
// =========================
function activate(tab, panel) {
  ["tabPro","tabAppr","tabAdmin"].forEach(t => $(t).classList.remove("active"));
  ["panelPro","panelAppr","panelAdmin"].forEach(p => $(p).classList.remove("active"));
  $(tab).classList.add("active");
  $(panel).classList.add("active");
}

$("tabPro").onclick = () => activate("tabPro","panelPro");
$("tabAppr").onclick = () => activate("tabAppr","panelAppr");
$("tabAdmin").onclick = () => activate("tabAdmin","panelAdmin");

// =========================
// LOAD REFERENCE DATA
// =========================
async function loadReferenceData() {
  const [p,a,s] = await Promise.all([
    db.from("projects").select("*").order("name"),
    db.from("activities").select("*").order("code"),
    db.from("timesheet_statuses").select("*").order("code")
  ]);
  pro.projects = p.data || [];
  pro.activities = a.data || [];
  pro.statuses = s.data || [];
}

// =========================
// PROFESSIONAL
// =========================
$("btnLoadPro").onclick = async () => {
  const email = $("proEmail").value.trim().toLowerCase();
  if (!isValidEmail(email)) return showBanner("proErrors","Enter a valid email.");

  await loadReferenceData();

  let prof = await db.from("professionals").select("*").eq("email",email).maybeSingle();
  if (!prof.data) {
    const ins = await db.from("professionals").insert({email}).select("*").single();
    prof = ins;
  }

  pro.email = email;
  pro.approver_email = prof.data.approver_email;
  $("proApproverMeta").innerHTML = `Approver: <span class="mono">${escapeHtml(pro.approver_email||"—")}</span>`;

  $("proDate").value = toISODate(new Date());
  pro.period_start = periodStartForDate($("proDate").value);
  await loadTimesheet();
};

$("btnSetPeriod").onclick = async () => {
  if (!pro.email) return showBanner("proErrors","Load your email first.");
  pro.period_start = periodStartForDate($("proDate").value);
  await loadTimesheet();
};

async function loadTimesheet() {
  const start = pro.period_start;
  $("periodLabel").textContent = `${start} to ${addDays(start,13)}`;

  let ts = await db.from("timesheets")
    .select("*")
    .eq("professional_email",pro.email)
    .eq("period_start",start)
    .maybeSingle();

  if (!ts.data) {
    ts = await db.from("timesheets")
      .insert({professional_email:pro.email,period_start:start,status:"draft"})
      .select("*").single();
  }

  pro.timesheet = ts.data;
  $("tsStatus").textContent = pro.timesheet.status;

  const e = await db.from("time_entries")
    .select("*")
    .eq("timesheet_id",pro.timesheet.id)
    .order("entry_date");

  pro.entries = e.data || [];
  renderTimesheet();
  updateComputed();
}

// =========================
// RENDER TIMESHEET
// =========================
function renderTimesheet() {
  const days = buildPeriodDays(pro.period_start);
  let html = `<table><thead><tr><th>Day</th><th>Entries</th><th>Total</th></tr></thead><tbody>`;

  for (const d of days) {
    html += `
      <tr>
        <td><b>${dayName(d)}</b><br><span class="mono">${d}</span></td>
        <td id="day_${d}"></td>
        <td class="mono" id="total_${d}">0.00</td>
      </tr>`;
  }

  html += `</tbody></table>
    <div class="row">
      <span>Week 1: <span id="wk1" class="mono">0.00</span></span>
      <span>Week 2: <span id="wk2" class="mono">0.00</span></span>
    </div>`;

  $("timesheetArea").innerHTML = html;

  for (const d of days) renderDay(d);
}

function renderDay(dayISO) {
  const rows = pro.entries.filter(e => e.entry_date === dayISO);
  const activeProjects = pro.projects.filter(p => p.status==="active");

  let html = "";
  for (const e of rows) {
    html += `
      <div class="entryRow" id="row_${e.id}">
        <select id="type_${e.id}">
          <option value="project" ${e.activity_type==="project"?"selected":""}>project</option>
          <option value="activity" ${e.activity_type==="activity"?"selected":""}>activity</option>
        </select>

        ${e.activity_type==="project"
          ? `<select id="proj_${e.id}">
              <option value="">Select project</option>
              ${activeProjects.map(p=>`<option value="${p.id}" ${p.id===e.project_id?"selected":""}>${escapeHtml(p.name)}</option>`).join("")}
            </select>`
          : `<select id="act_${e.id}">
              <option value="">Select activity</option>
              ${pro.activities.map(a=>`<option value="${a.code}" ${a.code===e.activity_code?"selected":""}>${escapeHtml(a.name)}</option>`).join("")}
            </select>`}

        <input type="number" step="0.25" value="${e.hours}" id="hrs_${e.id}">
        <button onclick="deleteRow('${e.id}')">✕</button>
      </div>`;
  }

  html += `<button onclick="addRow('${dayISO}')">+ Add row</button>`;
  $("day_"+dayISO).innerHTML = html;

  rows.forEach(e => wireRow(e));
}

function wireRow(e) {
  $("type_"+e.id).onchange = ev => {
    e.activity_type = ev.target.value;
    if (e.activity_type==="project") e.activity_code=null;
    else e.project_id=null;
    renderDay(e.entry_date);
  };

  if ($("proj_"+e.id))
    $("proj_"+e.id).onchange = ev => { e.project_id = ev.target.value||null; markDirty(); };

  if ($("act_"+e.id))
    $("act_"+e.id).onchange = ev => { e.activity_code = ev.target.value||null; markDirty(); };

  $("hrs_"+e.id).oninput = ev => {
    e.hours = safeNum(ev.target.value);
    markDirty();
    updateComputed();
  };
}

async function addRow(dayISO) {
  const ins = await db.from("time_entries").insert({
    timesheet_id: pro.timesheet.id,
    entry_date: dayISO,
    activity_type: "project",
    hours: 0
  }).select("*").single();

  pro.entries.push(ins.data);
  renderDay(dayISO);
}

async function deleteRow(id) {
  await db.from("time_entries").delete().eq("id",id);
  pro.entries = pro.entries.filter(e=>e.id!==id);
  renderTimesheet();
  updateComputed();
}

// =========================
// COMPUTED + VALIDATION
// =========================
function updateComputed() {
  const days = buildPeriodDays(pro.period_start);
  let wk1=0,wk2=0;
  const dayTotals = {};

  for (const d of days) dayTotals[d]=0;
  for (const e of pro.entries) dayTotals[e.entry_date]+=safeNum(e.hours);

  for (const d of days) {
    $("total_"+d).textContent = dayTotals[d].toFixed(2);
    const w = weekIndexWithinPeriod(d,pro.period_start);
    w===1 ? wk1+=dayTotals[d] : wk2+=dayTotals[d];
  }

  $("wk1").textContent = wk1.toFixed(2);
  $("wk2").textContent = wk2.toFixed(2);
}

function validateSubmit() {
  const errs=[];
  let wk1=0,wk2=0;

  for (const e of pro.entries) {
    if (!isQuarterHourIncrement(e.hours)) errs.push("Hours must be in .25 increments.");
    if (e.activity_type==="project" && !e.project_id) errs.push("Missing project.");
    if (e.activity_type==="activity" && !e.activity_code) errs.push("Missing activity.");
  }

  for (const d of buildPeriodDays(pro.period_start)) {
    const total = pro.entries.filter(e=>e.entry_date===d).reduce((s,e)=>s+safeNum(e.hours),0);
    if (total>24) errs.push(`More than 24 hours on ${d}`);
    weekIndexWithinPeriod(d,pro.period_start)===1 ? wk1+=total : wk2+=total;
  }

  if (wk1<40) errs.push(`Week 1 must be ≥ 40 hours (currently ${wk1.toFixed(2)})`);
  if (wk2<40) errs.push(`Week 2 must be ≥ 40 hours (currently ${wk2.toFixed(2)})`);
  if (!pro.approver_email) errs.push("No approver assigned.");

  return errs;
}

// =========================
// SAVE / SUBMIT
// =========================
$("btnSave").onclick = async () => {
  await db.from("timesheets").update({status:"draft"}).eq("id",pro.timesheet.id);
  toast("Saved","Draft saved.");
};

$("btnSubmit").onclick = async () => {
  const errs = validateSubmit();
  if (errs.length) return showBanner("proErrors",errs[0]);

  await db.from("timesheets")
    .update({status:"submitted",submitted_at:new Date().toISOString()})
    .eq("id",pro.timesheet.id);

  toast("Submitted","Timesheet submitted.");
  $("tsStatus").textContent="submitted";
};

// =========================
// ADMIN – PROJECTS / STATUSES / ACTIVITIES
// =========================
$("btnAddProject").onclick = async () => {
  const name=$("projName").value.trim();
  if (!name) return;
  await db.from("projects").insert({name,status:$("projStatus").value});
  $("projName").value="";
  refreshAdmin();
};

$("btnAddStatus").onclick = async () => {
  const code=$("statusCode").value.trim();
  const name=$("statusName").value.trim();
  if (!code||!name) return;
  await db.from("timesheet_statuses").insert({code,name});
  $("statusCode").value=""; $("statusName").value="";
  refreshAdmin();
};

$("btnAddActivity").onclick = async () => {
  const code=$("activityCode").value.trim();
  const name=$("activityName").value.trim();
  if (!code||!name) return;
  await db.from("activities").insert({code,name});
  $("activityCode").value=""; $("activityName").value="";
  refreshAdmin();
};

async function refreshAdmin() {
  await loadReferenceData();
}
