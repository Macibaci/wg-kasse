import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const uid = (n = 10) => {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, b => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = n => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

// ---------- Haushalt-Code (Zugang zu den gemeinsamen Daten) ----------
function codeFrom(text) {
  const m = String(text).match(/[?&#]h=([a-z0-9]{20,})/i);
  if (m) return m[1];
  const t = String(text).trim();
  return /^[a-z0-9]{20,}$/i.test(t) ? t : null;
}
let H = codeFrom(location.search) || store.get("kasse-haushalt");
if (H) {
  store.set("kasse-haushalt", H);
  if (!location.search.includes(H)) history.replaceState(null, "", location.pathname + "?h=" + H);
}

const app = initializeApp(window.FIREBASE_CONFIG);
const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });


function showSetup() {
  $("setup").hidden = false;
  $("joinForm").addEventListener("submit", e => {
    e.preventDefault();
    const c = codeFrom($("joinCode").value);
    if (!c) { $("setupErr").textContent = "Der Code sieht nicht richtig aus. Füge den ganzen Link ein."; $("setupErr").hidden = false; return; }
    location.href = location.pathname + "?h=" + c;
  });
  $("createBtn").addEventListener("click", async () => {
    const c = uid(24);
    $("createBtn").disabled = true;
    try {
      const b = writeBatch(fs);
      b.set(doc(fs, "haushalte", c), { erstellt: serverTimestamp() });
      b.set(doc(fs, "haushalte", c, "kassen", "alltag"), { name: "Alltag", erstellt: Date.now() });
      await b.commit();
      location.href = location.pathname + "?h=" + c;
    } catch (err) {
      $("createBtn").disabled = false;
      $("setupErr").textContent = "Konnte die Kasse nicht anlegen. Prüfe die Internetverbindung. (" + err.code + ")";
      $("setupErr").hidden = false;
    }
  });
}

// ---------- App ----------
let kassen = [], items = [], current = store.get("kasse-current"), filter = "Alle";
let loadedK = false, loadedI = false;
const inK = i => i.kasse === current;
const kCol = () => collection(fs, "haushalte", H, "kassen");
const iCol = () => collection(fs, "haushalte", H, "eintraege");

function start() {
  $("app").hidden = false; $("addBtn").hidden = false;
  $("shareLink").value = location.origin + location.pathname + "?h=" + H;
  onSnapshot(kCol(), snap => {
    kassen = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.erstellt || 0) - (b.erstellt || 0));
    loadedK = true; render(); syncInfo(snap);
  }, showError);
  onSnapshot(iCol(), snap => {
    items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    loadedI = true; render(); syncInfo(snap);
  }, showError);
}
function syncInfo(snap) {
  $("syncState").textContent = snap.metadata.fromCache ? "Offline: Änderungen werden später übertragen." : "Synchronisiert.";
}
function showError(err) {
  $("list").innerHTML = `<div class="empty">Keine Verbindung zur Datenbank (${esc(err.code)}). Ist der Link vollständig?</div>`;
}

// Positiv = Bubi schuldet Marcel
function balance(cur) {
  let b = 0;
  for (const it of items) {
    if (it.cur !== cur || !inK(it)) continue;
    if (it.kind === "payment") b += it.payer === "Bubi" ? -it.amount : it.amount;
    else {
      const shareM = it.amount * it.pctM / 100, shareB = it.amount - shareM;
      b += it.payer === "Marcel" ? shareB : -shareM;
    }
  }
  return Math.round(b * 100) / 100;
}

