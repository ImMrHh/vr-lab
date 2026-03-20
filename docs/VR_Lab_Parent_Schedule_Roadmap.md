# VR Lab — Parent-Facing Schedule Roadmap

**Project:** CUAM VR Lab Booking System  
**Feature:** Public schedule page for parents  
**Repo:** ImMrHh/vr-lab  
**Live app:** immrhh.github.io/vr-lab  
**Date drafted:** 2026-03-19  

---

## Overview

A read-only public page where parents can see when their child's group has a VR session and what the activity will be. Built on top of the existing Airtable + Cloudflare Workers stack — no new infrastructure required for phases 1 and 2.

---

## Phase 1 — Public read-only view
**Effort:** ~1–2 days | **New infrastructure:** none

### Goal
A publicly accessible page that lists confirmed VR bookings. Parents receive a link via the school's communication channels (WhatsApp, email, etc.).

### URL
`immrhh.github.io/vr-lab/schedule`  
New file: `schedule/index.html` in the same GitHub repo.

### What it shows
- Grupo
- Materia
- Fecha
- Hora
- Actividad

### How it works
1. On page load, call the Cloudflare Workers proxy (`vr-lab-proxy.6z5fznmp4m.workers.dev`) with a GET request.
2. Filter Airtable records where `Status = Confirmed`.
3. Render results as a clean list or weekly calendar view.
4. No login, no admin controls — fully read-only.

### Key decisions
- Reuses existing proxy — no CORS or auth changes needed.
- No sensitive data exposed (no PIN, no admin features).
- Deploy by adding `schedule/index.html` to the repo and pushing to `main`.

---

## Phase 2 — Group filter
**Effort:** ~1 day | **New infrastructure:** none (frontend-only)

### Goal
Let parents filter by their child's group so they only see relevant sessions.

### Features
- Dropdown or search input to select a grupo (e.g. 3A, 2B).
- Shareable URL with query parameter: `?grupo=3A` — applies filter automatically on load.
- Useful workflow: generate one link per grupo and distribute to each classroom's parent chat.

### Key decisions
- Groups are not sensitive data — no authentication needed.
- URL parameter approach means parents can bookmark their child's filtered view.

---

## Phase 3 — Email notifications (optional)
**Effort:** ~2–3 days | **New infrastructure:** new Airtable table

### Goal
Parents opt in to receive an email when a new VR session is booked for their child's group.

### How it works
1. Add a subscribe form to the schedule page (email + grupo).
2. Submissions are saved to a new Airtable table: `ParentSubs` (fields: `Email`, `Grupo`, `Active`).
3. When a new booking is created in `TablaVRLab`, an Airtable automation:
   - Looks up `ParentSubs` for matching grupo entries.
   - Sends a notification email to each subscriber with session details.

### Key decisions
- Build only after phases 1 and 2 are live and parent interest is confirmed.
- Airtable's native send-email action handles delivery — no external email service needed.
- Include an unsubscribe mechanism (set `Active = false` via a link or form).

---

## Stack summary

| Layer | Tool | Notes |
|---|---|---|
| Frontend | GitHub Pages | Same repo, new `schedule/` subfolder |
| Data | Airtable (`TablaVRLab`) | Filter `Status = Confirmed` |
| Proxy | Cloudflare Workers | Existing proxy, no changes |
| Notifications (P3) | Airtable automations | New `ParentSubs` table |

---

## Open questions
- Display format: list view vs weekly calendar grid? (Recommend list for Phase 1, calendar for Phase 2+)
- Should the schedule page be linked from the main admin app, or kept as a separate URL only shared externally?
- Phase 3: does the school's privacy policy allow storing parent emails in Airtable?

---

**Status:** 📌 Pinned — awaiting implementation approval.