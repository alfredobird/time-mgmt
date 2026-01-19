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
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function dayName(iso) {
  const d = new Date(iso + "T00:00:00");
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
}
function isWeekday(iso) {
  const dow = new Date(iso + "T00:00:00").getDay();
  return dow >= 1 && dow <= 5;
}

// Anchor: first 2-week period in 2026 starts 2026-01-05 (Monday)
const ANCHOR = "2026-01-05";
function periodStartForDate(selectedISO) {
  const a = new Date(ANCHOR + "T00:00:00");
  const s = new Date(selectedISO + "T00:00:00");
  const diffDays = Math.floor((s - a) / (1000*60*60*24));
  const k = Math.floor(diffDays / 14);
  const start = new Date(a);
  start.setDate(a.getDate() + k*14);
  return toISODate(start);
}
function buildPeriodDays(periodStartISO) {
  const days = [];
  for (let i=0;i<14;i++) days.push(addDays(periodStartISO, i));
  return days;
}
function weekIndexWithinPeriod(iso, periodStartISO) {
  const p = new Date(periodStartISO + "T00:00:00");
  const d = new Date(iso + "T00:00:00");
  const diff = Math.floor((d - p) / (1000*60*60*24));
  return (diff < 7) ? 1 : 2;
}

// =========================
// State
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
  autosaveTimer: null,
  dirty: false
};

// =========================
// Tabs
// =========================
function setActiveTab(tabId, panelId) {
  ["tabPro","tabAppr","tabAdmin"].forEach(id => $(id).classList.remove("active"));
  ["panelPro","panelAppr","panelAdmin"].forEach(id => $(id).classList.remove("active"));
  $(tabId).classList.add("active");
  $(panelId).classList.add("active");
}
$("tabPro").onclick = () => setActiveTab("tabPro","panelPro");
$("tabAppr").onclick = () => setActiveTab("tabAppr","panelAppr");
$("tabAdmin").onclick = () => setActiveTab("tabAdmin","panelAdmin");

// =========================
// Reference data
// =========================
async function loadReferenceData() {
  const [projectsRes, activitiesRes, statusesRes] = await Promise.all([
    db.from("projects").select("*").order("name", {ascending:true}),
    db.from("activities").select("*").order("name", {ascending:true}),
    db.from("timesheet_statuses").select("*").order("code", {ascending:true})
  ]);

  if (projectsRes.error) console.error(projectsRes.error);
  if (activitiesRes.error) console.error(activitiesRes.error);
  if (statusesRes.error) console.error(statusesRes.error);

  pro.projects = projectsRes.data || [];
  pro.activities = activitiesRes.data || [];
  pro.statuses = statusesRes.data || [];
}

// =========================
// Professional: load & period
// =========================
$("btnLoadPro").onclick = async () => {
  showBanner("proErrors", "");
  showBanner("proWarnings", "");

  const email = $("proEmail").value.trim().toLowerCase();
  if (!isValidEmail(email)) {
    showBanner("proErrors", "Please enter a valid email address.");
    return;
  }

  await loadReferenceData();

  // Ensure professional exists
  let profRes = await db.from("professionals").select("*").eq("email", email).maybeSingle();
  if (profRes.error) { showBanner("proErrors", profRes.error.message); return; }

  if (!profRes.data) {
    const ins = await db.from("professionals").insert({ email }).select("*").single();
    if (ins.error) { showBanner("proErrors", ins.error.message); return; }
    profRes = ins;
  }

  pro.email = email;
  pro.approver_email = profRes.data.approver_email || null;
  $("proApproverMeta").innerHTML = `Approver: <span class="mono">${escapeHtml(pro.approver_email || "—")}</span>`;

  const today = toISODate(new Date());
  $("proDate").value = today;
  pro.period_start = periodStartForDate(today);

  await loadTimesheetAndEntries();
  toast("Loaded", "Professional data loaded.");
};

$("btnSetPeriod").onclick = async () => {
  showBanner("proErrors", "");
  showBanner("proWarnings", "");
  if (!pro.email) { showBanner("proErrors", "Load your email first."); return; }

  const picked = $("proDate").value;
  if (!picked) { showBanner("proErrors", "Pick a date."); return; }

  pro.period_start = periodStartForDate(picked);
  await loadTimesheetAndEntries();
};

