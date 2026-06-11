/* =========================================================================
   Project Tracker — tracker.js  (v2.3)
   -------------------------------------------------------------------------
   Data model (Firestore):

     members/{email}
        { role: "admin"|"member", addedAt: ISO string, addedBy: email }

     meta/config
        { activeCp, checkpoints:[{id,label,collapsed}], colWidths:{} }

     projects/{projectId}
        { name, desc, hideProgress, order }

     projects/{projectId}/activities/{activityId}
        { name, next, due, note, order, cps:{ [cpId]:{wi,st} } }
   ========================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  initializeFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc,
  deleteDoc, onSnapshot, writeBatch, deleteField,
  persistentLocalCache, persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

/* =========================================================================
   1. Firebase config  — your existing project values
   ========================================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyC736u8OFuc-yS2f1j9vFb1xAKE9pMhkIQ",
  authDomain: "project-tracker-3deab.firebaseapp.com",
  projectId: "project-tracker-3deab",
  storageBucket: "project-tracker-3deab.firebasestorage.app",
  messagingSenderId: "366111364398",
  appId: "1:366111364398:web:8b5b47af6890a502ce96bf"
};

const app  = initializeApp(firebaseConfig);
const db   = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

/* =========================================================================
   2. Firestore refs
   ========================================================================= */
const cfgRef   = ()        => doc(db, "meta", "config");
const projRef  = (pid)     => doc(db, "projects", pid);
const projCol  = ()        => collection(db, "projects");
const actRef   = (pid,aid) => doc(db, "projects", pid, "activities", aid);
const actCol   = (pid)     => collection(db, "projects", pid, "activities");
const memberRef = (email)  => doc(db, "members", email);
const membersCol = ()      => collection(db, "members");

/* =========================================================================
   3. Auth state
   ========================================================================= */
let currentUser   = null;
let currentMember = null;  // { role: "admin"|"member", ... }

/* =========================================================================
   4. Icons
   ========================================================================= */
const ICONS = {
  plus:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  trash:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>',
  download:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  chevDown:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  grip:       '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  chevRight:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  dots:       '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  eyeOff:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22M9.88 9.88a3 3 0 0 0 4.24 4.24"/></svg>',
  eye:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  pencil:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  play:       '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>',
  check:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 6"/></svg>',
  layers:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
  cal:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  folder:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  bulletList: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>',
  numberList: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6h11M10 12h11M10 18h11"/><text x="1.5" y="8" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">1</text><text x="1.5" y="14" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">2</text><text x="1.5" y="20" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">3</text></svg>',
  clearFmt:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5h11M11 5v9M4 20l16-16"/></svg>',
  users:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  logout:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>'
};

/* =========================================================================
   5. Status meta
   ========================================================================= */
const STATUS = ["backlog","prog","done","cancel","pause"];
const STMETA = {
  backlog:{ label:"Backlog",      cls:"back"   },
  prog:   { label:"On Progress",  cls:"prog"   },
  done:   { label:"Done",         cls:"done"   },
  cancel: { label:"Cancelled",    cls:"cancel" },
  pause:  { label:"Paused",       cls:"pause"  }
};
const SUMDOT = { backlog:"#c5c5cc", prog:"#f0a500", done:"#2bb24c", cancel:"#8a8a8e", pause:"#6e4f34" };

/* =========================================================================
   6. Column widths
   ========================================================================= */
const DEFW = { no:46, project:230, activities:182, wi:200, st:122, addcp:108, next:190, due:132, note:170 };
function colW(key){
  if (DATA && DATA.colWidths && DATA.colWidths[key] != null) return DATA.colWidths[key];
  if (key.indexOf("wi:") === 0) return DEFW.wi;
  if (key.indexOf("st:") === 0) return DEFW.st;
  if (key.indexOf("cc:") === 0) return 40;
  return DEFW[key] || 120;
}

/* =========================================================================
   7. Local state (Firestore mirror)
   ========================================================================= */
let CONFIG   = null;
const PROJECTS   = new Map();
const ACTIVITIES = new Map();
const ACT_UNSUBS = new Map();
let DATA = null;

let editKey      = null;
let pendingRender = false;
let booted       = false;
let dragState    = null;

function uid(){ return Math.random().toString(36).slice(2,9); }

function rebuild(){
  if (!CONFIG){ DATA = null; return; }
  const projects = [...PROJECTS.values()]
    .sort((a,b)=> (a.order ?? 0) - (b.order ?? 0))
    .map(p => {
      const m = ACTIVITIES.get(p.id);
      const activities = m ? [...m.values()].sort((a,b)=> (a.order ?? 0) - (b.order ?? 0)) : [];
      return Object.assign({}, p, { activities });
    });
  DATA = {
    activeCp:    CONFIG.activeCp,
    checkpoints: CONFIG.checkpoints || [],
    colWidths:   CONFIG.colWidths   || {},
    projects
  };
  if (DATA.checkpoints.length && !DATA.checkpoints.some(c => c.id === DATA.activeCp))
    DATA.activeCp = DATA.checkpoints[DATA.checkpoints.length-1].id;
}

function scheduleRender(){
  rebuild();
  if (editKey || dragState){ pendingRender = true; return; }
  render();
}

/* =========================================================================
   8. Connection badge
   ========================================================================= */
let conn = "connecting";
function setConn(state){
  if (conn === state) return;
  conn = state;
  const b = document.getElementById("connBadge");
  if (!b) return;
  b.className = "conn " + state;
  const lbl = { connecting:"Connecting…", live:"Live", cached:"Offline (cached)", offline:"Offline" }[state] || state;
  b.querySelector(".conn-lbl").textContent = lbl;
}
window.addEventListener("offline", ()=> setConn("offline"));
window.addEventListener("online",  ()=> { if (conn === "offline") setConn("connecting"); });

/* =========================================================================
   9. Auth screens
   ========================================================================= */
function showAuthScreen(id){
  ["authLoading","loginScreen","accessDenied"].forEach(n => {
    const el_ = document.getElementById(n);
    if (el_) el_.style.display = (n === id) ? "flex" : "none";
  });
  // topbar actions and wrap only visible in app state
  const actions = document.getElementById("topbarActions");
  const wrap    = document.getElementById("wrap");
  if (actions) actions.style.display = "none";
  if (wrap)    wrap.style.display    = "none";
}

function showAppState(){
  ["authLoading","loginScreen","accessDenied"].forEach(n => {
    const el_ = document.getElementById(n);
    if (el_) el_.style.display = "none";
  });
  const actions = document.getElementById("topbarActions");
  const wrap    = document.getElementById("wrap");
  if (actions) actions.style.display = "flex";
  if (wrap)    wrap.style.display    = "";
  mountAuthTopbar();
}

/* Auth elements injected into topbar */
function mountAuthTopbar(){
  let existing = document.getElementById("authTopbar");
  if (existing) existing.remove();

  const container = document.createElement("div");
  container.id = "authTopbar";
  container.style.cssText = "display:flex;align-items:center;gap:8px";

  // Members button — admins only
  if (currentMember && currentMember.role === "admin"){
    const btn = document.createElement("button");
    btn.className = "btn-members";
    btn.title = "Manage members";
    btn.innerHTML = '<span class="ic">' + ICONS.users + '</span>Members';
    btn.addEventListener("click", openMembersModal);
    container.appendChild(btn);
  }

  // Separator line
  const sep = document.createElement("div");
  sep.style.cssText = "width:1px;height:22px;background:var(--line);flex:0 0 auto";
  container.appendChild(sep);

  // User avatar + email
  const initial  = (currentUser.email || "?")[0].toUpperCase();
  const avatar   = document.createElement("div");
  avatar.className = "user-avatar";
  avatar.title   = currentUser.email;
  avatar.textContent = initial;
  container.appendChild(avatar);

  const emailSpan = document.createElement("span");
  emailSpan.className = "user-email";
  emailSpan.textContent = currentUser.email;
  container.appendChild(emailSpan);

  // Sign-out button
  const outBtn = document.createElement("button");
  outBtn.className = "btn-signout";
  outBtn.title = "Sign out";
  outBtn.innerHTML = ICONS.logout;
  outBtn.style.cssText = "width:30px;height:30px;padding:6px;display:flex;align-items:center;justify-content:center";
  outBtn.addEventListener("click", doSignOut);
  container.appendChild(outBtn);

  document.getElementById("topbar").appendChild(container);
}

