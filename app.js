// =========================
// 1) PUT YOUR SUPABASE INFO HERE
// =========================
const SUPABASE_URL = "https://cemfumevmkckmlkyqrus.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VXhUaC_KIJQPoGXcJ5BMdg_BEx0i6wF";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// Helpers
// ============================================================
const $ = (id) => document.getElementById(id);

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
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

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function isQuarterHourIncrement(h) {
  return Math.abs(h * 4 - Math.round(h * 4)) < 1e-9;
}

function dayName(iso) {
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(iso).getDay()];
}

// ============================================================
// Period logic
// ============================================================
const ANCHOR = "2026-01-05"; // Monday

function periodStartForDate(dateISO) {
  const a = new Date(ANCHOR);
  const d = new Date(dateISO);
  const diff = Math.floor((d - a) / 86400000);
  const k = Math.floor(diff / 14);
  a.setDate(a.getDate() + k * 14);
  return toISODate(a);
}

function buildPeriodDays(startISO) {
  return Array.from({length:14}, (_,i) => addDays(startISO, i));
}

function weekIndex(dayISO, periodStartISO) {
  const diff = Math.floor((new Date(dayISO) - new Date(periodStartISO)) / 86400000);
  return diff < 7 ? 1 : 2;
}

// ============================================================
// App state
// ============================================================
let pro = {
  email: null,
  approver: null,
  periodStart: null,
  timesheet: null,
  entries: [],
  projects: [],
  activities: [],
  statuses: []
};

// ============================================================
// Tabs
// ============================================================
function activate(tab, panel) {
  ["tabPro","tabAppr","tabAdmin"].forEach(t => $(t)?.classList.remove("active"));
  ["panelPro","panelAppr","panelAdmin"].forEach(p => $(p)?.classList.remove("active"));
  $(tab)?.classList.add("active");
  $(panel)?.classList.add("active");
}

$("tabPro")?.onclick = () => activate("tabPro","panelPro");
$("tabAppr")?.onclick = () => activate("tabAppr","panelAppr");
$("tabAdmin")?.onclick = async () => {
  activate("tabAdmin","panelAdmin");
  await loadReferenceData();
  await refreshAdminTables();
};

// ============================================================
// Load reference data
// ============================================================
async function loadReferenceData() {
  pro.projects = (await db.from("projects").select("*").order("name")).data || [];
  pro.activities = (await db.from("activities").select("*").order("code")).data || [];
  pro.statuses = (await db.from("timesheet_statuses").select("*").order("code")).data || [];
}

// ============================================================
// PROFESSIONAL
// ============================================================
$("btnLoadPro").onclick = async () => {
  const email = $("proEmail").value.trim().toLowerCase();
  if (!isValidEmail(email)) return alert("Invalid email");

  await loadReferenceData();

  let prof = await db.from("professionals").select("*").eq("email", email).maybeSingle();
  if (!prof.data) {
    prof = await db.from("professionals").insert({email}).select("*").single();
  }

  pro.email = email;
  pro.approver = prof.data.approver_email || null;
  $("proApproverMeta").innerHTML = `Approver: <span class="mono">${escapeHtml(pro.approver || "—")}</span>`;

  $("proDate").value = toISODate(new Date());
  pro.periodStart = periodStartForDate($("proDate").value);

  await loadTimesheet();
};

$("btnSetPeriod").onclick = async () => {
  pro.periodStart = periodStartForDate($("proDate").value);
  await loadTimesheet();
};

async function loadTimesheet() {
  const start = pro.periodStart;
  $("periodLabel").textContent = `${start} to ${addDays(start,13)}`;

  let ts = await db.from("timesheets")
    .select("*")
    .eq("professional_email", pro.email)
    .eq("period_start", start)
    .maybeSingle();

  if (!ts.data) {
    ts = await db.from("timesheets")
      .insert({professional_email: pro.email, period_start: start, status: "draft"})
      .select("*")
      .single();
  }

  pro.timesheet = ts.data;
  $("tsStatus").textContent = pro.timesheet.status;

  pro.entries = (await db.from("time_entries")
    .select("*")
    .eq("timesheet_id", pro.timesheet.id)
    .order("entry_date")).data || [];

  renderTimesheet();
  updateTotals();
}