async function loadTimesheetAndEntries() {
  $("saveChip").textContent = "Loading";
  $("saveState").textContent = "Fetching timesheet...";

  const start = pro.period_start;
  const end = addDays(start, 13);
  $("periodLabel").textContent = `${start} to ${end}`;

  // reload professional so approver changes show up
  const pr = await db.from("professionals").select("*").eq("email", pro.email).single();
  if (!pr.error) pro.approver_email = pr.data.approver_email || null;
  $("proApproverMeta").innerHTML = `Approver: <span class="mono">${escapeHtml(pro.approver_email || "—")}</span>`;

  // load or create timesheet
  let tsRes = await db.from("timesheets")
    .select("*")
    .eq("professional_email", pro.email)
    .eq("period_start", start)
    .maybeSingle();

  if (tsRes.error) { showBanner("proErrors", tsRes.error.message); return; }

  if (!tsRes.data) {
    const ins = await db.from("timesheets")
      .insert({ professional_email: pro.email, period_start: start, status: "draft" })
      .select("*").single();
    if (ins.error) { showBanner("proErrors", ins.error.message); return; }
    tsRes = ins;
  }

  pro.timesheet = tsRes.data;
  $("tsStatus").textContent = pro.timesheet.status;

  // load entries
  const eRes = await db.from("time_entries")
    .select("*")
    .eq("timesheet_id", pro.timesheet.id)
    .order("entry_date", {ascending:true});

  if (eRes.error) { showBanner("proErrors", eRes.error.message); return; }
  pro.entries = eRes.data || [];

  renderTimesheet();
  updateComputedUI();

  pro.dirty = false;
  $("saveChip").textContent = "Loaded";
  $("saveState").textContent = "Ready.";
}

// =========================
// Rendering
// =========================
function renderTimesheet() {
  const days = buildPeriodDays(pro.period_start);
  const activeProjects = pro.projects.filter(p => p.status === "active");

  const dayEntries = {};
  for (const d of days) dayEntries[d] = [];
  for (const e of pro.entries) {
    if (!dayEntries[e.entry_date]) dayEntries[e.entry_date] = [];
    dayEntries[e.entry_date].push(e);
  }

  let html = `
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th style="width:180px;">Day</th>
            <th>Entries</th>
            <th style="width:150px;">Day total</th>
          </tr>
        </thead>
        <tbody>
  `;

  for (const dayISO of days) {
    html += `
      <tr>
        <td>
          <div style="font-weight:800;">${dayName(dayISO)} <span class="mono">${dayISO}</span></div>
          <div class="small muted">${isWeekday(dayISO) ? "Weekday min 8 hrs (required for submit)" : "Weekend"}</div>
        </td>
        <td>
          <div id="dayRows_${dayISO}"></div>
          <button class="btn" data-addrow="${dayISO}">+ Add row</button>
        </td>
        <td class="right">
          <div class="mono" id="dayTotal_${dayISO}">0.00</div>
        </td>
      </tr>
    `;
  }

  html += `
        </tbody>
      </table>
    </div>

    <div class="row" style="margin-top:12px;">
      <span class="badge blue"><span class="dot"></span>Week 1 total: <span id="wk1Total" class="mono">0.00</span></span>
      <span class="badge blue"><span class="dot"></span>Week 2 total: <span id="wk2Total" class="mono">0.00</span></span>
      <span class="badge yellow"><span class="dot"></span>Project/week > 40 hours highlights rows</span>
    </div>
  `;

  $("timesheetArea").innerHTML = html;

  for (const dayISO of days) {
    renderDayRows(dayISO, activeProjects);
  }

  document.querySelectorAll("button[data-addrow]").forEach(btn => {
    btn.onclick = () => addNewRow(btn.getAttribute("data-addrow"));
  });
}

function renderDayRows(dayISO, activeProjects) {
  const container = $("dayRows_" + dayISO);
  const rows = pro.entries.filter(e => e.entry_date === dayISO);

  if (!rows.length) {
    container.innerHTML = `<div class="small muted">No entries yet.</div>`;
    return;
  }

  container.innerHTML = rows.map(e => rowEditorHTML(e, activeProjects)).join("");
  rows.forEach(e => attachRowHandlers(e.id));
}