function render() {
  if (!loadedK) return;
  if (!kassen.some(k => k.id === current)) current = kassen[0]?.id || null;
  const kx = $("kassen"); kx.innerHTML = "";
  for (const k of kassen) {
    const b = document.createElement("button"); b.className = "chip"; b.setAttribute("aria-pressed", k.id === current);
    b.innerHTML = `${esc(k.name)}<small>${items.filter(i => i.kasse === k.id).length}</small>`;
    b.onclick = () => { current = k.id; filter = "Alle"; store.set("kasse-current", current); closeK(); render(); };
    kx.appendChild(b);
  }
  const nb = document.createElement("button"); nb.className = "chip new"; nb.textContent = "+ Neue Kasse"; nb.onclick = () => openK(null); kx.appendChild(nb);

  const K = kassen.find(k => k.id === current);
  $("editKasse").hidden = !K; $("addBtn").hidden = !K;
  if (!K) {
    $("kName").textContent = "Keine Kasse";
    $("balances").innerHTML = ""; $("filters").innerHTML = "";
    $("list").innerHTML = '<div class="empty">Lege mit „+ Neue Kasse“ die erste Kasse an.</div>';
    return;
  }
  $("kName").textContent = K.name;

  const curs = ["CHF", "EUR"].filter(c => items.some(i => inK(i) && i.cur === c));
  if (!curs.length) curs.push("CHF");
  const bx = $("balances"); bx.innerHTML = "";
  for (const c of curs) {
    const b = balance(c), el = document.createElement("div");
    el.className = "bal" + (b === 0 ? " even" : "");
    const debtor = b > 0 ? "Bubi" : "Marcel", creditor = b > 0 ? "Marcel" : "Bubi";
    el.innerHTML = `<span class="cur">${c}</span>` +
      (b === 0 ? `<span class="amt num">Quitt</span><span class="who">Niemand schuldet etwas.</span>`
        : `<span class="who"><b>${debtor}</b> schuldet <b>${creditor}</b></span><span class="amt num">${fmt(Math.abs(b))} ${c}</span>`);
    if (b !== 0) {
      const s = document.createElement("button"); s.className = "settle"; s.textContent = "Ausgleichen";
      s.onclick = () => openForm(null, { kind: "payment", payer: debtor, amount: Math.abs(b), cur: c });
      el.appendChild(s);
    }
    bx.appendChild(el);
  }

  const fx = $("filters"); fx.innerHTML = ""; fx.hidden = curs.length < 2;
  for (const f of ["Alle", ...curs]) {
    const b = document.createElement("button"); b.className = "chip"; b.textContent = f; b.setAttribute("aria-pressed", f === filter);
    b.onclick = () => { filter = f; render(); }; fx.appendChild(b);
  }

  const lx = $("list"); lx.innerHTML = "";
  if (!loadedI) { lx.innerHTML = '<div class="empty">Lade Daten …</div>'; return; }
  const rows = items.filter(i => inK(i) && (filter === "Alle" || i.cur === filter))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.t || 0) - (a.t || 0));
  if (!rows.length) { lx.innerHTML = `<div class="empty">Noch keine Einträge in „${esc(K.name)}“. Tippe auf „+ Ausgabe“.</div>`; return; }
  for (const it of rows) {
    const r = document.createElement("button"); r.className = "row" + (it.kind === "payment" ? " pay" : "");
    const dt = new Date(it.date + "T00:00").toLocaleDateString("de-CH", { day: "numeric", month: "short" });
    let sub;
    if (it.kind === "payment") sub = `${it.payer} an ${it.payer === "Marcel" ? "Bubi" : "Marcel"} · ${dt}`;
    else {
      const split = it.pctM === 50 ? "50/50" : it.pctM === 100 ? "nur Marcel" : it.pctM === 0 ? "nur Bubi" : `${it.pctM}/${100 - it.pctM}`;
      sub = `${it.payer} bezahlt · ${split} · ${dt}`;
    }
    r.innerHTML = `<span class="ic">${it.kind === "payment" ? "↔" : esc((it.cat || "").slice(0, 3))}</span>
      <span class="t"><b>${esc(it.desc || "Rückzahlung")}</b><span>${sub}</span></span>
      <span class="r"><b class="num">${fmt(it.amount)}</b><span>${it.cur}</span></span>`;
    r.onclick = () => openForm(it);
    lx.appendChild(r);
  }
}

// ---------- Formular Ausgabe / Rückzahlung ----------
let st = {}, editing = null, delArmed = false;
function seg(id, val) { for (const b of $(id).children) b.setAttribute("aria-pressed", b.dataset.v === String(val)); }
for (const id of ["kindSeg", "curSeg", "payerSeg", "splitSeg"]) {
  $(id).addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    st[{ kindSeg: "kind", curSeg: "cur", payerSeg: "payer", splitSeg: "split" }[id]] = b.dataset.v; sync();
  });
}
function sync() {
  seg("kindSeg", st.kind); seg("curSeg", st.cur); seg("payerSeg", st.payer); seg("splitSeg", st.split);
  const pay = st.kind === "payment";
  $("descField").hidden = pay; $("splitField").hidden = pay; $("catField").hidden = pay;
  $("payerLbl").textContent = pay ? "Wer zahlt zurück?" : "Bezahlt von";
  $("payHint").hidden = !pay; $("payHint").textContent = pay ? `${st.payer} gibt ${st.payer === "Marcel" ? "Bubi" : "Marcel"} Geld zurück.` : "";
  $("customSplit").hidden = st.split !== "custom";
  $("formTitle").textContent = editing ? "Bearbeiten" : pay ? "Neue Rückzahlung" : "Neue Ausgabe";
}
$("pctM").addEventListener("input", () => { const v = parseFloat($("pctM").value); if (!isNaN(v)) $("pctB").value = Math.max(0, 100 - v); });
$("pctB").addEventListener("input", () => { const v = parseFloat($("pctB").value); if (!isNaN(v)) $("pctM").value = Math.max(0, 100 - v); });