async function doSignIn(){
  const btn = document.getElementById("googleSignInBtn");
  if (btn){ btn.disabled = true; btn.textContent = "Signing in…"; }
  try {
    await signInWithPopup(auth, provider);
  } catch(e){
    if (e.code === "auth/popup-blocked" || e.code === "auth/popup-closed-by-user"){
      // fallback to redirect
      await signInWithRedirect(auth, provider);
    } else {
      if (btn){ btn.disabled = false; btn.innerHTML = googleBtnContent(); }
      toast("Sign-in failed: " + (e.message || e.code), true);
    }
  }
}

async function doSignOut(){
  try { await signOut(auth); } catch(e){ toast("Sign-out error: "+e.message, true); }
}

function signOutCleanup(){
  // Unsubscribe all Firestore listeners
  for (const unsub of ACT_UNSUBS.values()) try { unsub(); } catch(_){}
  ACT_UNSUBS.clear();
  ACTIVITIES.clear();
  PROJECTS.clear();
  CONFIG   = null;
  DATA     = null;
  booted   = false;
  currentUser   = null;
  currentMember = null;
  editKey       = null;
  pendingRender = false;
  dragState     = null;
  conn          = "connecting";
  // Remove auth topbar
  const at = document.getElementById("authTopbar");
  if (at) at.remove();
}

function googleBtnContent(){
  return `<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Sign in with Google`;
}

/* =========================================================================
   10. Members modal (admin only)
   ========================================================================= */
function openMembersModal(){
  closeMenus();
  const ov   = el("div", { class:"overlay" });
  const card = el("div", { class:"mm-card" });

  // Header
  const hdr  = el("div", { class:"mm-header" });
  hdr.appendChild(el("h3", null, "Manage Members"));
  const closeBtn = el("button", { class:"mm-close", onclick:()=>ov.remove() }, "✕");
  hdr.appendChild(closeBtn);
  card.appendChild(hdr);

  // List body
  const body = el("div", { class:"mm-body" });
  const listLabel = el("div", { class:"mm-section-label" }, "Current members");
  body.appendChild(listLabel);
  const list = el("div", { id:"membersList" });
  body.appendChild(list);
  card.appendChild(body);

  // Add member section
  const addWrap  = el("div", { class:"mm-add-wrap" });
  const addLabel = el("p",   { class:"mm-add-label" }, "Add someone by their Google account email:");
  const addRow   = el("div", { class:"mm-add-row" });
  const emailIn  = el("input", { class:"mm-email-input", type:"email", placeholder:"teammate@company.com" });
  const roleIn   = el("select", { class:"mm-role-select" });
  const optM = el("option", { value:"member" }, "Member");
  const optA = el("option", { value:"admin"  }, "Admin");
  roleIn.appendChild(optM); roleIn.appendChild(optA);

  const addBtn = el("button", { class:"btn btn-primary",
    onclick: async ()=>{
      const email = emailIn.value.trim().toLowerCase();
      if (!email || !email.includes("@")){ toast("Enter a valid email."); return; }
      addBtn.disabled = true; addBtn.textContent = "Adding…";
      try {
        await setDoc(memberRef(email), {
          role:     roleIn.value,
          addedAt:  new Date().toISOString(),
          addedBy:  currentUser.email
        });
        toast("Added " + email);
        emailIn.value = "";
        loadMembersIntoList(list);
      } catch(e){ fail(e); }
      finally { addBtn.disabled = false; addBtn.textContent = "Add"; }
    }
  }, "Add");

  addRow.appendChild(emailIn); addRow.appendChild(roleIn); addRow.appendChild(addBtn);
  addWrap.appendChild(addLabel); addWrap.appendChild(addRow);
  card.appendChild(addWrap);

  ov.appendChild(card);
  ov.addEventListener("mousedown", e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);

  loadMembersIntoList(list);
}

async function loadMembersIntoList(list){
  list.innerHTML = '<div class="mm-loading">Loading members…</div>';
  try {
    const snap = await getDocs(membersCol());
    list.innerHTML = "";
    if (snap.empty){ list.innerHTML = '<div class="mm-empty">No members yet.</div>'; return; }
    snap.forEach(d => {
      const email  = d.id;
      const data   = d.data();
      const role   = data.role || "member";
      const isYou  = email === currentUser.email;

      const row = el("div", { class:"member-item" });

      const avatar = el("div", { class:"member-avatar" + (isYou ? " you" : "") },
        email[0].toUpperCase());

      const info = el("div", { class:"member-info" });
      info.appendChild(el("div", { class:"member-email" }, email));
      if (isYou) info.appendChild(el("div", { class:"member-you" }, "you"));
      const badge = el("span", { class:"role-badge role-"+role }, role);
      info.appendChild(badge);

      const acts = el("div", { class:"member-actions" });
      if (!isYou){
        const roleBtn = el("button", { class:"mm-action-btn",
          onclick: async ()=>{
            const newRole = role === "admin" ? "member" : "admin";
            roleBtn.disabled = true;
            try {
              await setDoc(memberRef(email), { role:newRole }, { merge:true });
              loadMembersIntoList(list);
            } catch(e){ fail(e); roleBtn.disabled = false; }
          }
        }, role === "admin" ? "Make Member" : "Make Admin");

        const delBtn = el("button", { class:"mm-action-btn danger",
          onclick: ()=>{
            showDialog({
              title:   "Remove Member?",
              message: `"${email}" will lose access. They can be re-added later.`,
              buttons: [
                { label:"Cancel",  style:"cancel" },
                { label:"Remove",  style:"danger", onClick: async ()=>{
                  try { await deleteDoc(memberRef(email)); loadMembersIntoList(list); }
                  catch(e){ fail(e); }
                }}
              ]
            });
          }
        }, "Remove");

        acts.appendChild(roleBtn); acts.appendChild(delBtn);
      }

      row.appendChild(avatar); row.appendChild(info); row.appendChild(acts);
      list.appendChild(row);
    });
  } catch(e){
    list.innerHTML = '<div class="mm-empty">Error loading members.</div>';
    console.error(e);
  }
}

/* =========================================================================
   11. Firestore listeners
   ========================================================================= */
async function ensureConfig(){
  const snap = await getDoc(cfgRef());
  if (!snap.exists()){
    const cpId = uid();
    await setDoc(cfgRef(), {
      activeCp: cpId,
      checkpoints: [{ id:cpId, label:"As of "+labelDate(new Date()), collapsed:false }],
      colWidths: {}
    });
  }
}

function subscribeConfig(){
  onSnapshot(cfgRef(), { includeMetadataChanges:true }, (snap)=>{
    if (snap.exists()) CONFIG = snap.data();
    markConn(snap);
    finishBoot();
    scheduleRender();
  }, fail);
}

function subscribeProjects(){
  onSnapshot(projCol(), { includeMetadataChanges:true }, (snap)=>{
    const seen = new Set();
    snap.forEach(d => { PROJECTS.set(d.id, Object.assign({ id:d.id }, d.data())); seen.add(d.id); });
    for (const id of [...PROJECTS.keys()]) if (!seen.has(id)) PROJECTS.delete(id);
    for (const id of seen) if (!ACT_UNSUBS.has(id)) subscribeActivities(id);
    for (const id of [...ACT_UNSUBS.keys()]) if (!seen.has(id)){
      ACT_UNSUBS.get(id)(); ACT_UNSUBS.delete(id); ACTIVITIES.delete(id);
    }
    markConn(snap);
    scheduleRender();
  }, fail);
}

function subscribeActivities(pid){
  const unsub = onSnapshot(actCol(pid), { includeMetadataChanges:true }, (snap)=>{
    let m = ACTIVITIES.get(pid);
    if (!m){ m = new Map(); ACTIVITIES.set(pid, m); }
    const seen = new Set();
    snap.forEach(d => { m.set(d.id, Object.assign({ id:d.id }, d.data())); seen.add(d.id); });
    for (const id of [...m.keys()]) if (!seen.has(id)) m.delete(id);
    markConn(snap);
    scheduleRender();
  }, fail);
  ACT_UNSUBS.set(pid, unsub);
}

function markConn(snap){
  if (!navigator.onLine){ setConn("offline"); return; }
  setConn(snap.metadata.fromCache ? "cached" : "live");
}
function finishBoot(){
  if (booted) return;
  booted = true;
  const bs = document.getElementById("bootState");
  if (bs) bs.remove();
}
function fail(err){
  console.error("Firestore error:", err);
  if (err && err.code === "permission-denied"){
    toast("Permission denied — check Firestore security rules.", true);
  } else {
    toast("Sync error: " + (err && err.message ? err.message : err), true);
  }
}