function rowEditorHTML(e, activeProjects) {
  const isProj = e.activity_type === "project";
  const projOptions =
    ['<option value="">Select project…</option>']
      .concat(activeProjects.map(p =>
        `<option value="${p.id}" ${e.project_id===p.id?"selected":""}>${escapeHtml(p.name)}</option>`
      )).join("");

  const actOptions =
    ['<option value="">Select activity…</option>']
      .concat(pro.activities.map(a =>
        `<option value="${a.code}" ${e.activity_code===a.code?"selected":""}>${escapeHtml(a.name)}</option>`
      )).join("");

  return `
    <div class="entryRow" id="row_${e.id}">
      <div class="cell">
        <div class="label">Type</div>
        <select id="type_${e.id}">
          <option value="project" ${isProj?"selected":""}>project</option>
          <option value="activity" ${!isProj?"selected":""}>activity</option>
        </select>
      </div>

      <div class="cell">
        <div class="label">Project / Activity</div>
        <div id="pickWrap_${e.id}">
          ${isProj
            ? `<select id="project_${e.id}">${projOptions}</select>`
            : `<select id="activity_${e.id}">${actOptions}</select>`
          }
        </div>
      </div>

      <div class="cell">
        <div class="label">Hours (.25)</div>
        <input id="hours_${e.id}" type="number" step="0.25" min="0" max="24" value="${e.hours ?? 0}" />
      </div>

      <div class="cell">
        <div class="label">Note (optional)</div>
        <input id="note_${e.id}" value="${escapeHtml(e.note || "")}" />
      </div>

      <div class="cell">
        <div class="label">&nbsp;</div>
        <button class="btn dangerBtn" id="del_${e.id}">Delete</button>
      </div>
    </div>
  `;
}

function attachRowHandlers(entryId) {
  const e = pro.entries.find(x => x.id === entryId);
  if (!e) return;

  $("type_" + entryId).onchange = () => {
    e.activity_type = $("type_" + entryId).value;
    if (e.activity_type === "project") e.activity_code = null;
    else e.project_id = null;

    markDirty();
    // rerender day to swap dropdown
    const activeProjects = pro.projects.filter(p => p.status === "active");
    renderDayRows(e.entry_date, activeProjects);
    updateComputedUI();
    scheduleAutosave();
  };

  $("hours_" + entryId).oninput = () => {
    e.hours = safeNum($("hours_" + entryId).value);
    markDirty();
    updateComputedUI();
    scheduleAutosave();
  };

  $("note_" + entryId).oninput = () => {
    e.note = $("note_" + entryId).value || "";
    markDirty();
    scheduleAutosave();
  };

  const projSel = $("project_" + entryId);
  const actSel = $("activity_" + entryId);

  if (projSel) projSel.onchange = () => {
    e.project_id = projSel.value || null;
    markDirty();
    updateComputedUI();
    scheduleAutosave();
  };
  if (actSel) actSel.onchange = () => {
    e.activity_code = actSel.value || null;
    markDirty();
    updateComputedUI();
    scheduleAutosave();
  };

  $("del_" + entryId).onclick = async () => {
    showBanner("proErrors", "");
    const del = await db.from("time_entries").delete().eq("id", entryId);
    if (del.error) { showBanner("proErrors", del.error.message); return; }
    pro.entries = pro.entries.filter(x => x.id !== entryId);
    markDirty();
    renderTimesheet();
    updateComputedUI();
    scheduleAutosave();
  };
}

async function addNewRow(dayISO) {
  showBanner("proErrors", "");
  if (!pro.timesheet) { showBanner("proErrors", "Load timesheet first."); return; }

  const ins = await db.from("time_entries").insert({
    timesheet_id: pro.timesheet.id,
    entry_date: dayISO,
    activity_type: "project",
    hours: 0,
    note: ""
  }).select("*").single();

  if (ins.error) { showBanner("proErrors", ins.error.message); return; }

  pro.entries.push(ins.data);
  markDirty();
  renderTimesheet();
  updateComputedUI();
  scheduleAutosave();
}