function openForm(it, preset) {
  editing = it || null; delArmed = false; $("del").textContent = "Löschen";
  const src = it || Object.assign({ kind: "expense", cur: "CHF", payer: "Marcel", pctM: 50, cat: "Einkauf", date: today(), desc: "", amount: "" }, preset || {});
  st = { kind: src.kind, cur: src.cur, payer: src.payer, split: [50, 100, 0].includes(src.pctM) ? String(src.pctM) : "custom" };
  if (src.kind === "payment") st.split = "50";
  $("desc").value = src.desc && src.kind !== "payment" ? src.desc : "";
  $("amount").value = src.amount === "" ? "" : Number(src.amount).toFixed(2);
  $("pctM").value = src.pctM ?? 50; $("pctB").value = 100 - (src.pctM ?? 50);
  $("cat").value = src.cat || "Einkauf"; $("date").value = src.date || today();
  $("del").hidden = !it; $("err").hidden = true;
  sync(); $("scrim").hidden = false;
}
function closeForm() { $("scrim").hidden = true; editing = null; }
$("addBtn").onclick = () => openForm(null);
$("cancel").onclick = closeForm;
$("scrim").addEventListener("click", e => { if (e.target === $("scrim")) closeForm(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("scrim").hidden) closeForm(); });
$("del").onclick = () => {
  if (!delArmed) { delArmed = true; $("del").textContent = "Wirklich löschen?"; return; }
  deleteDoc(doc(iCol(), editing.id)); closeForm();
};
$("form").addEventListener("submit", e => {
  e.preventDefault();
  const amount = parseFloat($("amount").value.replace(/'/g, "").replace(",", "."));
  const fail = m => { $("err").textContent = m; $("err").hidden = false; };
  if (!(amount > 0)) return fail("Bitte einen Betrag grösser als 0 eingeben.");
  let pctM = 50;
  if (st.kind === "expense") {
    if (!$("desc").value.trim()) return fail("Bitte eine kurze Beschreibung eingeben, z. B. „Migros“.");
    pctM = st.split === "custom" ? parseFloat($("pctM").value) : Number(st.split);
    if (isNaN(pctM) || pctM < 0 || pctM > 100) return fail("Der Anteil muss zwischen 0 und 100 % liegen.");
  }
  const id = editing ? editing.id : uid(16);
  const rec = {
    kasse: editing ? editing.kasse : current, kind: st.kind,
    desc: st.kind === "payment" ? "Rückzahlung" : $("desc").value.trim(),
    amount: Math.round(amount * 100) / 100, cur: st.cur, payer: st.payer, pctM,
    cat: st.kind === "payment" ? "" : $("cat").value, date: $("date").value || today(),
    t: editing?.t || Date.now()
  };
  setDoc(doc(iCol(), id), rec); // offline-fähig: wird später übertragen
  closeForm();
});

// ---------- Kassen anlegen / umbenennen / löschen ----------
let kEditing = null, kDelArmed = false;
function openK(k) {
  kEditing = k; kDelArmed = false; $("kDel").textContent = "Kasse löschen";
  $("kLbl").textContent = k ? "Name der Kasse" : "Name der neuen Kasse";
  $("kSave").textContent = k ? "Speichern" : "Erstellen";
  $("kInput").value = k ? k.name : ""; $("kDel").hidden = !k || kassen.length < 2; $("kErr").hidden = true;
  $("kPanel").hidden = false; $("kInput").focus();
}
function closeK() { $("kPanel").hidden = true; kEditing = null; }
$("editKasse").onclick = () => openK(kassen.find(k => k.id === current));
$("kCancel").onclick = closeK;
$("kPanel").addEventListener("submit", e => {
  e.preventDefault(); const name = $("kInput").value.trim();
  if (!name) { $("kErr").textContent = "Bitte einen Namen eingeben."; $("kErr").hidden = false; return; }
  if (kEditing) setDoc(doc(kCol(), kEditing.id), { name }, { merge: true });
  else { const id = uid(12); current = id; store.set("kasse-current", id); filter = "Alle"; setDoc(doc(kCol(), id), { name, erstellt: Date.now() }); }
  closeK();
});
$("kDel").onclick = () => {
  const n = items.filter(i => i.kasse === kEditing.id).length;
  if (!kDelArmed) { kDelArmed = true; $("kDel").textContent = n ? `Wirklich löschen? (${n} Einträge)` : "Wirklich löschen?"; return; }
  const id = kEditing.id, b = writeBatch(fs);
  for (const i of items.filter(i => i.kasse === id)) b.delete(doc(iCol(), i.id));
  b.delete(doc(kCol(), id)); b.commit();
  closeK();
};

$("copyLink").onclick = async () => {
  try { await navigator.clipboard.writeText($("shareLink").value); $("copyLink").textContent = "Kopiert"; }
  catch (e) { $("shareLink").select(); }
};

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// Start erst am Ende, wenn alle Funktionen und Knöpfe bereit sind
if (!H) showSetup(); else start();