/* =========================================================================
   12. Mutations
   ========================================================================= */
async function patchConfig(patch){
  CONFIG = Object.assign({}, CONFIG, patch);
  scheduleRender();
  try { await setDoc(cfgRef(), patch, { merge:true }); } catch(e){ fail(e); }
}

function mutProject(pid, patch){
  const cur = PROJECTS.get(pid);
  if (cur) PROJECTS.set(pid, Object.assign({}, cur, patch));
  scheduleRender();
  setDoc(projRef(pid), patch, { merge:true }).catch(fail);
}

function setActivityField(pid, aid, field, value){
  const a = ACTIVITIES.get(pid) && ACTIVITIES.get(pid).get(aid);
  if (a) a[field] = value;
  scheduleRender();
  updateDoc(actRef(pid, aid), { [field]: value }).catch(fail);
}

function setCps(pid, aid, cpId, sub, value){
  const a = ACTIVITIES.get(pid) && ACTIVITIES.get(pid).get(aid);
  if (a){ a.cps = a.cps || {}; a.cps[cpId] = a.cps[cpId] || { wi:"", st:"backlog" }; a.cps[cpId][sub] = value; }
  scheduleRender();
  updateDoc(actRef(pid, aid), { ["cps."+cpId+"."+sub]: value }).catch(fail);
}

async function addProject(){
  const id    = uid();
  const order = PROJECTS.size ? Math.max(...[...PROJECTS.values()].map(p=>p.order ?? 0)) + 1 : 0;
  const cps   = {}; (CONFIG.checkpoints || []).forEach(c => cps[c.id] = { wi:"", st:"backlog" });
  try {
    const batch = writeBatch(db);
    batch.set(projRef(id), { name:"New Project", desc:"", hideProgress:false, order });
    batch.set(actRef(id, uid()), { name:"New Activity", next:"", due:"", note:"", order:0, cps });
    await batch.commit();
    toast("Project added");
  } catch(e){ fail(e); }
}

async function removeProject(pid){
  try {
    const m = ACTIVITIES.get(pid);
    const batch = writeBatch(db);
    if (m) for (const aid of m.keys()) batch.delete(actRef(pid, aid));
    batch.delete(projRef(pid));
    await batch.commit();
  } catch(e){ fail(e); }
}

async function addActivity(pid){
  const m     = ACTIVITIES.get(pid);
  const order = m && m.size ? Math.max(...[...m.values()].map(a=>a.order ?? 0)) + 1 : 0;
  const cps   = {}; (CONFIG.checkpoints || []).forEach(c => cps[c.id] = { wi:"", st:"backlog" });
  try { await setDoc(actRef(pid, uid()), { name:"New Activity", next:"", due:"", note:"", order, cps }); }
  catch(e){ fail(e); }
}

function removeActivity(pid, aid){ deleteDoc(actRef(pid, aid)).catch(fail); }

async function doAddCheckpoint(importPrev){
  const cps  = CONFIG.checkpoints || [];
  const prev = cps[cps.length-1];
  const cp   = { id:uid(), label:"As of "+labelDate(new Date()), collapsed:false };
  try {
    const batch = writeBatch(db);
    batch.set(cfgRef(), { checkpoints:[...cps, cp], activeCp:cp.id }, { merge:true });
    for (const [pid, m] of ACTIVITIES){
      for (const [aid, a] of m){
        const src = prev ? (a.cps && a.cps[prev.id]) : null;
        const val = (importPrev && src) ? { wi:src.wi||"", st:src.st||"backlog" } : { wi:"", st:"backlog" };
        batch.update(actRef(pid, aid), { ["cps."+cp.id]: val });
      }
    }
    await batch.commit();
    toast("Checkpoint added");
  } catch(e){ fail(e); }
}

async function removeCheckpoint(cpId){
  const cps = CONFIG.checkpoints || [];
  if (cps.length <= 1){ toast("Keep at least one checkpoint."); return; }
  const nextCps  = cps.filter(c => c.id !== cpId);
  let activeCp   = CONFIG.activeCp;
  if (activeCp === cpId) activeCp = nextCps[nextCps.length-1].id;
  try {
    const batch = writeBatch(db);
    batch.set(cfgRef(), { checkpoints:nextCps, activeCp }, { merge:true });
    for (const [pid, m] of ACTIVITIES)
      for (const aid of m.keys())
        batch.update(actRef(pid, aid), { ["cps."+cpId]: deleteField() });
    await batch.commit();
  } catch(e){ fail(e); }
}

function setCheckpointField(cpId, patch){
  const cps = (CONFIG.checkpoints || []).map(c => c.id === cpId ? Object.assign({}, c, patch) : c);
  patchConfig({ checkpoints:cps });
}
function makeActiveCheckpoint(cpId){
  const cps = (CONFIG.checkpoints || []).map(c => c.id === cpId ? Object.assign({}, c, { collapsed:false }) : c);
  patchConfig({ checkpoints:cps, activeCp:cpId });
}
function toggleHistory(){
  const expandedPast = (CONFIG.checkpoints || []).some(c => !c.collapsed && c.id !== CONFIG.activeCp);
  const cps = (CONFIG.checkpoints || []).map(c =>
    Object.assign({}, c, { collapsed: expandedPast ? (c.id !== CONFIG.activeCp) : false }));
  patchConfig({ checkpoints:cps });
}

/* =========================================================================
   13. Helpers
   ========================================================================= */
