// ============================================================
// SUPABASE CONFIG — EDIT THESE TWO VALUES ONLY
// ============================================================
const SUPABASE_URL = "https://cemfumevmkckmlkyqrus.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VXhUaC_KIJQPoGXcJ5BMdg_BEx0i6wF";

// ============================================================
// Helpers (safe + newbie-proof)
// ============================================================
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function toast(title, body = "", kind = "ok") {
  const t = $("toast");
  if (!t) return;
  t.className = "toast show " + (kind === "ok" ? "ok" : "err");
  t.innerHTML = `<div class="tTitle">${escapeHtml(title)}</div><div class="tBody">${escapeHtml(body)}</div>`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

function showBanner(id, text) {
  const el = $(id);
  if (!el) return;
  if (!text) { el.style.display = "none"; el.textContent = ""; return; }
  el.style.display = "block";
  el.textContent = text;
}

function setSaveState(chipText, stateText) {
  if ($("saveChip")) $("saveChip").textContent = chipText;
  if ($("saveState")) $("saveState").textContent = stateText;
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

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isQuarterHourIncrement(hours) {
  const x = Math.round(hours * 100) / 100;
  return Math.abs(x * 4 - Math.round(x * 4)) < 1e-9;
}

function dayName(iso) {
  const d = new Date(iso + "T00:00:00");
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
}

function onClick(id, fn) {
  const el = $(id);
  if (!el) {
    console.warn(`Missing element id="${id}"`);
    return;
  }
  el.addEventListener("click", async (e) => {
    try { await fn(e); }
    catch (err) {
      console.error(err);
      toast("Error", err?.message || String(err), "err");
    }
  });
}

// ============================================================
// Period logic
// ============================================================
const ANCHOR = "2026-01-05"; // Monday

function periodStartForDate(selectedISO) {
  const anchor = new Date(ANCHOR + "T00:00:00");
  const s = new Date(selectedISO + "T00:00:00");
  const diffDays = Math.floor((s - anchor) / 86400000);
  const k = Math.floor(diffDays / 14);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() + k * 14);
  return toISODate(start);
}

function buildPeriodDays(startISO) {
  return Array.from({length:14}, (_,i) => addDays(startISO, i));
}

function weekIndexWithinPeriod(dayISO, periodStartISO) {
  const diff = Math.floor((new Date(dayISO + "T00:00:00") - new Date(periodStartISO + "T00:00:00")) / 86400000);
  return diff < 7 ? 1 : 2;
}

// ============================================================
// Supabase client (created after page load)
// ============================================================
let db = null;

// ============================================================
// App state
// ============================================================
let pro = {
  email: null,
  approver_email: null,
  period_start: null,
  timesheet: null,
  entries: [],
  projects: [],
  activities: [],
  statuses: []
};

// ============================================================
// Autosave (per entry, debounced)
// ============================================================
const _entrySaveTimers = {};
function markDirty() {
  setSaveState("Unsaved", "Changes detected (autosaving)...");
}

async function updateEntryInDb(entry) {
  const payload = {
    activity_type: entry.activity_type,
    project_id: entry.project_id,
    activity_code: entry.activity_code,
    hours: safeNum(entry.hours),
    note: entry.note || ""
  };
  const res = await db.from("time_entries").update(payload).eq("id", entry.id);
  if (res.error) throw new Error(res.error.message);
}

function scheduleEntryAutosave(entry) {
  markDirty();
  clearTimeout(_entrySaveTimers[entry.id]);
  _entrySaveTimers[entry.id] = setTimeout(async () => {
    try {
      await updateEntryInDb(entry);
      setSaveState("Saved", "All changes saved.");
    } catch (e) {
      console.error(e);
      showBanner("proErrors", e.message || String(e));
      setSaveState("Error", "Autosave failed.");
    }
  }, 600);
}

async function saveAllEntriesNow() {
  Object.keys(_entrySaveTimers).forEach(k => clearTimeout(_entrySaveTimers[k]));
  for (const e of pro.entries) {
    await updateEntryInDb(e);
  }
  setSaveState("Saved", "All changes saved.");
}

// ============================================================
// Tabs
// ============================================================
function activateTab(tabId, panelId) {
  ["tabPro","tabAppr","tabAdmin"].forEach(id => $(id)?.classList.remove("active"));
  ["panelPro","panelAppr","panelAdmin"].forEach(id => $(id)?.classList.remove("active"));
  $(tabId)?.classList.add("active");
  $(panelId)?.classList.add("active");
}

function bindTabs() {
  onClick("tabPro", async () => activateTab("tabPro","panelPro"));
  onClick("tabAppr", async () => activateTab("tabAppr","panelAppr"));
  onClick("tabAdmin", async () => {
    activateTab("tabAdmin","panelAdmin");
    await loadReferenceData();
    await refreshAdminTables();
  });
}

// ============================================================
// Reference data
// ============================================================
async function loadReferenceData() {
  const [p,a,s] = await Promise.all([
    db.from("projects").select("*").order("name",{ascending:true}),
    db.from("activities").select("*").order("code",{ascending:true}),
    db.from("timesheet_statuses").select("*").order("code",{ascending:true})
  ]);

  if (p.error) throw new Error(p.error.message);
  if (a.error) throw new Error(a.error.message);
  if (s.error) throw new Error(s.error.message);

  pro.projects = p.data || [];
  pro.activities = a.data || [];
  pro.statuses = s.data || [];
}

// ============================================================
// PROFESSIONAL
// ============================================================
function bindProfessional() {
  onClick("btnLoadPro", loadProfessional);
  onClick("btnSetPeriod", setPeriod);
  onClick("btnSave", saveTimesheetDraft);
  onClick("btnSubmit", submitTimesheet);
}

async function loadProfessional() {
  showBanner("proErrors", "");
  showBanner("proWarnings", "");

  const email = ($("proEmail")?.value || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    showBanner("proErrors", "Please enter a valid email address.");
    return;
  }

  setSaveState("Loading", "Loading...");
  await loadReferenceData();

  // Ensure professional exists
  let profRes = await db.from("professionals").select("*").eq("email", email).maybeSingle();
  if (profRes.error) throw new Error(profRes.error.message);

  if (!profRes.data) {
    const ins = await db.from("professionals").insert({ email }).select("*").single();
    if (ins.error) throw new Error(ins.error.message);
    profRes = ins;
  }

  pro.email = email;
  pro.approver_email = profRes.data.approver_email || null;

  if ($("proApproverMeta")) {
    $("proApproverMeta").innerHTML = `Approver: <span class="mono">${escapeHtml(pro.approver_email || "—")}</span>`;
  }

  const today = toISODate(new Date());
  if ($("proDate")) $("proDate").value = today;

  pro.period_start = periodStartForDate(today);
  await loadTimesheetAndEntries();

  toast("Loaded", "Professional loaded.");
}

async function setPeriod() {
  showBanner("proErrors", "");
  showBanner("proWarnings", "");

  if (!pro.email) {
    showBanner("proErrors", "Load your email first.");
    return;
  }

  const picked = $("proDate")?.value;
  if (!picked) {
    showBanner("proErrors", "Pick a date.");
    return;
  }

  pro.period_start = periodStartForDate(picked);
  await loadTimesheetAndEntries();
}

async function loadTimesheetAndEntries() {
  setSaveState("Loading", "Loading timesheet...");
  if ($("timesheetArea")) $("timesheetArea").innerHTML = "";

  const start = pro.period_start;
  const end = addDays(start, 13);

  if ($("periodLabel")) $("periodLabel").textContent = `${start} to ${end}`;

  // refresh approver (in case admin changed it)
  const pr = await db.from("professionals").select("*").eq("email", pro.email).single();
  if (!pr.error) pro.approver_email = pr.data.approver_email || null;
  if ($("proApproverMeta")) {
    $("proApproverMeta").innerHTML = `Approver: <span class="mono">${escapeHtml(pro.approver_email || "—")}</span>`;
  }

  // load or create timesheet
  let ts = await db.from("timesheets")
    .select("*")
    .eq("professional_email", pro.email)
    .eq("period_start", start)
    .maybeSingle();
  if (ts.error) throw new Error(ts.error.message);

  if (!ts.data) {
    const ins = await db.from("timesheets")
      .insert({ professional_email: pro.email, period_start: start, status: "draft" })
      .select("*").single();
    if (ins.error) throw new Error(ins.error.message);
    ts = ins;
  }

  pro.timesheet = ts.data;
  if ($("tsStatus")) $("tsStatus").textContent = pro.timesheet.status;

  // load entries
  const eRes = await db.from("time_entries")
    .select("*")
    .eq("timesheet_id", pro.timesheet.id)
    .order("entry_date", {ascending:true});
  if (eRes.error) throw new Error(eRes.error.message);

  pro.entries = eRes.data || [];

  renderTimesheet();
  updateComputedUI();
  setSaveState("Loaded", "Ready.");
}

// -------------------------
// Render timesheet
// -------------------------
function renderTimesheet() {
  const days = buildPeriodDays(pro.period_start);

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

  for (const d of days) {
    html += `
      <tr>
        <td><b>${dayName(d)}</b><br><span class="mono">${d}</span></td>
        <td>
          <div id="dayRows_${d}"></div>
          <button class="btn" type="button" data-addrow="${d}">+ Add row</button>
        </td>
        <td class="right"><div class="mono" id="dayTotal_${d}">0.00</div></td>
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
      <span class="badge yellow"><span class="dot"></span>Project/week > 40 highlights rows</span>
    </div>
  `;

  $("timesheetArea").innerHTML = html;

  const activeProjects = pro.projects.filter(p => p.status === "active");
  for (const d of days) renderDayRows(d, activeProjects);

  document.querySelectorAll("button[data-addrow]").forEach(btn => {
    btn.addEventListener("click", () => addNewRow(btn.getAttribute("data-addrow")));
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
        <button class="btn dangerBtn" type="button" id="del_${e.id}">Delete</button>
      </div>
    </div>
  `;
}

function attachRowHandlers(entryId) {
  const e = pro.entries.find(x => x.id === entryId);
  if (!e) return;

  const typeSel = $("type_" + entryId);
  const hoursInp = $("hours_" + entryId);
  const noteInp = $("note_" + entryId);
  const delBtn = $("del_" + entryId);

  typeSel.addEventListener("change", async () => {
    e.activity_type = typeSel.value;
    if (e.activity_type === "project") e.activity_code = null;
    else e.project_id = null;

    await updateEntryInDb(e);

    const activeProjects = pro.projects.filter(p => p.status === "active");
    renderDayRows(e.entry_date, activeProjects);
    updateComputedUI();
  });

  const projSel = $("project_" + entryId);
  const actSel = $("activity_" + entryId);

  if (projSel) {
    projSel.addEventListener("change", () => {
      e.project_id = projSel.value || null;
      scheduleEntryAutosave(e);
      updateComputedUI();
    });
  }

  if (actSel) {
    actSel.addEventListener("change", () => {
      e.activity_code = actSel.value || null;
      scheduleEntryAutosave(e);
      updateComputedUI();
    });
  }

  hoursInp.addEventListener("input", () => {
    e.hours = safeNum(hoursInp.value);
    scheduleEntryAutosave(e);
    updateComputedUI();
  });

  noteInp.addEventListener("input", () => {
    e.note = noteInp.value || "";
    scheduleEntryAutosave(e);
  });

  delBtn.addEventListener("click", async () => {
    showBanner("proErrors", "");
    const del = await db.from("time_entries").delete().eq("id", entryId);
    if (del.error) { showBanner("proErrors", del.error.message); return; }

    pro.entries = pro.entries.filter(x => x.id !== entryId);
    renderTimesheet();
    updateComputedUI();
    setSaveState("Saved", "All changes saved.");
  });
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

  const activeProjects = pro.projects.filter(p => p.status === "active");
  renderDayRows(dayISO, activeProjects);
  updateComputedUI();

  setSaveState("Saved", "All changes saved.");
}

function updateComputedUI() {
  showBanner("proErrors", "");
  showBanner("proWarnings", "");

  const days = buildPeriodDays(pro.period_start);

  const dayTotal = {};
  for (const d of days) dayTotal[d] = 0;

  for (const e of pro.entries) {
    dayTotal[e.entry_date] = (dayTotal[e.entry_date] || 0) + safeNum(e.hours);
  }

  let wk1 = 0, wk2 = 0;
  for (const d of days) {
    const total = Math.round((dayTotal[d] || 0) * 100) / 100;
    const el = $("dayTotal_" + d);
    if (el) el.textContent = total.toFixed(2);

    const w = weekIndexWithinPeriod(d, pro.period_start);
    if (w === 1) wk1 += total; else wk2 += total;
  }

  if ($("wk1Total")) $("wk1Total").textContent = wk1.toFixed(2);
  if ($("wk2Total")) $("wk2Total").textContent = wk2.toFixed(2);

  // project/week > 40 highlight
  const perProjWeek = {};
  for (const e of pro.entries) {
    if (e.activity_type !== "project" || !e.project_id) continue;
    const w = weekIndexWithinPeriod(e.entry_date, pro.period_start);
    const key = w + "|" + e.project_id;
    perProjWeek[key] = (perProjWeek[key] || 0) + safeNum(e.hours);
  }

  document.querySelectorAll(".highlight").forEach(el => el.classList.remove("highlight"));
  const over = Object.keys(perProjWeek).some(k => perProjWeek[k] > 40.00001);
  if (over) {
    showBanner("proWarnings", "Warning: One or more projects exceed 40 hours in a week (highlighted).");
    for (const e of pro.entries) {
      if (e.activity_type !== "project" || !e.project_id) continue;
      const w = weekIndexWithinPeriod(e.entry_date, pro.period_start);
      const key = w + "|" + e.project_id;
      if ((perProjWeek[key] || 0) > 40.00001) {
        const rowEl = $("row_" + e.id);
        if (rowEl) rowEl.classList.add("highlight");
      }
    }
  }
}

function validateBeforeSaveOrSubmit(isSubmit) {
  const errs = [];
  const days = buildPeriodDays(pro.period_start);

  // Per-row validation
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
    // max 24/day
    const dayTotal = {};
    for (const d of days) dayTotal[d] = 0;
    for (const e of pro.entries) {
      dayTotal[e.entry_date] = (dayTotal[e.entry_date] || 0) + safeNum(e.hours);
    }
    for (const d of days) {
      if ((dayTotal[d] || 0) > 24.00001) errs.push(`Day ${d} exceeds 24 hours.`);
    }

    // 40 hrs min per week
    let wk1 = 0, wk2 = 0;
    for (const d of days) {
      const total = Math.round((dayTotal[d] || 0) * 100) / 100;
      const w = weekIndexWithinPeriod(d, pro.period_start);
      if (w === 1) wk1 += total; else wk2 += total;
    }
    if (wk1 + 1e-9 < 40) errs.push(`Week 1 must be at least 40 hours (currently ${wk1.toFixed(2)}).`);
    if (wk2 + 1e-9 < 40) errs.push(`Week 2 must be at least 40 hours (currently ${wk2.toFixed(2)}).`);

    // approver required
    if (!pro.approver_email || !isValidEmail(pro.approver_email)) {
      errs.push("No approver is assigned. Ask admin to assign one before submitting.");
    }
  }

  return errs;
}

async function saveTimesheetDraft() {
  showBanner("proErrors", "");
  if (!pro.timesheet) return;

  await saveAllEntriesNow();

  const up = await db.from("timesheets")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", pro.timesheet.id)
    .select("*").single();

  if (up.error) throw new Error(up.error.message);

  pro.timesheet = up.data;
  if ($("tsStatus")) $("tsStatus").textContent = pro.timesheet.status;

  toast("Saved", "Timesheet saved.");
  setSaveState("Saved", "All changes saved.");
}

async function submitTimesheet() {
  showBanner("proErrors", "");
  showBanner("proWarnings", "");
  if (!pro.timesheet) return;

  const errs = validateBeforeSaveOrSubmit(true);
  if (errs.length) { showBanner("proErrors", errs[0]); return; }

  await saveAllEntriesNow();

  const up = await db.from("timesheets")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", pro.timesheet.id)
    .select("*").single();

  if (up.error) throw new Error(up.error.message);

  pro.timesheet = up.data;
  if ($("tsStatus")) $("tsStatus").textContent = pro.timesheet.status;

  toast("Submitted", "Submitted for approval.");
  setSaveState("Submitted", "Submitted for approval.");
}

// ============================================================
// APPROVER (status-only changes)
// ============================================================
function bindApprover() {
  onClick("btnLoadAppr", loadApproverInbox);
}

async function loadApproverInbox() {
  const email = ($("apprEmail")?.value || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    $("apprList").innerHTML = `<div class="banner error" style="display:block;">Enter a valid approver email.</div>`;
    return;
  }

  const pros = await db.from("professionals").select("*").eq("approver_email", email);
  if (pros.error) throw new Error(pros.error.message);

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

  if (ts.error) throw new Error(ts.error.message);

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
          <button class="btn primary" type="button" data-approve="${t.id}">Approve</button>
          <button class="btn" type="button" data-return="${t.id}">Return</button>
        </div>
      </div>
    `;
  }

  $("apprList").innerHTML = html;

  document.querySelectorAll("button[data-approve]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-approve");
      const up = await db.from("timesheets").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", id);
      if (up.error) return toast("Error", up.error.message, "err");
      toast("Approved", "Timesheet approved.");
      await loadApproverInbox();
    });
  });

  document.querySelectorAll("button[data-return]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-return");
      const up = await db.from("timesheets").update({ status: "return", updated_at: new Date().toISOString() }).eq("id", id);
      if (up.error) return toast("Error", up.error.message, "err");
      toast("Returned", "Timesheet returned.");
      await loadApproverInbox();
    });
  });
}