// =========================
// Validation & computed UI
// =========================
function updateComputedUI() {
  showBanner("proErrors", "");
  showBanner("proWarnings", "");

  const days = buildPeriodDays(pro.period_start);

  // totals
  const dayTotal = {};
  for (const d of days) dayTotal[d] = 0;

  for (const e of pro.entries) {
    dayTotal[e.entry_date] = (dayTotal[e.entry_date] || 0) + safeNum(e.hours);
  }

  let wk1 = 0, wk2 = 0;
  for (const d of days) {
    const total = round2(dayTotal[d] || 0);
    const el = $("dayTotal_" + d);
    if (el) el.textContent = total.toFixed(2);

    if (total > 24.00001) showBanner("proErrors", `Error: ${d} exceeds 24 hours.`);

    const w = weekIndexWithinPeriod(d, pro.period_start);
    if (w === 1) wk1 += total; else wk2 += total;
  }
  if ($("wk1Total")) $("wk1Total").textContent = round2(wk1).toFixed(2);
  if ($("wk2Total")) $("wk2Total").textContent = round2(wk2).toFixed(2);

  // weekly per project > 40 highlight
  const perProjWeek = {};
  for (const e of pro.entries) {
    if (e.activity_type !== "project" || !e.project_id) continue;
    const w = weekIndexWithinPeriod(e.entry_date, pro.period_start);
    const key = w + "|" + e.project_id;
    perProjWeek[key] = (perProjWeek[key] || 0) + safeNum(e.hours);
  }

  document.querySelectorAll(".highlight").forEach(el => el.classList.remove("highlight"));
  const overKeys = Object.keys(perProjWeek).filter(k => perProjWeek[k] > 40.00001);
  if (overKeys.length) {
    showBanner("proWarnings", "Warning: One or more projects exceed 40 hours in a week (highlighted).");
    for (const e of pro.entries) {
      if (e.activity_type !== "project" || !e.project_id) continue;
      const w = weekIndexWithinPeriod(e.entry_date, pro.period_start);
      const key = w + "|" + e.project_id;
      if (perProjWeek[key] > 40.00001) {
        const rowEl = $("row_" + e.id);
        if (rowEl) rowEl.classList.add("highlight");
      }
    }
  }

  // save chip styling
  $("saveChip").textContent = pro.dirty ? "Unsaved" : "Saved";
}

function validateBeforeSaveOrSubmit(isSubmit) {
  const errs = [];
  const days = buildPeriodDays(pro.period_start);

  for (const e of pro.entries) {
    const h = safeNum(e.hours);
    if (h < 0) errs.push("Hours cannot be negative.");
    if (!isQuarterHourIncrement(h)) errs.push(`Hours must be in .25 increments (issue on ${e.entry_date}).`);

    if (e.activity_type === "project") {
      if (!e.project_id) errs.push(`Each row must have a project selected (${e.entry_date}).`);
    } else {
      if (!e.activity_code) errs.push(`Each row must have an activity selected (${e.entry_date}).`);
    }
  }

  if (isSubmit) {
    const dayTotal = {};
    for (const d of days) dayTotal[d] = 0;
    for (const e of pro.entries) dayTotal[e.entry_date] = (dayTotal[e.entry_date] || 0) + safeNum(e.hours);

    for (const d of days) {
      if (isWeekday(d)) {
        const total = round2(dayTotal[d] || 0);
        if (total + 1e-9 < 8) errs.push(`Weekday ${d} must be at least 8 hours (currently ${total.toFixed(2)}).`);
      }
      if ((dayTotal[d] || 0) > 24.00001) errs.push(`Day ${d} exceeds 24 hours.`);
    }

    if (!pro.approver_email || !isValidEmail(pro.approver_email)) {
      errs.push("No approver is assigned. Ask admin to assign one before submitting.");
    }
  }

  return errs;
}

// =========================
// Autosave + Save + Submit
// =========================
function markDirty() {
  pro.dirty = true;
  $("saveState").textContent = "Changes detected (autosaving soon)…";
  $("saveChip").textContent = "Unsaved";
}
function scheduleAutosave() {
  if (!pro.email || !pro.timesheet) return;
  clearTimeout(pro.autosaveTimer);
  pro.autosaveTimer = setTimeout(async () => {
    await saveTimesheet(false);
  }, 900);
}

$("btnSave").onclick = async () => saveTimesheet(true);