function el(tag, attrs, ...kids){
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs){
    if (k === "class") n.className = attrs[k];
    else if (k === "html") n.innerHTML = attrs[k];
    else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  }
  kids.flat().forEach(c => { if (c == null) return; n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return n;
}
function icon(name, cls){ return el("span", { class:"ic "+(cls||""), html:ICONS[name]||"" }); }
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function labelDate(d){ return d.getDate()+" "+MONTHS[d.getMonth()]+" "+d.getFullYear(); }
function fmtDate(iso){ if(!iso) return "TBD"; const d=new Date(iso+"T00:00:00"); if(isNaN(d)) return "TBD"; return labelDate(d); }

function projStats(p){
  const cp = DATA.activeCp; const c = { backlog:0, prog:0, done:0, cancel:0 };
  p.activities.forEach(a => { const st = (a.cps && a.cps[cp] && a.cps[cp].st) || "backlog"; if (c[st] != null) c[st]++; });
  const total = p.activities.length;
  return { c, total, pct: total ? Math.round(c.done/total*100) : 0 };
}
function anyExpandedPast(){ return (DATA.checkpoints||[]).some(c => !c.collapsed && c.id !== DATA.activeCp); }

/* =========================================================================
   14. Rich text
   ========================================================================= */
const RT_ALLOWED = { B:1,STRONG:1,I:1,EM:1,U:1,S:1,STRIKE:1,SUB:1,SUP:1,UL:1,OL:1,LI:1,BR:1,DIV:1,P:1,SPAN:1 };
const RT_DROP    = { SCRIPT:1,STYLE:1,NOSCRIPT:1,IFRAME:1,OBJECT:1,EMBED:1,TEMPLATE:1,LINK:1,META:1,SVG:1,TITLE:1 };
function escHtml(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function looksLikeHtml(s){
  return /<\/?(b|strong|i|em|u|s|strike|sub|sup|ul|ol|li|br|div|p|span)\b/i.test(s||"")
      || /&(amp|lt|gt|nbsp|#\d+|#x[0-9a-f]+);/i.test(s||"");
}
function richToHtml(v){
  if (!v) return "";
  if (looksLikeHtml(v)) return v;
  return escHtml(v).replace(/\n/g,"<br>");
}
function richIsEmpty(v){
  if (!v) return true;
  const t = String(v).replace(/<[^>]*>/g,"").replace(/&nbsp;/gi," ").replace(/\u200b/g,"").trim();
  return t.length === 0;
}
function sanitizeNode(node){
  [...node.childNodes].forEach(ch => {
    if (ch.nodeType === 3) return;
    if (ch.nodeType !== 1){ ch.remove(); return; }
    if (RT_DROP[ch.tagName]){ ch.remove(); return; }
    sanitizeNode(ch);
    if (RT_ALLOWED[ch.tagName]){
      [...ch.attributes].forEach(at => ch.removeAttribute(at.name));
    } else {
      while (ch.firstChild) node.insertBefore(ch.firstChild, ch);
      ch.remove();
    }
  });
}
function sanitizeRich(html){
  const box = document.createElement("div");
  box.innerHTML = html || "";
  sanitizeNode(box);
  let out = box.innerHTML
    .replace(/<div><br><\/div>/gi,"<br>")
    .replace(/(?:\s|&nbsp;|<br>)+$/i,"")
    .trim();
  return richIsEmpty(out) ? "" : out;
}
function richToPlain(v){
  if (!v) return "";
  if (!looksLikeHtml(v)) return v;
  let s = String(v)
    .replace(/<\s*br\s*\/?>/gi,"\n")
    .replace(/<\/(p|div)>/gi,"\n")
    .replace(/<li[^>]*>/gi,"\u2022 ")
    .replace(/<\/li>/gi,"\n")
    .replace(/<[^>]+>/g,"");
  const ta = document.createElement("textarea"); ta.innerHTML = s; s = ta.value;
  return s.replace(/\n{3,}/g,"\n\n").replace(/^\n+|\n+$/g,"");
}
function execCmd(cmd, val){ try { document.execCommand(cmd, false, val === undefined ? null : val); } catch(e){} }
function placeCaretEnd(node){
  const r = document.createRange(); r.selectNodeContents(node); r.collapse(false);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
function richEditable(value, ph, onSave){
  const div = el("div",{ class:"rt-edit", id:"editfield", contenteditable:"true", "data-ph":ph,
    onblur:(e)=>{ onSave(sanitizeRich(e.currentTarget.innerHTML)); endEdit(); },
    onkeydown:(e)=>{ if (e.key === "Escape"){ e.preventDefault(); e.currentTarget.blur(); } }});
  div.innerHTML = richToHtml(value);
  return div;
}

let richToolbarEl = null;
const RT_BUTTONS = [
  { cmd:"bold",                label:"<b>B</b>",         title:"Bold" },
  { cmd:"italic",              label:"<i>I</i>",         title:"Italic" },
  { cmd:"underline",           label:"<u>U</u>",         title:"Underline" },
  { cmd:"strikeThrough",       label:"<s>S</s>",         title:"Strikethrough" },
  { sep:true },
  { cmd:"insertUnorderedList", icon:"bulletList",         title:"Bulleted list" },
  { cmd:"insertOrderedList",   icon:"numberList",         title:"Numbered list" },
  { sep:true },
  { cmd:"superscript",         label:"x<sup>2</sup>",    title:"Superscript" },
  { cmd:"subscript",           label:"x<sub>2</sub>",    title:"Subscript" },
  { sep:true },
  { cmd:"removeFormat",        icon:"clearFmt",           title:"Clear formatting" }
];
const RT_STATE_CMDS = ["bold","italic","underline","strikeThrough","insertUnorderedList","insertOrderedList","superscript","subscript"];
function showRichToolbar(editor){
  removeRichToolbar();
  const bar = el("div",{class:"rt-toolbar"});
  RT_BUTTONS.forEach(b => {
    if (b.sep){ bar.appendChild(el("span",{class:"rt-tsep"})); return; }
    const btn = el("button",{class:"rt-tbtn", type:"button", title:b.title,
      html: b.icon ? ICONS[b.icon] : b.label,
      onmousedown:(e)=>{
        e.preventDefault();
        if (document.activeElement !== editor) editor.focus();
        execCmd(b.cmd);
        updateRichToolbarState(bar);
      }});
    btn.dataset.cmd = b.cmd;
    bar.appendChild(btn);
  });
  document.body.appendChild(bar);
  richToolbarEl = bar;
  positionRichToolbar(bar, editor);
  updateRichToolbarState(bar);
  editor.addEventListener("keyup",   ()=>updateRichToolbarState(bar));
  editor.addEventListener("mouseup", ()=>updateRichToolbarState(bar));
}
function positionRichToolbar(bar, editor){
  const r = editor.getBoundingClientRect(); const br = bar.getBoundingClientRect();
  let top = r.top - br.height - 7;
  if (top < 8) top = r.bottom + 7;
  let left = Math.min(r.left, window.innerWidth - br.width - 10);
  left = Math.max(10, left);
  bar.style.top = top+"px"; bar.style.left = left+"px";
}
function updateRichToolbarState(bar){
  bar.querySelectorAll(".rt-tbtn").forEach(btn => {
    const cmd = btn.dataset.cmd;
    if (RT_STATE_CMDS.indexOf(cmd) < 0) return;
    let on = false; try { on = document.queryCommandState(cmd); } catch(e){}
    btn.classList.toggle("on", on);
  });
}
function removeRichToolbar(){ if (richToolbarEl){ richToolbarEl.remove(); richToolbarEl = null; } }
function repositionRichToolbar(){
  if (!richToolbarEl) return;
  const f = document.getElementById("editfield");
  if (f && f.classList.contains("rt-edit")) positionRichToolbar(richToolbarEl, f);
  else removeRichToolbar();
}

/* =========================================================================
   15. Render
   ========================================================================= */
function render(){
  const wrap = document.getElementById("wrap");
  if (!DATA){ return; }
  pendingRender = false;
  wrap.innerHTML = "";
  removeRichToolbar();

  document.documentElement.style.setProperty("--w-no",         colW("no")+"px");
  document.documentElement.style.setProperty("--w-project",    colW("project")+"px");
  document.documentElement.style.setProperty("--w-activities", colW("activities")+"px");

  const grid = el("table", { class:"grid", id:"grid" });
  let cpCols = 0; DATA.checkpoints.forEach(cp => cpCols += cp.collapsed ? 1 : 2);
  const totalCols = 3 + cpCols + 4;

  const cg = el("colgroup");
  const addCol = (key,w)=>{ const c=el("col"); c.setAttribute("data-key",key); c.style.width=(w||colW(key))+"px"; cg.appendChild(c); };
  addCol("no"); addCol("project"); addCol("activities");
  DATA.checkpoints.forEach(cp => { if (cp.collapsed){ addCol("cc:"+cp.id, 40); } else { addCol("wi:"+cp.id); addCol("st:"+cp.id); } });
  addCol("addcp"); addCol("next"); addCol("due"); addCol("note");
  grid.appendChild(cg);

  const thead = el("thead");
  const grp   = el("tr", { class:"grp" });
  const thRz  = (label,cls,key,extra)=>{ const th=el("th",Object.assign({class:cls},extra||{}),label);
    th.appendChild(el("div",{class:"rz", onmousedown:(e)=>startResize(e,key)})); return th; };

  grp.appendChild(el("th",{class:"grp c-no rspan", rowspan:2}, "No."));
  grp.appendChild(thRz("Project","grp c-project rspan","project",{rowspan:2}));
  grp.appendChild(thRz("Activities","grp c-activities rspan","activities",{rowspan:2}));

  DATA.checkpoints.forEach(cp => {
    if (cp.collapsed){
      const inner = el("div",{class:"cpc-inner"}, icon("chevRight","cpc-chev"),
        el("span",{class:"cpc-lbl"}, cp.label.replace(/^As of\s*/i,"")));
      grp.appendChild(el("th",{class:"grp cp-collapsed-h", rowspan:2, title:"Click to expand",
        onclick:()=>setCheckpointField(cp.id,{collapsed:false})}, inner));
    } else {
      const isActive = cp.id === DATA.activeCp;
      const head = el("th",{class:"grp cpgrp"+(isActive?" cp-active-h":""), colspan:2},
        el("span",{class:"cplabel"}, cp.label),
        el("span",{class:"cpmenu-btn", html:ICONS.chevDown, onclick:(e)=>checkpointMenu(e,cp)}));
      grp.appendChild(head);
    }
  });

  grp.appendChild(el("th",{class:"grp rspan", rowspan:2}, "Add Checkpoint"));
  grp.appendChild(thRz("Next Action","grp rspan","next",{rowspan:2}));
  grp.appendChild(thRz("Due Date","grp rspan","due",{rowspan:2}));
  grp.appendChild(thRz("Note/Remarks","grp rspan","note",{rowspan:2}));
  thead.appendChild(grp);

  const sub = el("tr",{class:"sub"});
  DATA.checkpoints.forEach(cp => {
    if (cp.collapsed) return;
    const act = cp.id === DATA.activeCp ? " cp-active-sub" : "";
    sub.appendChild(thRz("Work Item","sub"+act,"wi:"+cp.id));
    sub.appendChild(thRz("Status","sub"+act,"st:"+cp.id));
  });
  thead.appendChild(sub);
  grid.appendChild(thead);

  const tbody = el("tbody");
  DATA.projects.forEach((p,pi) => {
    tbody.appendChild(el("tr",{class:"gaprow"}, el("td",{class:"gap", colspan:totalCols})));
    const span = p.activities.length + 1;
    p.activities.forEach((a,ai) => {
      const first = ai === 0;
      const tr    = el("tr",{class:"act-tr","data-pid":p.id,"data-aid":a.id});
      if (first){
        tr.appendChild(el("td",{class:"c-no blk-left blk-tl blk-bl rtop", rowspan:span}, String(pi+1)));
        tr.appendChild(projectCell(p,span));
      }
      const actTd = activityCell(p,a); if (first) actTd.classList.add("rtop"); tr.appendChild(actTd);

      DATA.checkpoints.forEach(cp => {
        const d = (a.cps && a.cps[cp.id]) || { wi:"", st:"backlog" };
        if (cp.collapsed){
          const td = el("td",{class:"cp-collapsed-c", title:STMETA[d.st||"backlog"].label+" — click to expand",
            onclick:()=>setCheckpointField(cp.id,{collapsed:false})},
            el("span",{class:"cpc-dot", style:"background:"+SUMDOT[d.st||"backlog"]}));
          if (first) td.classList.add("rtop"); tr.appendChild(td);
        } else {
          const isActive = cp.id === DATA.activeCp;
          const wiTd = workItemCell(p,a,cp), stTd = statusCell(p,a,cp);
          if (first){ wiTd.classList.add("rtop"); stTd.classList.add("rtop"); }
          if (isActive){ wiTd.classList.add("cp-active-cell"); stTd.classList.add("cp-active-cell"); }
          tr.appendChild(wiTd); tr.appendChild(stTd);
        }
      });

      if (first){
        tr.appendChild(el("td",{class:"c-addcp rtop", rowspan:span},
          el("div",{class:"addcp-btn", onclick:()=>addCheckpoint()},
            el("div",{class:"circ", html:ICONS.plus}), el("div",{class:"cap"},"Add Checkpoint"))));
      }

      const nx = textCell(p,a,"next","nx:"+p.id+":"+a.id,"Add next action..."); if (first) nx.classList.add("rtop"); tr.appendChild(nx);
      const du = dueCell(p,a);                                                  if (first) du.classList.add("rtop"); tr.appendChild(du);
      const nt = textCell(p,a,"note","nt:"+p.id+":"+a.id,"Add note...");        if (first){ nt.classList.add("rtop"); nt.classList.add("blk-tr"); } tr.appendChild(nt);
      tbody.appendChild(tr);
    });

    const ar = el("tr",{class:"addrow"});
    ar.appendChild(el("td",{class:"c-activities addact"},
      el("div",{class:"addact-btn", onclick:()=>addActivity(p.id)}, icon("plus"), "Add Activity")));
    DATA.checkpoints.forEach(cp => { ar.appendChild(el("td")); if (!cp.collapsed) ar.appendChild(el("td")); });
    ar.appendChild(el("td")); ar.appendChild(el("td")); ar.appendChild(el("td",{class:"blk-br"}));
    tbody.appendChild(ar);
  });
  grid.appendChild(tbody);
  wrap.appendChild(grid);

  if (!DATA.projects.length){
    wrap.appendChild(el("div",{class:"state"},
      el("div",{class:"state-ic", html:ICONS.folder}),
      el("h2",null,"No projects yet"),
      el("p",null,"Add your first project to start tracking activities, checkpoints and progress.")));
  }

  wrap.appendChild(el("div",{class:"add-proj-wrap"},
    el("button",{class:"add-proj", onclick:()=>addProject()}, icon("plus"), "Add Project")));

  document.querySelectorAll("[data-ic]").forEach(s => { if (s.children.length === 0) s.innerHTML = ICONS[s.getAttribute("data-ic")] || ""; });

  if (editKey){
    const f = document.getElementById("editfield");
    if (f){
      f.focus();
      if (f.classList.contains("rt-edit")){
        placeCaretEnd(f);
        execCmd("styleWithCSS", false);
        showRichToolbar(f);
      } else {
        if (f.setSelectionRange){ const v=f.value; f.setSelectionRange(v.length,v.length); }
        if (f.tagName === "TEXTAREA"){
          const grow=()=>{ f.style.height="auto"; f.style.height=Math.max(f.scrollHeight,30)+"px"; };
          f.addEventListener("input",grow); grow();
        }
      }
    }
  }
}

function startEdit(key){ editKey = key; render(); }
function endEdit(){ editKey = null; render(); }

/* =========================================================================
   16. Cell builders
   ========================================================================= */
function projectCell(p, span){
  const td = el("td",{class:"c-project rtop", rowspan:span});
  td.appendChild(el("span",{class:"pj-menu-btn", html:ICONS.dots, onclick:(e)=>projectMenu(e,p)}));
  if (editKey === "pn:"+p.id){
    const ta = el("textarea",{class:"cell-edit", id:"editfield", rows:1,
      onblur:(e)=>{ mutProject(p.id,{name:e.target.value.trim()||"Untitled Project"}); endEdit(); },
      onkeydown:(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); e.target.blur(); } }});
    ta.value = p.name||""; td.appendChild(ta);
  } else {
    td.appendChild(el("div",{class:"pj-name", onclick:()=>startEdit("pn:"+p.id)}, p.name||"Untitled Project"));
  }
  if (editKey === "pd:"+p.id){
    const ta = el("textarea",{class:"cell-edit", id:"editfield", rows:2,
      onblur:(e)=>{ mutProject(p.id,{desc:e.target.value.trim()}); endEdit(); },
      onkeydown:(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); e.target.blur(); } }});
    ta.value = p.desc||""; td.appendChild(ta);
  } else {
    td.appendChild(el("div",{class:"pj-desc", onclick:()=>startEdit("pd:"+p.id)}, p.desc||"Add description..."));
  }
  if (!p.hideProgress){
    const s = projStats(p);
    td.appendChild(el("div",{class:"pj-bar-wrap"},
      el("div",{class:"pj-bar"}, el("i",{style:"width:"+s.pct+"%"})), el("span",{class:"pj-pct"}, s.pct+"%")));
    const sumRow = (st)=> el("div",{class:"row"},
      el("span",{class:"dot", style:"background:"+SUMDOT[st]}), el("span",{class:"nm"}, STMETA[st].label), el("span",{class:"ct"}, String(s.c[st])));
    td.appendChild(el("div",{class:"pj-sum"}, sumRow("backlog"), sumRow("prog"), sumRow("done"), sumRow("cancel"),
      el("div",{class:"pj-total"}, el("b",null,"Total"), el("span",null, el("b",null,String(s.total)), el("span",{class:"muted"}," Items")))));
  }
  return td;
}

