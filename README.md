# Project Tracker

A real-time, multi-user project tracker backed by **Firebase Cloud Firestore**, with Google sign-in, an admin-managed member list, @mentions, a notification bell, live presence, and read-only share links. Track projects, activities, periodic checkpoints, statuses, due dates and notes, with live sync across everyone who has the page open.

> by ACC ONE Product Management

---

## Features

- **Live multi-user sync** via Firestore `onSnapshot` listeners; changes appear instantly for everyone.
- **Google sign-in + member gating.** Only emails present in the `members` collection can open the app. Admins manage the list from the **Members** button in the top bar.
- **View-only share links (v2.4).** Append `?view=1` to the URL to let anyone open the tracker with no sign-in and zero edit ability. See [View-only links](#view-only-links).
- **@mentions + notifications (v2.4).** Type `@` in any Work Item, Next Action or Note field to mention a teammate. They get a bell notification with a red dot for anything unread.
- **Live presence (v2.4).** Avatars of members currently online appear in the top bar, Google-Docs style.
- **Checkpoints.** Capture the state of every activity "as of" a date; collapse old ones, mark one active, import the previous checkpoint's values when adding a new one.
- **Inline rich-text editing.** Bold, italic, underline, strikethrough, lists and super/subscript on Work Item, Next Action and Notes.
- **Status pills.** Backlog, On Progress, Done, Cancelled, Paused.
- **Per-project progress.** Automatic completion bar and status counts for the active checkpoint.
- **Frozen columns + resizable headers.** No./Project/Activities stay pinned while you scroll; drag any header border to resize (widths persist).
- **Drag-to-reorder** activities, **Excel export** via JSZip, and an **offline cache** with a Live / Offline (cached) / Offline badge.

---

## Tech stack

| Layer    | Choice |
|----------|--------|
| Frontend | Vanilla JS (ES modules), no build step |
| Backend  | Firebase Cloud Firestore (`v12.14.0` via gstatic CDN) |
| Auth     | Firebase Authentication (Google sign-in) |
| Export   | JSZip (OOXML `.xlsx` generation) |
| Hosting  | Netlify (auto-deploy from GitHub) |

There is **no build step**. The app is three static files.

---

## Project structure

```
.
├── index.html        # Markup + auth screens + topbar shell
├── tracker.css       # All styles
├── tracker.js        # All behavior (Firebase, auth, render, features)
├── firestore.rules   # Security rule options (dev + production)
├── README.md         # This file
└── FIRESTORE.md      # Data model, rules, indexes, migration guide
```

Mental model for edits: `index.html` is rarely touched, `tracker.css` is for visual changes, `tracker.js` is for behavior. Replacing any of these on GitHub never touches data, all data lives in Firestore. The only sensitive value to preserve is the `firebaseConfig` block at the top of `tracker.js`.

---

## Setup

### 1. Firebase project
In the [Firebase Console](https://console.firebase.google.com/), create or open a project and enable **Cloud Firestore** (not Realtime Database).

### 2. Web app config
In **Project settings > Your apps > Web app**, copy the config object into the `firebaseConfig` block near the top of `tracker.js`. These values are not secrets; access is controlled by Security Rules, not by hiding the config.

### 3. Enable Google sign-in
**Authentication > Sign-in method > Google > Enable.** Then under **Authentication > Settings > Authorized domains**, add your deployment domain (your Netlify URL).

### 4. Bootstrap the first admin
No member-management UI exists until at least one admin exists, so add the first one by hand:
**Firestore > Data > Start collection** named `members`, document ID = your email, fields:

```
role: "admin"   (string)
```

### 5. Deploy security rules
Open **Firestore > Rules** and paste a block from [`firestore.rules`](./firestore.rules). Block **(D)** is the v2.4 recommendation: public read (so view-only links work), membership-gated writes, plus rules for notifications and presence. If you do not want public viewing, switch the `allow read: if true;` lines to `allow read: if isMember();` (this also disables `?view=1`).

> The app also runs on the wide-open dev block (A), but that leaves your database writable by anyone with the config. Deploy block (D) before sharing anything.

---

## View-only links

Share the page with `?view=1` on the end of the URL, for example:

```
https://your-app.netlify.app/?view=1
```

Visitors in this mode:
- do **not** sign in,
- see the full tracker live (it keeps syncing),
- cannot edit, add, delete, reorder, resize, change status, or manage members.

This works because the recommended rules allow public **read** of the tracker data. Anyone with the link can view it, so treat a view link as public. They still cannot write anything, and they cannot read the member list, notifications or presence of others.

---

## @mentions and notifications

- While editing a Work Item, Next Action or Note, type `@` and start a name or email. Pick a teammate from the popup (arrow keys + Enter, or click).
- A mention chip is inserted and, when you save the field, a notification is created for that person.
- Each member sees a bell in the top bar. A red dot means there is something unread. Opening the bell marks everything read.
- Notifications are stored in the `notifications` collection and are only readable by their recipient.

---

## Presence

Each signed-in member writes a heartbeat to `presence/{email}` every 20 seconds. Anyone seen in the last 45 seconds shows as an avatar in the top bar. Closing the tab removes the entry.

---

## Data model (short version)

```
members/{email}                                  role, addedAt, addedBy, name
meta/config                                      activeCp, checkpoints[], colWidths{}
projects/{projectId}                             name, desc, hideProgress, order
projects/{projectId}/activities/{activityId}     name, next, due, note, order, cps{}
notifications/{id}                               toEmail, fromEmail, text, field, projectName, activityName, createdAt, read
presence/{email}                                 email, name, color, lastActive
```

Full field reference, rules and the migration guide from the old single-document layout are in **[FIRESTORE.md](./FIRESTORE.md)**.

---

## Version history

- **v2.4** : View-only share links (`?view=1`), @mentions with a notification bell (red dot on unread), live presence avatars, and a consistent gap above the header row with cleaner scroll occlusion. Split confirmed across `index.html` / `tracker.css` / `tracker.js`.
- **v2.3** : Google sign-in, `members` collection with admin-managed access, rich-text editing, Paused status, drag-to-reorder, Excel export.
- **v2.0** : Migrated from a single Firestore document to a normalized `meta` + `projects` + `activities` model. Connection badge, offline cache, empty/loading states.
- **v1.x** : Single-file tracker storing the full app state in one document (and earlier, `localStorage`).