// ============================================================
// ADMIN
// ============================================================
function bindAdmin() {
  onClick("btnAssignApprover", assignApprover);
  onClick("btnAddProject", addProject);
  onClick("btnAddStatus", addStatus);
  onClick("btnAddActivity", addActivity);
}

async function assignApprover() {
  const p = ($("adminProEmail")?.value || "").trim().toLowerCase();
  const a = ($("adminApproverEmail")?.value || "").trim().toLowerCase();
  if ($("adminAssignMsg")) $("adminAssignMsg").textContent = "";

  if (!isValidEmail(p)) { if ($("adminAssignMsg")) $("adminAssignMsg").textContent = "Invalid professional email."; return; }
  if (!isValidEmail(a)) { if ($("adminAssignMsg")) $("adminAssignMsg").textContent = "Invalid approver email."; return; }

  let prof = await db.from("professionals").select("*").eq("email", p).maybeSingle();
  if (prof.error) throw new Error(prof.error.message);

  if (!prof.data) {
    const ins = await db.from("professionals").insert({ email: p, approver_email: a }).select("*").single();
    if (ins.error) throw new Error(ins.error.message);
  } else {
    const up = await db.from("professionals").update({ approver_email: a, updated_at: new Date().toISOString() }).eq("email", p);
    if (up.error) throw new Error(up.error.message);
  }

  if ($("adminAssignMsg")) $("adminAssignMsg").textContent = `Saved: ${p} → ${a}`;
  toast("Saved", "Approver assignment updated.");
}

