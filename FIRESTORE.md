# Firestore Data Model

This document describes how Project Tracker stores its data in Cloud Firestore, why it's structured this way, the security rules, and how to migrate from the old single-document layout.

---

## Why this structure

The earlier version stored the **entire app** in one document (`activeCp`, `checkpoints`, `colWidths`, and a giant `projects` array containing every activity and every checkpoint value). That works at first but has hard limits:

| Problem with one big document | Fixed by normalizing |
|-------------------------------|----------------------|
| Firestore caps a document at **1 MB** — the tracker eventually stops saving | Each project/activity is its own small document |
| Editing one status **rewrites the whole document** (wasteful reads/writes) | An edit writes only the one field that changed |
| Two users editing at once → **last write wins**, data is lost | Different documents don't collide; field-level merges are safe |
| Can't query or load a single project | Each project (and its activities) loads/syncs independently |
| Every keystroke fans out a full-document snapshot to all clients | Snapshots are scoped to the document that actually changed |

---

## Collections & documents

```
meta/
  └─ config                         ← single settings document

projects/
  ├─ {projectId}                    ← one document per project
  │    └─ activities/               ← subcollection
  │         └─ {activityId}         ← one document per activity
  └─ {projectId}
       └─ activities/
            └─ {activityId}
```

### `meta/config`
Global settings shared by the whole board.

| Field         | Type   | Notes |
|---------------|--------|-------|
| `activeCp`    | string | `id` of the checkpoint currently highlighted/used for progress |
| `checkpoints` | array  | Ordered list of `{ id, label, collapsed }` |
| `colWidths`   | map    | `{ [columnKey]: pixelWidth }` — persisted column sizes |

A `checkpoints[]` entry:
```jsonc
{ "id": "a1b2c3d", "label": "As of 9 Jun 2026", "collapsed": false }
```

### `projects/{projectId}`
Project-level metadata only — **activities live in a subcollection, not here.**

| Field          | Type    | Notes |
|----------------|---------|-------|
| `name`         | string  | Project title |
| `desc`         | string  | Short description |
| `hideProgress` | boolean | Hides the progress bar/summary for this project |
| `order`        | number  | Sort position (ascending) |

### `projects/{projectId}/activities/{activityId}`
One row of the tracker.

| Field   | Type   | Notes |
|---------|--------|-------|
| `name`  | string | Activity name |
| `next`  | string | "Next Action" column |
| `due`   | string | ISO date `YYYY-MM-DD`, or `""` for TBD |
| `note`  | string | "Note/Remarks" column |
| `order` | number | Sort position within the project |
| `cps`   | map    | Per-checkpoint values: `{ [checkpointId]: { wi, st } }` |

A `cps` entry — `wi` is the work-item text, `st` is one of `backlog` \| `prog` \| `done` \| `cancel`:
```jsonc
"cps": {
  "a1b2c3d": { "wi": "Drafting requirement", "st": "done" },
  "e4f5g6h": { "wi": "", "st": "backlog" }
}
```

> **Why keep `cps` as a map inside the activity** rather than its own subcollection? Checkpoint values are always loaded together with their activity, they're tiny, and storing them inline lets a status toggle update a single field path (`cps.{cpId}.st`) without an extra document read. A checkpoint typically adds far fewer than the ~100-checkpoint mark where a map would get unwieldy.

---

## How the app reads & writes

**Reads** — three layers of real-time listeners assemble the view:
1. `onSnapshot(meta/config)` → settings
2. `onSnapshot(projects)` → project list (also opens/closes per-project listeners)
3. `onSnapshot(projects/{id}/activities)` → that project's rows

**Writes** are optimistic (UI updates immediately) and field-scoped:
- Status / work item → `updateDoc(activity, { "cps.{cpId}.st": value })`
- Activity text → `updateDoc(activity, { next: value })`
- Project field → `setDoc(project, { name }, { merge: true })`
- Add/delete project → `writeBatch` (project doc + its activities together)
- Add/delete checkpoint → `writeBatch` (config + a `cps` field on every activity)

> **Batch limit:** a single `writeBatch` is capped at **500 operations**. Adding or deleting a checkpoint touches every activity, so this comfortably supports a few hundred activities. Past that, split the batch into chunks of ≤500.

**Indexes:** none required. Ordering is done client-side on the `order` field, so there are no composite-index prompts to deal with.

---

## Security rules

The file [`firestore.rules`](./firestore.rules) contains two versions.

### Development (open — anyone can read/write)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;   // ⚠️ DEV ONLY
    }
  }
}
```
Convenient for testing, but **anyone with your project ID can read and overwrite everything.** Do not leave this on a public site.

### Production (require sign-in)
Add Firebase Authentication, then restrict to authenticated users:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /meta/{doc} {
      allow read, write: if request.auth != null;
    }
    match /projects/{projectId} {
      allow read, write: if request.auth != null;
      match /activities/{activityId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```
Tighten further as needed (e.g. an allow-list of `request.auth.token.email`, or per-document ownership).

---

## Migration from the old single-document layout

If you still have data in the old "everything in one document" format (e.g. a `tracker/main` document with `activeCp`, `checkpoints`, `colWidths`, `projects[]`), run this **one-time** migration. It reads the old document and writes the new normalized structure.

1. Open your **deployed app** (so Firebase is already initialized) in the browser.
2. Open **DevTools → Console**.
3. Paste and edit the snippet below — set `OLD_PATH` to your old document's path — then run it.

```js
// --- ONE-TIME MIGRATION: old single doc  ->  meta/config + projects + activities ---
import("https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js").then(async (FS) => {
  const { getFirestore, doc, getDoc, setDoc, writeBatch } = FS;
  const db = getFirestore();              // uses the app already initialized by the page

  const OLD_PATH = ["tracker", "main"];   // <-- change to your old collection/document
  const snap = await getDoc(doc(db, ...OLD_PATH));
  if (!snap.exists()) { console.error("Old document not found at", OLD_PATH); return; }
  const old = snap.data();

  // 1. settings
  await setDoc(doc(db, "meta", "config"), {
    activeCp:    old.activeCp || (old.checkpoints?.[old.checkpoints.length - 1]?.id ?? null),
    checkpoints: old.checkpoints || [],
    colWidths:   old.colWidths   || {}
  });

  // 2. projects + 3. activities
  let pOrder = 0;
  for (const p of (old.projects || [])) {
    const batch = writeBatch(db);
    const pid = p.id;
    batch.set(doc(db, "projects", pid), {
      name: p.name || "Untitled Project",
      desc: p.desc || "",
      hideProgress: !!p.hideProgress,
      order: pOrder++
    });
    let aOrder = 0;
    for (const a of (p.activities || [])) {
      batch.set(doc(db, "projects", pid, "activities", a.id), {
        name: a.name || "Activity",
        next: a.next || "",
        due:  a.due  || "",
        note: a.note || "",
        order: aOrder++,
        cps:  a.cps  || {}
      });
    }
    await batch.commit();
    console.log("Migrated project:", p.name);
  }
  console.log("✅ Migration complete. Reload the page.");
});
```

4. Reload the app — it now reads from the new structure.
5. Once you've confirmed everything is intact, delete the old document.

> Run this against a **copy/test project first** if you want to be cautious. The script only *writes* new documents; it never deletes the old one, so it's safe to re-run.