// ============================================================
// Render timesheet
// ============================================================
function renderTimesheet() {
  const days = buildPeriodDays(pro.periodStart);
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
  let html = "";

  for (const e of rows) {
    html += `
      <div class="entryRow">
        <select onchange="updateType('${e.id}',this.value)">
          <option value="project" ${e.activity_type==="project"?"selected":""}>project</option>
          <option value="activity" ${e.activity_type==="activity"?"selected":""}>activity</option>
        </select>

        ${e.activity_type==="project"
          ? projectSelect(e)
          : activitySelect(e)
        }

        <input type="number" step="0.25" value="${e.hours}" 
               oninput="updateHours('${e.id}',this.value)">
        <button onclick="deleteRow('${e.id}')">✕</button>
      </div>`;
  }

  html += `<button onclick="addRow('${dayISO}')">+ Add row</button>`;
  $("day_"+dayISO).innerHTML = html;
}

function projectSelect(e) {
  return `<select onchange="updateProject('${e.id}',this.value)">
    <option value="">Project</option>
    ${pro.projects.filter(p=>p.status==="active")
      .map(p=>`<option value="${p.id}" ${p.id===e.project_id?"selected":""}>${escapeHtml(p.name)}</option>`).join("")}
  </select>`;
}

function activitySelect(e) {
  return `<select onchange="updateActivity('${e.id}',this.value)">
    <option value="">Activity</option>
    ${pro.activities.map(a=>`<option value="${a.code}" ${a.code===e.activity_code?"selected":""}>${escapeHtml(a.name)}</option>`).join("")}
  </select>`;
}

// ============================================================
// Entry updates (PERSISTED)
// ============================================================
async function persist(e) {
  await db.from("time_entries").update({
    activity_type: e.activity_type,
    project_id: e.project_id,
    activity_code: e.activity_code,
    hours: e.hours
  }).eq("id", e.id);
}

window.updateType = async (id,val) => {
  const e = pro.entries.find(x=>x.id===id);
  e.activity_type = val;
  e.project_id = null;
  e.activity_code = null;
  await persist(e);
  renderDay(e.entry_date);
  updateTotals();
};

window.updateProject = async (id,val) => {
  const e = pro.entries.find(x=>x.id===id);
  e.project_id = val || null;
  await persist(e);
  updateTotals();
};

window.updateActivity = async (id,val) => {
  const e = pro.entries.find(x=>x.id===id);
  e.activity_code = val || null;
  await persist(e);
  updateTotals();
};

window.updateHours = async (id,val) => {
  const e = pro.entries.find(x=>x.id===id);
  e.hours = safeNum(val);
  await persist(e);
  updateTotals();
};

window.addRow = async (dayISO) => {
  const ins = await db.from("time_entries").insert({
    timesheet_id: pro.timesheet.id,
    entry_date: dayISO,
    activity_type: "project",
    hours: 0
  }).select("*").single();
  pro.entries.push(ins.data);
  renderDay(dayISO);
};

window.deleteRow = async (id) => {
  await db.from("time_entries").delete().eq("id",id);
  pro.entries = pro.entries.filter(e=>e.id!==id);
  renderTimesheet();
  updateTotals();
};

// ============================================================
// Totals + submit validation
// ============================================================
function updateTotals() {
  const days = buildPeriodDays(pro.periodStart);
  let wk1=0,wk2=0;

  for (const d of days) {
    const total = pro.entries.filter(e=>e.entry_date===d)
      .reduce((s,e)=>s+safeNum(e.hours),0);
    $("total_"+d).textContent = total.toFixed(2);
    weekIndex(d,pro.periodStart)===1 ? wk1+=total : wk2+=total;
  }

  $("wk1").textContent = wk1.toFixed(2);
  $("wk2").textContent = wk2.toFixed(2);
}