async function addProject() {
  const name = ($("projName")?.value || "").trim();
  const status = $("projStatus")?.value || "active";
  if (!name) return toast("Missing", "Project name is required.", "err");

  const ins = await db.from("projects").insert({ name, status }).select("*").single();
  if (ins.error) return toast("Error", ins.error.message, "err");

  $("projName").value = "";
  await loadReferenceData();
  await refreshAdminTables();
  toast("Added", "Project created.");
}

async function addStatus() {
  const code = ($("statusCode")?.value || "").trim();
  const name = ($("statusName")?.value || "").trim();
  if (!code || !name) return toast("Missing", "Enter status code and name.", "err");

  const ins = await db.from("timesheet_statuses").insert({ code, name }).select("*").single();
  if (ins.error) return toast("Error", ins.error.message, "err");

  $("statusCode").value = "";
  $("statusName").value = "";
  await loadReferenceData();
  await refreshAdminTables();
  toast("Added", "Status created.");
}

async function addActivity() {
  const code = ($("activityCode")?.value || "").trim();
  const name = ($("activityName")?.value || "").trim();
  if (!code || !name) return toast("Missing", "Enter activity code and name.", "err");

  const ins = await db.from("activities").insert({ code, name }).select("*").single();
  if (ins.error) return toast("Error", ins.error.message, "err");

  $("activityCode").value = "";
  $("activityName").value = "";
  await loadReferenceData();
  await refreshAdminTables();
  toast("Added", "Activity created.");
}