async function saveTimesheet(showMessage) {
  showBanner("proErrors", "");
  const errs = validateBeforeSaveOrSubmit(false);
  if (errs.length) { showBanner("proErrors", errs[0]); return; }

  $("saveState").textContent = "Saving…";
  $("saveChip").textContent = "Saving";

  // keep draft unless already submitted/approved etc.
  let newStatus = pro.timesheet.status;
  if (pro.timesheet.status === "draft" || pro.timesheet.status === "return") newStatus = "draft";

  const tsUp = await db.from("timesheets")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", pro.timesheet.id)
    .select("*").single();

  if (tsUp.error) { showBanner("proErrors", tsUp.error.message); $("saveState").textContent = "Save failed."; return; }

  pro.timesheet = tsUp.data;
  $("tsStatus").textContent = pro.timesheet.status;

  pro.dirty = false;
  $("saveChip").textContent = "Saved";
  $("saveState").textContent = "Saved.";
  if (showMessage) toast("Saved", "Your changes have been saved.");
}

$("btnSubmit").onclick = async () => {
  showBanner("proErrors", "");
  const errs = validateBeforeSaveOrSubmit(true);
  if (errs.length) { showBanner("proErrors", errs[0]); return; }

  $("saveState").textContent = "Submitting…";
  $("saveChip").textContent = "Submitting";

  const tsUp = await db.from("timesheets")
    .update({ status: "submitted", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", pro.timesheet.id)
    .select("*").single();

  if (tsUp.error) { showBanner("proErrors", tsUp.error.message); $("saveState").textContent = "Submit failed."; return; }

  pro.timesheet = tsUp.data;
  $("tsStatus").textContent = pro.timesheet.status;
  pro.dirty = false;
  $("saveChip").textContent = "Submitted";
  $("saveState").textContent = "Submitted for approval.";
  toast("Submitted", "Your timesheet was submitted for approval.");
};

// =========================
// Approver
// =========================
$("btnLoadAppr").onclick = async () => {
  const email = $("apprEmail").value.trim().toLowerCase();
  $("apprList").innerHTML = "";

  if (!isValidEmail(email)) {
    $("apprList").innerHTML = `<div class="banner error" style="display:block;">Enter a valid approver email.</div>`;
    return;
  }

  const pros = await db.from("professionals").select("*").eq("approver_email", email);
  if (pros.error) {
    $("apprList").innerHTML = `<div class="banner error" style="display:block;">${escapeHtml(pros.error.message)}</div>`;
    return;
  }
  const proEmails = (pros.data || []).map(p => p.email);
  if (!proEmails.length) {
    $("apprList").innerHTML = `<div class="card"><div class="muted small">No professionals assigned to this approver yet.</div></div>`;
    return;
  }

  const ts = await db.from("timesheets")
    .select("*")
    .in("professional_email", proEmails)
    .eq("status", "submitted")
    .order("period_start", {ascending:false});

  if (ts.error) {
    $("apprList").innerHTML = `<div class="banner error" style="display:block;">${escapeHtml(ts.error.message)}</div>`;
    return;
  }

  const list = ts.data || [];
  if (!list.length) {
    $("apprList").innerHTML = `<div class="card"><div class="muted small">No submitted timesheets right now.</div></div>`;
    return;
  }

  let html = "";
  for (const t of list) {
    html += `
      <div class="card" style="margin-top:12px;">
        <div class="row" style="justify-content:space-between;">
          <div>
            <div style="font-weight:800;">${escapeHtml(t.professional_email)}</div>
            <div class="small muted">Period: <span class="mono">${t.period_start}</span> to <span class="mono">${addDays(t.period_start, 13)}</span></div>
          </div>
          <span class="badge yellow"><span class="dot"></span>${escapeHtml(t.status)}</span>
        </div>
        <div class="row" style="margin-top:10px;">
          <button class="btn primary" data-approve="${t.id}">Approve</button>
          <button class="btn" data-return="${t.id}">Return</button>
        </div>
      </div>
    `;
  }
  $("apprList").innerHTML = html;

  document.querySelectorAll("button[data-approve]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-approve");
      await db.from("timesheets").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", id);
      toast("Approved", "Timesheet approved.");
      $("btnLoadAppr").click();
    };
  });

  document.querySelectorAll("button[data-return]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-return");
      await db.from("timesheets").update({ status: "return", updated_at: new Date().toISOString() }).eq("id", id);
      toast("Returned", "Timesheet returned to professional.");
      $("btnLoadAppr").click();
    };
  });
};