function activityCell(p,a){
  const td = el("td",{class:"c-activities"});
  if (editKey === "an:"+p.id+":"+a.id){
    const ta = el("textarea",{class:"cell-edit", id:"editfield", rows:1,
      onblur:(e)=>{ setActivityField(p.id,a.id,"name",e.target.value.trim()||"Activity"); endEdit(); },
      onkeydown:(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); e.target.blur(); } }});
    ta.value = a.name||""; td.appendChild(ta);
  } else {
    td.appendChild(el("div",{class:"act-row"},
      el("span",{class:"act-grip", html:ICONS.grip, title:"Drag to reorder",
        onmousedown:(e)=>{ e.stopPropagation(); startActivityDrag(e, p.id, a.id, e.currentTarget.closest("tr")); }}),
      el("div",{class:"act-name", onclick:()=>startEdit("an:"+p.id+":"+a.id)}, a.name||"Activity"),
      el("span",{class:"act-del", html:ICONS.trash, title:"Delete activity", onclick:()=>deleteActivity(p,a)})));
  }
  return td;
}

function workItemCell(p,a,cp){
  const d   = (a.cps && a.cps[cp.id]) || { wi:"", st:"backlog" };
  const key = "wi:"+p.id+":"+a.id+":"+cp.id;
  if (editKey === key) return el("td",{class:"c-wi"}, richEditable(d.wi, "Input Work Item here...", (v)=>setCps(p.id,a.id,cp.id,"wi",v)));
  return el("td",{class:"c-wi"}, el("div",{class:"cell-text"+(richIsEmpty(d.wi)?" empty":""),
    "data-ph":"Input Work Item here...", html:richToHtml(d.wi), onclick:()=>startEdit(key)}));
}

function statusCell(p,a,cp){
  const d  = (a.cps && a.cps[cp.id]) || { wi:"", st:"backlog" };
  const st = d.st || "backlog"; const m = STMETA[st];
  return el("td",{class:"c-st"}, el("span",{class:"pill pill-dd "+m.cls, onclick:(e)=>statusMenu(e,p,a,cp,st)},
    el("span",{class:"pill-lbl"}, m.label), el("span",{class:"pill-caret", html:ICONS.chevDown})));
}