// ============================================================
// Save / Submit
// ============================================================
$("btnSave").onclick = async () => {
  alert("Saved (entries autosave)");
};

$("btnSubmit").onclick = async () => {
  let wk1=0,wk2=0;
  for (const e of pro.entries) {
    if (!isQuarterHourIncrement(e.hours)) return alert("Hours must be in .25 increments");
    weekIndex(e.entry_date,pro.periodStart)===1 ? wk1+=e.hours : wk2+=e.hours;
  }
  if (wk1<40 || wk2<40) return alert("Each week must have at least 40 hours");
  if (!pro.approver) return alert("No approver assigned");

  await db.from("timesheets")
    .update({status:"submitted",submitted_at:new Date().toISOString()})
    .eq("id",pro.timesheet.id);

  $("tsStatus").textContent = "submitted";
};

// ============================================================
// APPROVER (STATUS ONLY)
// ============================================================
$("btnLoadAppr").onclick = async () => {
  const email = $("apprEmail").value.trim().toLowerCase();
  const pros = (await db.from("professionals").select("*").eq("approver_email",email)).data || [];
  const proEmails = pros.map(p=>p.email);

  const ts = (await db.from("timesheets")
    .select("*")
    .in("professional_email",proEmails)
    .eq("status","submitted")).data || [];

  $("apprList").innerHTML = ts.map(t=>`
    <div class="card">
      <b>${escapeHtml(t.professional_email)}</b>
      <div class="mono">${t.period_start}</div>
      <button onclick="approve('${t.id}')">Approve</button>
      <button onclick="ret('${t.id}')">Return</button>
    </div>
  `).join("");
};

window.approve = async (id) => {
  await db.from("timesheets").update({status:"approved"}).eq("id",id);
  $("btnLoadAppr").click();
};

window.ret = async (id) => {
  await db.from("timesheets").update({status:"return"}).eq("id",id);
  $("btnLoadAppr").click();
};

// ============================================================
// ADMIN
// ============================================================
$("btnAssignApprover").onclick = async () => {
  const p=$("adminProEmail").value.trim().toLowerCase();
  const a=$("adminApproverEmail").value.trim().toLowerCase();
  await db.from("professionals").upsert({email:p,approver_email:a});
  alert("Saved");
};

$("btnAddProject").onclick = async () => {
  await db.from("projects").insert({name:$("projName").value,status:$("projStatus").value});
  refreshAdminTables();
};

$("btnAddStatus").onclick = async () => {
  await db.from("timesheet_statuses").insert({code:$("statusCode").value,name:$("statusName").value});
  refreshAdminTables();
};

$("btnAddActivity").onclick = async () => {
  await db.from("activities").insert({code:$("activityCode").value,name:$("activityName").value});
  refreshAdminTables();
};

async function refreshAdminTables() {
  $("projectsTable").innerHTML = table(await db.from("projects").select("*"),["name","status"]);
  $("statusesTable").innerHTML = table(await db.from("timesheet_statuses").select("*"),["code","name"]);
  $("activitiesTable").innerHTML = table(await db.from("activities").select("*"),["code","name"]);
}

function table(res,cols) {
  const rows = res.data||[];
  let h="<table><tr>"+cols.map(c=>`<th>${c}</th>`).join("")+"</tr>";
  for (const r of rows) {
    h+="<tr>"+cols.map(c=>`<td>${escapeHtml(r[c])}</td>`).join("")+"</tr>";
  }
  return h+"</table>";
}

// ============================================================
// INIT
// ============================================================
(async function init(){
  $("proDate").value = toISODate(new Date());
  await loadReferenceData();
  await refreshAdminTables();
})();