// =========================
// Admin
// =========================
$("btnAssignApprover").onclick = async () => {
  const p = $("adminProEmail").value.trim().toLowerCase();
  const a = $("adminApproverEmail").value.trim().toLowerCase();
  $("adminAssignMsg").textContent = "";

  if (!isValidEmail(p)) { $("adminAssignMsg").textContent = "Invalid professional email."; return; }
  if (!isValidEmail(a)) { $("adminAssignMsg").textContent = "Invalid approver email."; return; }

  let prof = await db.from("professionals").select("*").eq("email", p).maybeSingle();
  if (prof.error) { $("adminAssignMsg").textContent = prof.error.message; return; }

  if (!prof.data) {
    const ins = await db.from("professionals").insert({ email: p, approver_email: a }).select("*").single();
    if (ins.error) { $("adminAssignMsg").textContent = ins.error.message; return; }
  } else {
    const up = await db.from("professionals").update({ approver_email: a, updated_at: new Date().toISOString() }).eq("email", p);
    if (up.error) { $("adminAssignMsg").textContent = up.error.message; return; }
  }

  $("adminAssignMsg").textContent = `Saved: ${p} → ${a}`;
  toast("Saved", "Approver assignment updated.");
};

$("btnAddProject").onclick = async () => {
  const name = $("projName").value.trim();
  const status = $("projStatus").value;
  if (!name) return;

  const ins = await db.from("projects").insert({ name, status }).select("*").single();
  if (ins.error) { toast("Error", ins.error.message, "err"); return; }

  $("projName").value = "";
  await refreshAdminTables();
  await loadReferenceData();
  toast("Added", "Project created.");
};

async function refreshAdminTables() {
  // projects
  const projectsRes = await db.from("projects").select("*").order("name",{ascending:true});
  const projects = projectsRes.data || [];
  let pHtml = `<div class="tableWrap"><table style="min-width:520px;"><thead><tr><th>Name</th><th>Status</th><th>Action</th></tr></thead><tbody>`;
  for (const p of projects) {
    pHtml += `
      <tr>
        <td>${escapeHtml(p.name)}</td>
        <td>
          <select data-pstatus="${p.id}">
            <option value="active" ${p.status==="active"?"selected":""}>active</option>
            <option value="inactive" ${p.status==="inactive"?"selected":""}>inactive</option>
          </select>
        </td>
        <td><button class="btn dangerBtn" data-pdel="${p.id}">Delete</button></td>
      </tr>
    `;
  }
  pHtml += `</tbody></table></div>`;
  $("projectsTable").innerHTML = pHtml;

  document.querySelectorAll("select[data-pstatus]").forEach(sel => {
    sel.onchange = async () => {
      const id = sel.getAttribute("data-pstatus");
      await db.from("projects").update({ status: sel.value }).eq("id", id);
      await loadReferenceData();
      toast("Updated", "Project status updated.");
    };
  });
  document.querySelectorAll("button[data-pdel]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-pdel");
      await db.from("projects").delete().eq("id", id);
      await refreshAdminTables();
      await loadReferenceData();
      toast("Deleted", "Project deleted.");
    };
  });

  // statuses
  const sRes = await db.from("timesheet_statuses").select("*").order("code",{ascending:true});
  const sts = sRes.data || [];
  let sHtml = `<div class="tableWrap"><table style="min-width:320px;"><thead><tr><th>Code</th><th>Name</th></tr></thead><tbody>`;
  for (const s of sts) {
    sHtml += `<tr><td class="mono">${escapeHtml(s.code)}</td><td>${escapeHtml(s.name)}</td></tr>`;
  }
  sHtml += `</tbody></table></div>`;
  $("statusesTable").innerHTML = sHtml;

  // activities
  const aRes = await db.from("activities").select("*").order("name",{ascending:true});
  const acts = aRes.data || [];
  let aHtml = `<div class="tableWrap"><table style="min-width:320px;"><thead><tr><th>Code</th><th>Name</th></tr></thead><tbody>`;
  for (const a of acts) {
    aHtml += `<tr><td class="mono">${escapeHtml(a.code)}</td><td>${escapeHtml(a.name)}</td></tr>`;
  }
  aHtml += `</tbody></table></div>`;
  $("activitiesTable").innerHTML = aHtml;
}

// =========================
// Init
// =========================
(async function init() {
  $("proDate").value = toISODate(new Date());
  await loadReferenceData();
  await refreshAdminTables();
  $("saveState").textContent = "Enter your email to begin.";
})();
