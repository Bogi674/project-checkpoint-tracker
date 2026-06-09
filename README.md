# Project Tracker

A real-time, multi-user project tracker built as a single self-contained HTML file, backed by **Firebase Cloud Firestore**. Track projects, activities, periodic checkpoints, statuses, due dates and notes — with live sync across everyone who has the page open.

> by ACC ONE Product Management

---

## Features

- **Live multi-user sync** — changes appear instantly for everyone via Firestore `onSnapshot` listeners.
- **Checkpoints** — capture the state of every activity "as of" a date; collapse old ones, mark one active, import the previous checkpoint's values when adding a new one.
- **Inline editing** — click any cell (project name, description, work item, next action, due date, note) to edit in place.
- **Status pills** — cycle Backlog → On Progress → Done → Cancelled with one click.
- **Per-project progress** — automatic completion bar and status counts for the active checkpoint.
- **Frozen columns + resizable headers** — No./Project/Activities stay pinned while you scroll; drag any header border to resize (widths persist).
- **Excel export** — genuine `.xlsx` (colours, merged cells, borders) with an HTML `.xls` fallback when offline.
- **Offline cache** — works without a connection and re-syncs automatically; a badge in the top bar shows **Live / Offline (cached) / Offline** status.

---

## Tech stack

| Layer    | Choice |
|----------|--------|
| Frontend | Vanilla JS (ES modules), no build step |
| Backend  | Firebase Cloud Firestore (`v12.14.0` via gstatic CDN) |
| Export   | JSZip (OOXML `.xlsx` generation) |
| Hosting  | Netlify and/or GitHub Pages (static) |

There is **no build step**. The whole app is one `index.html`.

---

## Setup

### 1. Create / open a Firebase project
Go to the [Firebase Console](https://console.firebase.google.com/) and create a project (or use your existing one). Enable **Cloud Firestore** (not Realtime Database).

### 2. Add your web app config
In **Project settings → Your apps → Web app**, copy the config object and paste it into `index.html`, replacing the placeholder block near the top of the `<script type="module">`:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

> These values are **not secrets** — Firebase web config is meant to be public. Access is controlled by **Security Rules**, not by hiding the config.

### 3. Set Firestore security rules
Open **Firestore → Rules**. For quick development use the permissive rules in [`firestore.rules`](./firestore.rules). **Before going to production**, switch to the hardened version in the same file (see [FIRESTORE.md](./FIRESTORE.md#security-rules)).

### 4. Run it
Open `index.html` in a browser, or deploy (below). On first run the app creates a `meta/config` document with one starting checkpoint and **no projects** — click **Add Project** to begin.

---

## Deploy

### Netlify
Drag the folder onto the Netlify dashboard, or connect the GitHub repo. No build command; publish directory is the repo root.

### GitHub Pages
Push to GitHub → **Settings → Pages** → deploy from the `main` branch, root folder. Your app will be at `https://<user>.github.io/<repo>/`.

> Whichever host you use, add its domain under **Firebase Console → Authentication → Settings → Authorized domains** if you later add Firebase Auth.

---

## Data model (short version)

The app does **not** store everything in one document. It uses a normalized structure so a single edit writes a single document:

```
meta/config
projects/{projectId}
projects/{projectId}/activities/{activityId}
```

Full reference, field definitions, security rules and the migration guide from the old single-document layout are in **[FIRESTORE.md](./FIRESTORE.md)**.

---

## Project structure

```
.
├── index.html        # The entire app (HTML + CSS + JS module, self-contained)
├── firestore.rules   # Dev + production security rules
├── README.md         # This file
└── FIRESTORE.md      # Data model, rules, indexes, migration guide
```

---

## Version history

- **v2.0** — Migrated from a single Firestore document to a normalized `meta` + `projects` + `activities` subcollection model. Added connection-status badge, offline persistent cache, empty/loading states. Removed all seed/demo data.
- **v1.x** — Single-file tracker storing the full app state in one document (and earlier, `localStorage`).