async function refreshAdminTables() {
  // Projects
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
        <td><button class="btn dangerBtn" type="button" data-pdel="${p.id}">Delete</button></td>
      </tr>
    `;
  }
  pHtml += `</tbody></table></div>`;
  if ($("projectsTable")) $("projectsTable").innerHTML = pHtml;

  document.querySelectorAll("select[data-pstatus]").forEach(sel => {
    sel.addEventListener("change", async () => {
      const id = sel.getAttribute("data-pstatus");
      const up = await db.from("projects").update({ status: sel.value }).eq("id", id);
      if (up.error) return toast("Error", up.error.message, "err");
      await loadReferenceData();
      toast("Updated", "Project status updated.");
    });
  });

  document.querySelectorAll("button[data-pdel]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-pdel");
      const del = await db.from("projects").delete().eq("id", id);
      if (del.error) return toast("Error", del.error.message, "err");
      await loadReferenceData();
      await refreshAdminTables();
      toast("Deleted", "Project deleted.");
    });
  });

  // Statuses
  const sRes = await db.from("timesheet_statuses").select("*").order("code",{ascending:true});
  const sts = sRes.data || [];
  let sHtml = `<div class="tableWrap"><table style="min-width:520px;"><thead><tr><th>Code</th><th>Name</th><th>Action</th></tr></thead><tbody>`;
  for (const s of sts) {
    sHtml += `
      <tr>
        <td class="mono">${escapeHtml(s.code)}</td>
        <td><input data-sname="${escapeHtml(s.code)}" value="${escapeHtml(s.name)}" /></td>
        <td>
          <button class="btn" type="button" data-ssave="${escapeHtml(s.code)}">Save</button>
          <button class="btn dangerBtn" type="button" data-sdel="${escapeHtml(s.code)}">Delete</button>
        </td>
      </tr>
    `;
  }
  sHtml += `</tbody></table></div>`;
  if ($("statusesTable")) $("statusesTable").innerHTML = sHtml;

  document.querySelectorAll("button[data-ssave]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const code = btn.getAttribute("data-ssave");
      const inp = document.querySelector(`input[data-sname="${CSS.escape(code)}"]`);
      const name = (inp?.value || "").trim();
      if (!name) return toast("Missing", "Status name cannot be empty.", "err");

      const up = await db.from("timesheet_statuses").update({ name }).eq("code", code);
      if (up.error) return toast("Error", up.error.message, "err");

      await loadReferenceData();
      toast("Saved", `Status ${code} updated.`);
    });
  });

  document.querySelectorAll("button[data-sdel]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const code = btn.getAttribute("data-sdel");
      const del = await db.from("timesheet_statuses").delete().eq("code", code);
      if (del.error) return toast("Error", del.error.message, "err");
      await loadReferenceData();
      await refreshAdminTables();
      toast("Deleted", `Status ${code} deleted.`);
    });
  });

  // Activities
  const aRes = await db.from("activities").select("*").order("code",{ascending:true});
  const acts = aRes.data || [];
  let aHtml = `<div class="tableWrap"><table style="min-width:520px;"><thead><tr><th>Code</th><th>Name</th><th>Action</th></tr></thead><tbody>`;
  for (const a of acts) {
    aHtml += `
      <tr>
        <td class="mono">${escapeHtml(a.code)}</td>
        <td><input data-aname="${escapeHtml(a.code)}" value="${escapeHtml(a.name)}" /></td>
        <td>
          <button class="btn" type="button" data-asave="${escapeHtml(a.code)}">Save</button>
          <button class="btn dangerBtn" type="button" data-adel="${escapeHtml(a.code)}">Delete</button>
        </td>
      </tr>
    `;
  }
  aHtml += `</tbody></table></div>`;
  if ($("activitiesTable")) $("activitiesTable").innerHTML = aHtml;

  document.querySelectorAll("button[data-asave]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const code = btn.getAttribute("data-asave");
      const inp = document.querySelector(`input[data-aname="${CSS.escape(code)}"]`);
      const name = (inp?.value || "").trim();
      if (!name) return toast("Missing", "Activity name cannot be empty.", "err");

      const up = await db.from("activities").update({ name }).eq("code", code);
      if (up.error) return toast("Error", up.error.message, "err");

      await loadReferenceData();
      toast("Saved", `Activity ${code} updated.`);
    });
  });

  document.querySelectorAll("button[data-adel]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const code = btn.getAttribute("data-adel");
      const del = await db.from("activities").delete().eq("code", code);
      if (del.error) return toast("Error", del.error.message, "err");
      await loadReferenceData();
      await refreshAdminTables();
      toast("Deleted", `Activity ${code} deleted.`);
    });
  });
}

// ============================================================
// Boot
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!window.supabase) {
      toast("Error", "Supabase library failed to load. Check script order in index.html.", "err");
      return;
    }

    if (SUPABASE_URL.includes("PASTE_") || SUPABASE_ANON_KEY.includes("PASTE_")) {
      toast("Setup needed", "Paste your Supabase URL and anon key into app.js.", "err");
      return;
    }

    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Default date
    if ($("proDate")) $("proDate").value = toISODate(new Date());

    // Bind UI
    bindTabs();
    bindProfessional();
    bindApprover();
    bindAdmin();

    setSaveState("Ready", "Enter your email to begin.");

    // Preload admin tables so they show something immediately
    await loadReferenceData();
    await refreshAdminTables();
  } catch (err) {
    console.error(err);
    toast("Startup error", err?.message || String(err), "err");
  }
});