function statusMenu(e,p,a,cp,current){
  e.stopPropagation(); closeMenus();
  const pill = e.currentTarget;
  const menu = el("div",{class:"menu status-menu"});
  STATUS.forEach(st => {
    const meta = STMETA[st];
    menu.appendChild(el("div",{class:"mi st-item", onclick:()=>{ closeMenus(); if (st !== current) setCps(p.id,a.id,cp.id,"st",st); }},
      el("span",{class:"pill "+meta.cls}, meta.label)));
  });
  document.body.appendChild(menu);
  const r = pill.getBoundingClientRect(); const mr = menu.getBoundingClientRect();
  menu.style.left = Math.min(r.left, window.innerWidth - mr.width - 10)+"px";
  menu.style.top  = Math.min(r.bottom + 5, window.innerHeight - mr.height - 10)+"px";
  setTimeout(()=>document.addEventListener("mousedown",outsideMenu,true),0);
}

function textCell(p,a,field,key,ph){
  if (editKey === key) return el("td",null, richEditable(a[field], ph, (v)=>setActivityField(p.id,a.id,field,v)));
  return el("td",null, el("div",{class:"cell-text"+(richIsEmpty(a[field])?" empty":""),
    "data-ph":ph, html:richToHtml(a[field]), onclick:()=>startEdit(key)}));
}

function dueCell(p,a){
  const key = "due:"+p.id+":"+a.id;
  if (editKey === key){
    const inp = el("input",{type:"date", id:"editfield", value:a.due||"", onchange:(e)=>{ setActivityField(p.id,a.id,"due",e.target.value); endEdit(); }});
    const tbd = el("button",{class:"mini-btn", onmousedown:(e)=>{ e.preventDefault(); setActivityField(p.id,a.id,"due",""); endEdit(); }},"TBD");
    return el("td",null, el("div",{class:"date-edit"}, inp, tbd));
  }
  return el("td",null, el("div",{class:"due-text"+(a.due?"":" tbd"), onclick:()=>startEdit(key)}, icon("cal"), fmtDate(a.due)));
}

/* =========================================================================
   17. Actions / dialogs
   ========================================================================= */
function deleteActivity(p,a){
  if (p.activities.length <= 1){ toast("Keep at least one activity."); return; }
  showDialog({ title:"Delete Activity?", message:"\u201C"+(a.name||"Activity")+"\u201D will be removed.",
    buttons:[{label:"Cancel",style:"cancel"},{label:"Delete",style:"danger",onClick:()=>removeActivity(p.id,a.id)}] });
}
function addCheckpoint(){
  showDialog({ title:"Add Checkpoint", message:"Start from the latest checkpoint or begin with a blank one?",
    buttons:[{label:"Start blank",style:"bold",onClick:()=>doAddCheckpoint(false)},
             {label:"Import previous",style:"bold",onClick:()=>doAddCheckpoint(true)}], vertical:true, cancel:true });
}

