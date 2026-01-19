:root{
  --bg: #0b0f19;
  --panel: #0f1629;
  --card: rgba(255,255,255,.06);
  --card2: rgba(255,255,255,.08);
  --text: rgba(255,255,255,.92);
  --muted: rgba(255,255,255,.66);
  --border: rgba(255,255,255,.10);
  --shadow: 0 16px 44px rgba(0,0,0,.45);
  --accent: #7aa2ff;
  --accent2: #9b7bff;
  --danger: #ff4d6d;
  --warn: #ffcc66;
  --ok: #44d19d;

  --radius: 14px;
  --radius2: 18px;
  --pad: 14px;
  --pad2: 18px;
  --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

*{ box-sizing:border-box; }
html,body{ height:100%; }
body{
  margin:0;
  color: var(--text);
  background:
    radial-gradient(800px 500px at 18% 10%, rgba(122,162,255,.18), transparent 55%),
    radial-gradient(700px 500px at 80% 20%, rgba(155,123,255,.16), transparent 55%),
    radial-gradient(900px 600px at 60% 90%, rgba(68,209,157,.10), transparent 60%),
    var(--bg);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
}

a{ color: var(--accent); }

.container{
  max-width: 1200px;
  margin: 18px auto 90px;
  padding: 0 16px;
}

.topbar{
  position: sticky;
  top: 0;
  z-index: 20;
  display:flex;
  justify-content: space-between;
  align-items:center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  background: rgba(11,15,25,.72);
  backdrop-filter: blur(14px);
}

.brand{ display:flex; gap: 12px; align-items:center; }
.logo{
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display:grid;
  place-items:center;
  font-weight: 800;
  letter-spacing:.5px;
  background: linear-gradient(135deg, rgba(122,162,255,.95), rgba(155,123,255,.85));
  box-shadow: 0 10px 24px rgba(0,0,0,.35);
}
.brandName{ font-weight: 700; }
.brandSub{ font-size: 12px; color: var(--muted); margin-top: 2px; }

.tabs{ display:flex; gap: 8px; }
.tab{
  border: 1px solid var(--border);
  background: rgba(255,255,255,.05);
  color: var(--text);
  padding: 10px 12px;
  border-radius: 12px;
  cursor:pointer;
  font-weight: 600;
}
.tab.active{
  background: rgba(122,162,255,.14);
  border-color: rgba(122,162,255,.35);
}

.panel{ display:none; margin-top: 16px; }
.panel.active{ display:block; }

.panelHeader{
  display:flex;
  justify-content: space-between;
  align-items:flex-end;
  gap: 12px;
  margin: 18px 0 12px;
}
.panelHeader h2{ margin:0; font-size: 22px; }
.hint{ color: var(--muted); font-size: 13px; }

.card{
  background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.04));
  border: 1px solid var(--border);
  border-radius: var(--radius2);
  padding: var(--pad2);
  box-shadow: var(--shadow);
}
.cardTitle{
  font-weight: 700;
  margin-bottom: 12px;
  letter-spacing: .2px;
  color: rgba(255,255,255,.88);
}

.grid2{
  display:grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (max-width: 900px){
  .grid2{ grid-template-columns: 1fr; }
}

.field{ display:block; margin-bottom: 10px; }
.field span{ display:block; color: var(--muted); font-size: 12px; margin-bottom: 6px; }

input, select, textarea{
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,.05);
  color: var(--text);
  padding: 10px 12px;
  outline:none;
}
input:focus, select:focus, textarea:focus{
  border-color: rgba(122,162,255,.55);
  box-shadow: 0 0 0 3px rgba(122,162,255,.18);
}

.row{ display:flex; gap: 10px; align-items:center; flex-wrap: wrap; }
.row.end{ justify-content: flex-end; }
.meta{ color: var(--muted); font-size: 12px; }
.small{ font-size: 12px; }
.muted{ color: var(--muted); }
.mono{ font-family: var(--mono); }

.btn{
  border: 1px solid var(--border);
  background: rgba(255,255,255,.06);
  color: var(--text);
  padding: 10px 12px;
  border-radius: 12px;
  cursor:pointer;
  font-weight: 700;
}
.btn:hover{ background: rgba(255,255,255,.10); }
.btn.primary{
  border-color: rgba(122,162,255,.45);
  background: linear-gradient(135deg, rgba(122,162,255,.40), rgba(155,123,255,.32));
}
.btn.primary:hover{ filter: brightness(1.08); }

.banner{
  margin: 12px 0;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--border);
}
.banner.error{
  border-color: rgba(255,77,109,.40);
  background: rgba(255,77,109,.12);
  color: rgba(255,223,230,.95);
}
.banner.warn{
  border-color: rgba(255,204,102,.40);
  background: rgba(255,204,102,.12);
  color: rgba(255,241,205,.95);
}

.statusPill{
  display:flex;
  align-items:center;
  gap: 8px;
  margin: 10px 0 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255,255,255,.05);
}
.statusPill .dot{
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 4px rgba(122,162,255,.16);
}

.tableWrap{
  overflow:auto;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,.03);
}
table{
  width: 100%;
  border-collapse: collapse;
  min-width: 860px;
}
th, td{
  padding: 10px 10px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  vertical-align: top;
}
th{
  text-align:left;
  color: rgba(255,255,255,.78);
  font-size: 12px;
  letter-spacing: .25px;
  text-transform: uppercase;
}
td.right{ text-align:right; }

.entryRow{
  display:grid;
  grid-template-columns: 130px 1.4fr 130px 1.6fr 90px;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 14px;
  margin: 8px 0;
  background: rgba(255,255,255,.04);
}
@media (max-width: 900px){
  .entryRow{ grid-template-columns: 1fr; }
}

.entryRow .label{ font-size: 11px; color: var(--muted); margin-bottom: 6px; }
.entryRow .cell{ min-width: 0; }
.entryRow .dangerBtn{
  border-color: rgba(255,77,109,.35);
  background: rgba(255,77,109,.10);
}

.highlight{
  border-color: rgba(255,204,102,.50) !important;
  background: rgba(255,204,102,.10) !important;
}

.stickyBar{
  position: sticky;
  bottom: 0;
  margin-top: 14px;
  padding: 12px 14px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(15,22,41,.75);
  backdrop-filter: blur(14px);
}
.saveState{ display:flex; align-items:center; gap: 10px; flex-wrap: wrap; }
.actions{ display:flex; gap: 10px; flex-wrap: wrap; }

.chip{
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,.05);
}

.toast{
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: min(520px, calc(100% - 32px));
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(15,22,41,.85);
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow);
  display:none;
}
.toast.show{ display:block; }
.toast.ok{ border-color: rgba(68,209,157,.45); }
.toast.err{ border-color: rgba(255,77,109,.45); }
.toast .tTitle{ font-weight: 800; margin-bottom: 6px; }
.toast .tBody{ color: var(--muted); font-size: 12px; }

.badge{
  display:inline-flex;
  align-items:center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,.05);
  font-size: 12px;
}
.badge .dot{
  width: 8px; height:8px; border-radius:999px;
  background: var(--muted);
}
.badge.green .dot{ background: var(--ok); box-shadow: 0 0 0 4px rgba(68,209,157,.12); }
.badge.yellow .dot{ background: var(--warn); box-shadow: 0 0 0 4px rgba(255,204,102,.12); }
.badge.blue .dot{ background: var(--accent); box-shadow: 0 0 0 4px rgba(122,162,255,.12); }