function closeMenus(){ document.querySelectorAll(".menu,.overlay").forEach(n=>n.remove()); document.removeEventListener("mousedown",outsideMenu,true); }
function outsideMenu(e){ if (!e.target.closest(".menu")) closeMenus(); }
function openMenu(x,y,items){
  closeMenus();
  const m = el("div",{class:"menu"});
  items.forEach(it => {
    if (it.sep){ m.appendChild(el("div",{class:"msep"})); return; }
    const row = el("div",{class:"mi"+(it.danger?" danger":""), onclick:()=>{ closeMenus(); it.onClick && it.onClick(); }}, icon(it.icon), el("span",null,it.label));
    if (it.check) row.appendChild(el("span",{class:"chk", html:ICONS.check}));
    m.appendChild(row);
  });
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, window.innerWidth - r.width - 10)+"px";
  m.style.top  = Math.min(y, window.innerHeight - r.height - 10)+"px";
  setTimeout(()=>document.addEventListener("mousedown",outsideMenu,true),0);
}
function checkpointMenu(e,cp){
  e.stopPropagation();
  const isActive = cp.id === DATA.activeCp;
  const items = [
    { label:"Make Active",         icon:"play",   check:isActive, onClick:()=>makeActiveCheckpoint(cp.id) },
    { label:"Rename Checkpoint",   icon:"pencil",                 onClick:()=>renameCheckpointPrompt(cp)  },
  ];
  if (!isActive) items.push({ label:"Collapse Checkpoint", icon:"eyeOff", onClick:()=>setCheckpointField(cp.id,{collapsed:true}) });
  items.push({ sep:true });
  items.push({ label:"Delete Checkpoint", icon:"trash", danger:true, onClick:()=>{
    if ((DATA.checkpoints||[]).length <= 1){ toast("Keep at least one checkpoint."); return; }
    showDialog({ title:"Delete Checkpoint?",
      message:"\u201C"+cp.label+"\u201D and its work items and statuses across all projects will be removed.",
      buttons:[{label:"Cancel",style:"cancel"},{label:"Delete",style:"danger",onClick:()=>removeCheckpoint(cp.id)}] });
  }});
  const r = e.target.getBoundingClientRect();
  openMenu(r.left, r.bottom+4, items);
}
function renameCheckpointPrompt(cp){
  closeMenus();
  setTimeout(()=>{ const val = window.prompt("Rename checkpoint:", cp.label); if (val != null){ setCheckpointField(cp.id,{label:val.trim()||cp.label}); } },10);
}
function projectMenu(e,p){
  e.stopPropagation();
  const collapsed = anyExpandedPast();
  const r = e.target.getBoundingClientRect();
  openMenu(r.left-160, r.bottom+4, [
    { label: p.hideProgress?"Show Progress":"Hide Progress", icon: p.hideProgress?"eye":"eyeOff", onClick:()=>mutProject(p.id,{hideProgress:!p.hideProgress}) },
    { label: collapsed?"Collapse History":"Show History", icon:"layers", onClick:()=>toggleHistory() },
    { sep:true },
    { label:"Delete Project", icon:"trash", danger:true, onClick:()=>{
      showDialog({ title:"Delete Project?", message:"\u201C"+(p.name||"Untitled Project")+"\u201D and all of its activities will be permanently deleted.",
        buttons:[{label:"Cancel",style:"cancel"},{label:"Delete",style:"danger",onClick:()=>removeProject(p.id)}] });
    }}
  ]);
}
function showDialog({title,message,buttons,vertical,cancel}){
  closeMenus();
  const ov = el("div",{class:"overlay"});
  const dg = el("div",{class:"dialog"});
  dg.appendChild(el("div",{class:"body"}, el("h3",null,title), el("p",null,message)));
  const acts = el("div",{class:"acts"});
  if (vertical) acts.style.flexDirection = "column";
  buttons.forEach(b => acts.appendChild(el("button",{class:(b.style==="danger"?"danger":"")+(b.style==="bold"?" bold":""), onclick:()=>{ ov.remove(); b.onClick && b.onClick(); }}, b.label)));
  if (cancel) acts.appendChild(el("button",{onclick:()=>ov.remove()},"Cancel"));
  dg.appendChild(acts); ov.appendChild(dg);
  ov.addEventListener("mousedown",(e)=>{ if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

let toastTimer = null;
function toast(msg, isErr){
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove("show"), isErr ? 4200 : 1900);
}

/* =========================================================================
   18. Column resizing
   ========================================================================= */
let rzState = null;
function startResize(e,key){
  e.preventDefault(); e.stopPropagation();
  const col = document.querySelector('col[data-key="'+CSS.escape(key)+'"]');
  rzState = { key, startX:e.clientX, startW: col?col.getBoundingClientRect().width:colW(key), col };
  document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  window.addEventListener("mousemove",doResize); window.addEventListener("mouseup",endResize);
}
function doResize(e){
  if (!rzState) return;
  const w = Math.max(60, Math.round(rzState.startW + (e.clientX - rzState.startX)));
  if (rzState.col) rzState.col.style.width = w+"px";
  if (rzState.key === "project")    document.documentElement.style.setProperty("--w-project",    w+"px");
  if (rzState.key === "activities") document.documentElement.style.setProperty("--w-activities", w+"px");
  CONFIG.colWidths = CONFIG.colWidths || {}; CONFIG.colWidths[rzState.key] = w;
  if (DATA) DATA.colWidths = CONFIG.colWidths;
}
function endResize(){
  if (!rzState) return;
  const key = rzState.key; rzState = null;
  document.body.style.cursor = ""; document.body.style.userSelect = "";
  window.removeEventListener("mousemove",doResize); window.removeEventListener("mouseup",endResize);
  setDoc(cfgRef(), { colWidths: CONFIG.colWidths }, { merge:true }).catch(fail);
}

/* =========================================================================
   19. Drag-to-reorder activities
   ========================================================================= */
function startActivityDrag(e, pid, aid, tr){
  if (e.button !== 0 || !tr) return;
  e.preventDefault();
  const grid = document.getElementById("grid"); if (!grid) return;
  const gridRect = grid.getBoundingClientRect();
  const trRect   = tr.getBoundingClientRect();
  const actCell  = tr.querySelector(".c-activities");
  const startLeft = actCell ? actCell.getBoundingClientRect().left : gridRect.left;
  let floatW = 0;
  [...tr.children].forEach(td => {
    if (td.classList.contains("c-no") || td.classList.contains("c-project")) return;
    floatW += td.getBoundingClientRect().width;
  });
  const float = buildDragFloat(grid, tr);
  float.style.left  = startLeft+"px";
  float.style.top   = trRect.top+"px";
  float.style.width = Math.max(0, floatW)+"px";
  document.body.appendChild(float);
  tr.classList.add("dragging-src");
  dragState = { pid, aid, tr, float, offsetY: e.clientY - trRect.top, targetAid:null, after:false };
  document.body.style.userSelect = "none"; document.body.style.cursor = "grabbing";
  window.addEventListener("mousemove", onActivityDragMove);
  window.addEventListener("mouseup",   onActivityDragEnd);
}
function buildDragFloat(grid, tr){
  const float = el("table",{class:"grid drag-float"});
  const cg = grid.querySelector("colgroup");
  if (cg){
    const ncg = el("colgroup");
    [...cg.children].forEach((col,i)=>{ if (i >= 2) ncg.appendChild(col.cloneNode(true)); });
    float.appendChild(ncg);
  }
  const blank = ()=> el("td",{class:"drag-blank"});
  const row = el("tr");
  let actClone = null; const cpClones = []; const tailClones = [];
  [...tr.children].forEach(td => {
    if (td.classList.contains("c-no") || td.classList.contains("c-project") || td.classList.contains("c-addcp")) return;
    if (td.classList.contains("c-activities")) { actClone = td.cloneNode(true); return; }
    if (td.classList.contains("c-wi") || td.classList.contains("c-st") || td.classList.contains("cp-collapsed-c")) { cpClones.push(td.cloneNode(true)); return; }
    tailClones.push(td.cloneNode(true));
  });
  const scrub = (n)=>{ n.removeAttribute("rowspan"); n.querySelectorAll("[id]").forEach(x=>x.removeAttribute("id")); n.querySelectorAll("[contenteditable]").forEach(x=>x.removeAttribute("contenteditable")); };
  if (actClone){ scrub(actClone); row.appendChild(actClone); } else row.appendChild(blank());
  cpClones.forEach(c => { scrub(c); row.appendChild(c); });
  row.appendChild(blank());
  tailClones.forEach(c => { scrub(c); row.appendChild(c); });
  const tb = el("tbody"); tb.appendChild(row); float.appendChild(tb);
  return float;
}
function clearDropIndicator(){ document.querySelectorAll("tr.drop-before,tr.drop-after").forEach(r => r.classList.remove("drop-before","drop-after")); }
function onActivityDragMove(e){
  if (!dragState) return;
  dragState.float.style.top = (e.clientY - dragState.offsetY)+"px";
  clearDropIndicator();
  const rows = [...document.querySelectorAll('tr.act-tr[data-pid="'+CSS.escape(dragState.pid)+'"]')];
  dragState.targetAid = null;
  for (const r of rows){
    const rc = r.getBoundingClientRect();
    if (e.clientY >= rc.top && e.clientY <= rc.bottom){
      const after = e.clientY > rc.top + rc.height/2;
      r.classList.add(after ? "drop-after" : "drop-before");
      dragState.targetAid = r.dataset.aid; dragState.after = after; break;
    }
  }
}
function onActivityDragEnd(){
  if (!dragState) return;
  const ds = dragState; dragState = null;
  ds.float.remove(); ds.tr.classList.remove("dragging-src"); clearDropIndicator();
  window.removeEventListener("mousemove", onActivityDragMove);
  window.removeEventListener("mouseup",   onActivityDragEnd);
  document.body.style.userSelect = ""; document.body.style.cursor = "";
  if (ds.targetAid && ds.targetAid !== ds.aid) reorderActivity(ds.pid, ds.aid, ds.targetAid, ds.after);
  else if (pendingRender) render();
}
function reorderActivity(pid, aid, targetAid, after){
  const m = ACTIVITIES.get(pid); if (!m) return;
  let ids = [...m.values()].sort((a,b)=>(a.order??0)-(b.order??0)).map(x=>x.id).filter(id => id !== aid);
  let ti = ids.indexOf(targetAid); if (ti < 0) ti = ids.length; if (after) ti += 1;
  ids.splice(ti, 0, aid);
  const batch = writeBatch(db); let changed = 0;
  ids.forEach((id,i) => { const a = m.get(id); if (a && a.order !== i){ a.order = i; batch.update(actRef(pid,id), { order:i }); changed++; } });
  scheduleRender();
  if (changed) batch.commit().catch(fail);
}

/* =========================================================================
   20. Excel export
   ========================================================================= */
function stylesXml(){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  +'<fonts count="5">'
   +'<font><sz val="11"/><name val="Calibri"/></font>'
   +'<font><b/><sz val="11"/><name val="Calibri"/></font>'
   +'<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
   +'<font><sz val="11"/><color rgb="FF6B6B70"/><name val="Calibri"/></font>'
   +'<font><b/><sz val="11"/><color rgb="FF5E5CE6"/><name val="Calibri"/></font>'
  +'</fonts>'
  +'<fills count="7">'
   +'<fill><patternFill patternType="none"/></fill>'
   +'<fill><patternFill patternType="gray125"/></fill>'
   +'<fill><patternFill patternType="solid"><fgColor rgb="FFEFEFF4"/></patternFill></fill>'
   +'<fill><patternFill patternType="solid"><fgColor rgb="FFEEEFFF"/></patternFill></fill>'
   +'<fill><patternFill patternType="solid"><fgColor rgb="FF2BB24C"/></patternFill></fill>'
   +'<fill><patternFill patternType="solid"><fgColor rgb="FFF0A500"/></patternFill></fill>'
   +'<fill><patternFill patternType="solid"><fgColor rgb="FF8A8A8E"/></patternFill></fill>'
  +'</fills>'
  +'<borders count="2">'
   +'<border><left/><right/><top/><bottom/><diagonal/></border>'
   +'<border><left style="thin"><color rgb="FFC9C9CF"/></left><right style="thin"><color rgb="FFC9C9CF"/></right><top style="thin"><color rgb="FFC9C9CF"/></top><bottom style="thin"><color rgb="FFC9C9CF"/></bottom><diagonal/></border>'
  +'</borders>'
  +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  +'<cellXfs count="14">'
   +'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
   +'<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
   +'<xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
   +'<xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>'
   +'<xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
   +'<xf fontId="4" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
   +'<xf fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>'
   +'<xf fontId="1" fillId="0" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>'
   +'<xf fontId="3" fillId="0" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>'
   +'<xf fontId="2" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
   +'<xf fontId="2" fillId="5" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
   +'<xf fontId="2" fillId="6" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
   +'<xf fontId="3" fillId="0" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
   +'<xf fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>'
  +'</cellXfs></styleSheet>';
}
function exportExcel(){
  if (typeof JSZip === "undefined"){ exportExcelFallback(); return; }
  const cps = DATA.checkpoints;
  const C = { no:0, project:1, desc:2, act:3 };
  const cpWi = [], cpSt = []; let idx = 4;
  cps.forEach(()=>{ cpWi.push(idx); cpSt.push(idx+1); idx += 2; });
  const nextIdx = idx, dueIdx = idx+1, noteIdx = idx+2, totalCols = idx+3;
  const W = new Array(totalCols).fill(14);
  W[0]=5; W[1]=26; W[2]=30; W[3]=22;
  cps.forEach((c,k)=>{ W[cpWi[k]]=26; W[cpSt[k]]=13; });
  W[nextIdx]=28; W[dueIdx]=13; W[noteIdx]=24;
  const L=(n)=>{ let s=""; n++; while(n>0){ let m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; };
  const xe=(s)=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const cT=(col,r,s,v)=>{ const ref=L(col)+r; if(v==null||v==="") return '<c r="'+ref+'" s="'+s+'"/>'; return '<c r="'+ref+'" s="'+s+'" t="inlineStr"><is><t xml:space="preserve">'+xe(v)+'</t></is></c>'; };
  const cN=(col,r,s,v)=>'<c r="'+L(col)+r+'" s="'+s+'"><v>'+v+'</v></c>';
  const merges = []; let rows = "";
  let r1 = '<row r="1">';
  r1 += cT(C.no,1,2,"No.")+cT(C.project,1,3,"Project")+cT(C.desc,1,3,"Description")+cT(C.act,1,3,"Activity");
  cps.forEach((cp,k)=>{ const active = cp.id === DATA.activeCp;
    r1 += cT(cpWi[k],1,active?5:4, cp.label+(active?"  \u25CF":""))+cT(cpSt[k],1,active?5:4,"");
    merges.push(L(cpWi[k])+"1:"+L(cpSt[k])+"1"); });
  r1 += cT(nextIdx,1,3,"Next Action")+cT(dueIdx,1,3,"Due Date")+cT(noteIdx,1,3,"Note/Remarks")+'</row>';
  rows += r1;
  [C.no,C.project,C.desc,C.act,nextIdx,dueIdx,noteIdx].forEach(c=>merges.push(L(c)+"1:"+L(c)+"2"));
  let r2 = '<row r="2">';
  cps.forEach((cp,k)=>{ r2 += cT(cpWi[k],2,3,"Work Item")+cT(cpSt[k],2,4,"Status"); });
  r2 += '</row>'; rows += r2;
  const stXf = { done:9, prog:10, cancel:11, backlog:12 };
  let r = 3;
  DATA.projects.forEach((p,pi)=>{
    const span = p.activities.length, firstR = r;
    p.activities.forEach((a,ai)=>{
      let row = '<row r="'+r+'">';
      if (ai===0){ row += cN(C.no,r,6,pi+1)+cT(C.project,r,7,p.name)+cT(C.desc,r,8,p.desc); }
      row += cT(C.act,r,7,a.name);
      cps.forEach((cp,k)=>{ const d=(a.cps&&a.cps[cp.id])||{}; const st=d.st||"backlog";
        row += cT(cpWi[k],r,1,richToPlain(d.wi||""))+cT(cpSt[k],r,stXf[st],STMETA[st].label); });
      row += cT(nextIdx,r,1,richToPlain(a.next||""))+cT(dueIdx,r,13,fmtDate(a.due))+cT(noteIdx,r,1,richToPlain(a.note||""))+'</row>';
      rows += row; r++;
    });
    if (span>1){ [C.no,C.project,C.desc].forEach(c=>merges.push(L(c)+firstR+":"+L(c)+(r-1))); }
  });
  let colsXml = '<cols>';
  for (let i=0;i<totalCols;i++) colsXml += '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+W[i]+'" customWidth="1"/>';
  colsXml += '</cols>';
  const mergeXml = '<mergeCells count="'+merges.length+'">'+merges.map(m=>'<mergeCell ref="'+m+'"/>').join("")+'</mergeCells>';
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetView/>'+colsXml+'<sheetData>'+rows+'</sheetData>'+mergeXml+'</worksheet>';
  const ct   = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb   = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tracker" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const wbr  = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const zip = new JSZip();
  zip.file("[Content_Types].xml", ct);
  zip.folder("_rels").file(".rels", rels);
  const xl = zip.folder("xl");
  xl.file("workbook.xml", wb);
  xl.folder("_rels").file("workbook.xml.rels", wbr);
  xl.file("styles.xml", stylesXml());
  xl.folder("worksheets").file("sheet1.xml", sheet);
  zip.generateAsync({type:"blob"}).then(blob=>{
    const url = URL.createObjectURL(blob);
    const a = el("a",{href:url, download:"project-tracker.xlsx"});
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Exported to Excel");
  }).catch(()=>exportExcelFallback());
}
function exportExcelFallback(){
  const esc=(s)=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br/>");
  const XF={done:"#2BB24C",prog:"#F0A500",cancel:"#8A8A8E",backlog:"#FFFFFF"};
  const XT={done:"#fff",prog:"#fff",cancel:"#fff",backlog:"#6b6b70"};
  let h='<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt">';
  h+='<tr><th rowspan="2" bgcolor="#EFEFF4">No.</th><th rowspan="2" bgcolor="#EFEFF4">Project</th><th rowspan="2" bgcolor="#EFEFF4">Description</th><th rowspan="2" bgcolor="#EFEFF4">Activity</th>';
  DATA.checkpoints.forEach(cp=>{ const a=cp.id===DATA.activeCp; h+='<th colspan="2" bgcolor="#EEEFFF" style="color:'+(a?"#5E5CE6":"#1c1c1e")+'">'+esc(cp.label)+(a?" \u25CF":"")+'</th>'; });
  h+='<th rowspan="2" bgcolor="#EFEFF4">Next Action</th><th rowspan="2" bgcolor="#EFEFF4">Due Date</th><th rowspan="2" bgcolor="#EFEFF4">Note/Remarks</th></tr><tr>';
  DATA.checkpoints.forEach(()=>{ h+='<th bgcolor="#EFEFF4">Work Item</th><th bgcolor="#EFEFF4">Status</th>'; });
  h+='</tr>';
  DATA.projects.forEach((p,pi)=>{ const span=p.activities.length;
    p.activities.forEach((a,ai)=>{ h+='<tr>';
      if(ai===0){ h+='<td rowspan="'+span+'" align="center" valign="top">'+(pi+1)+'</td><td rowspan="'+span+'" valign="top"><b>'+esc(p.name)+'</b></td><td rowspan="'+span+'" valign="top" style="color:#666">'+esc(p.desc)+'</td>'; }
      h+='<td valign="top"><b>'+esc(a.name)+'</b></td>';
      DATA.checkpoints.forEach(cp=>{ const d=(a.cps&&a.cps[cp.id])||{}; const st=d.st||"backlog";
        h+='<td valign="top">'+esc(richToPlain(d.wi))+'</td><td align="center" bgcolor="'+XF[st]+'" style="color:'+XT[st]+'"><b>'+esc(STMETA[st].label)+'</b></td>'; });
      h+='<td valign="top">'+esc(richToPlain(a.next))+'</td><td align="center" valign="top">'+esc(fmtDate(a.due))+'</td><td valign="top">'+esc(richToPlain(a.note))+'</td></tr>';
    });
  });
  h+='</table>';
  const html='<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head><body>'+h+'</body></html>';
  const blob=new Blob(["\ufeff"+html],{type:"application/vnd.ms-excel"});
  const url=URL.createObjectURL(blob);
  const a=el("a",{href:url, download:"project-tracker.xls"});
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  toast("Exported (offline fallback)");
}

/* =========================================================================
   21. Boot — auth-driven
   ========================================================================= */
document.getElementById("addProjectBtn").addEventListener("click", addProject);
document.getElementById("exportBtn").addEventListener("click", exportExcel);
document.getElementById("googleSignInBtn").addEventListener("click", doSignIn);
document.getElementById("accessDeniedSignOutBtn").addEventListener("click", doSignOut);
window.addEventListener("scroll", repositionRichToolbar, true);
window.addEventListener("resize", repositionRichToolbar);

/* Handle redirect result (popup-blocked fallback) */
getRedirectResult(auth).catch(()=>{});

/* Auth is the entry point — nothing starts until a member is confirmed */
onAuthStateChanged(auth, async (user) => {
  if (!user){
    signOutCleanup();
    showAuthScreen("loginScreen");
    return;
  }
  currentUser = user;
  showAuthScreen("authLoading");

  try {
    const snap = await getDoc(memberRef(user.email));
    if (!snap.exists()){
      // Not a registered member
      showAuthScreen("accessDenied");
      const emailEl = document.getElementById("accessDeniedEmail");
      if (emailEl) emailEl.textContent = "Signed in as: " + user.email;
      return;
    }
    currentMember = snap.data();
    showAppState();
    try { await ensureConfig(); } catch(e){ fail(e); }
    subscribeConfig();
    subscribeProjects();
  } catch(e){
    console.error("Membership check failed:", e);
    showAuthScreen("accessDenied");
    const emailEl = document.getElementById("accessDeniedEmail");
    if (emailEl) emailEl.textContent = "Signed in as: " + user.email;
  }
});
