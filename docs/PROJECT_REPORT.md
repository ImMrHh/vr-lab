# VR Lab Booking System — Project Report & Roadmap

**Repository:** [ImMrHh/vr-lab](https://github.com/ImMrHh/vr-lab)
**Date:** March 19, 2026
**Author:** Henrik (ImMrHh)
**Backup Branch:** `backup/2026-03-19-stable` → commit `44d26b0`

---

## 📋 Executive Summary

The VR Lab Booking System is a lightweight, browser-based scheduling application for the CEAM (Centro Educativo) Virtual Reality laboratory. It allows teachers to reserve VR lab time slots through a weekly calendar interface, managed by a lab coordinator (admin). The system uses Airtable as its backend database via a Cloudflare Workers proxy, and is deployed as a static site with Progressive Web App (PWA) support.

---

## 🏗️ Architecture

| Component | Technology |
|-----------|-----------|
| **Frontend** | Vanilla JavaScript, HTML5, CSS3 (no frameworks) |
| **Backend/Database** | Airtable (via REST API) |
| **Proxy** | Cloudflare Workers (`vr-lab-proxy.6z5fznmp4m.workers.dev`) |
| **Hosting** | GitHub Pages (static) |
| **PWA** | Service Worker (`sw.js`) with offline caching |
| **Version Control** | GitHub (`ImMrHh/vr-lab`) |

### File Structure

```
vr-lab/
├── app.js          # Main application logic (~31 KB)
├── index.html      # Single-page HTML structure
├── style.css       # Complete styling with dark mode support
├── sw.js           # Service Worker v2 (cache-first strategy)
├── manifest.json   # PWA manifest
├── icon.svg        # App icon
├── tests/          # Unit tests
└── docs/
    └── PROJECT_REPORT.md  # This file
```

---

## ✅ Work Completed (March 19, 2026)

All work was completed in a single day through 11 pull requests, progressing from critical bug fixes to feature enhancements.

### Phase 1 — Critical Fixes

#### PR #1 · Fix XSS, stale slot keys, PM times, block UI, and keyboard UX
- **XSS Protection:** Added HTML escaping (`esc()` function) for all user-generated content
- **SlotKey Fix:** Corrected date-based slot keys that were stale/incorrect
- **PM Time Parsing:** Fixed time calculations for afternoon periods (P7, P8)
- **Block UI:** Fixed UI for blocked slot rendering
- **Keyboard Support:** Added full keyboard navigation (number keys for PIN, Escape to close modals, Backspace for delete)

#### PR #2 · Race-condition booking prevention, font scaling, brand rename, slot color contrast
- **Conflict Detection:** Added `checkConflict()` that queries Airtable before saving to prevent double-bookings
- **Font Scaling:** Increased readability across all text elements
- **Brand Update:** Renamed header to "Realidad Virtual — CEAM Booking Calendar"
- **Visual Contrast:** Improved color distinction between booked, teaching, and blocked slots

### Phase 2 — Calendar Enhancements

#### PR #3 · Visual distinction for unavailable slots, holiday updates, school year end cap
- **Past Slot Styling:** Diagonal stripe pattern (`repeating-linear-gradient`) for past periods
- **Holiday Calendar:** Complete 2025–2026 school year holidays including Christmas break (Dec 22–Jan 9) and Easter break (Apr 1–10)
- **School Year End:** Hard cap at July 15, 2026 (`SCHOOL_END`) — slots beyond this date are automatically disabled
- **Helper Function:** Added `isPastSchoolEnd()` for boundary checking

#### PR #4 · Remove 30-day booking cap + cascading teacher/subject/group dropdowns
- **Booking Cap Removed:** Eliminated the previous 30-day-ahead restriction — admin can now book any future date within the school year
- **Teacher Data:** Added complete `TEACHER_DATA` object with 21 teachers, their subjects, and assigned groups (101–305, 1A–3B, Robótica)
- **Cascading Dropdowns:** Teacher → Subject → Group selection with automatic population
  - Selecting a teacher populates their subjects
  - Selecting a subject populates their assigned groups
  - Single-option fields auto-select

#### PR #5 · "Hoy" button, mobile responsiveness, and hover tooltips
- **Today Button:** Added "Hoy" quick-navigation button in the week navigation bar
- **Mobile Responsive:** Grid scales properly on smaller screens
- **Tooltips:** Hover tooltips on booked slots showing teacher/group/subject details

#### PR #6 · Fix missing "Hoy" button in week navigation
- **Button Fix:** Ensured the "Hoy" button renders correctly in all states
- **State Management:** Added `at-today` class when already viewing current week (grayed-out state)
- **`updateTodayBtn()`:** New function to sync button state with `weekOff` value

### Phase 3 — UI/UX Polish

#### PR #7 · Dark mode toggle
- **Dark Theme:** Complete `[data-theme="dark"]` CSS ruleset covering all components
- **Toggle Button:** 🌙/☀️ toggle in the top bar
- **Persistence:** Theme preference saved in `localStorage` (`vr-dark-mode`)
- **Flash Prevention:** Inline `<script>` in `<head>` applies dark mode before paint

#### PR #8 · Admin dashboard stats tab (📊 Estadísticas)
- **Stats View:** New "Estadísticas" tab (admin-only) with 6 stat cards:
  - Reservations this week (with delta vs. last week)
  - Reservations this month
  - Usage rate (percentage bar)
  - Blocked slots count
  - Top 5 teachers this month (ranked list)
  - Busiest day of the week
- **Helper Functions:** `getWeekBookings()`, `getMonthBookings()`, `getUsageRate()`, `getTopTeachers()`, `getBusiestDay()`

### Phase 4 — Production Hardening

#### PR #9 · Styled confirmation dialogs, PWA/offline support, unit tests
- **Confirmation Dialogs:** Custom modal (`showConfirmDialog()`) replacing native `confirm()` — styled with danger/primary variants
- **PWA Support:**
  - `sw.js` — Service Worker with cache-first strategy for static assets
  - `manifest.json` — Web App Manifest for installability
  - Offline/online event handlers with toast notifications
- **Unit Tests:** Test suite in `tests/` directory
- **CSV Export:** "⬇ Exportar Excel" button generating UTF-8 CSV with BOM for proper Excel encoding

#### PR #10 · (Closed without merge — superseded by PR #11)
- Attempted fix for "Hoy" button and cancellation reason — replaced by more complete PR #11

#### PR #11 · Fix stale SW cache, add cancellation reason modal, wire cancelOnServer to Observaciones
- **SW Cache Bust:** Bumped cache name from `vr-lab-v1` to `vr-lab-v2` — old caches auto-deleted on activation
- **Cancel Reason Modal:** New textarea in the cancellation confirmation dialog for entering a reason
- **Observaciones Field:** Cancellation reason written to the Airtable `Observaciones` field via `proxyPatch()`
- **Enter Key Support:** Pressing Enter in the confirmation dialog triggers the action button

---

## 📊 Current Feature Set

| Feature | Status |
|---------|--------|
| Weekly calendar grid (Mon–Fri, P1–P8) | ✅ Live |
| Admin PIN authentication (4-digit) | ✅ Live |
| Booking creation with teacher/subject/group dropdowns | ✅ Live |
| Booking cancellation with reason | ✅ Live |
| Slot blocking/unblocking (right-click) | ✅ Live |
| Race-condition conflict detection | ✅ Live |
| Teaching periods auto-blocked (coordinator schedule) | ✅ Live |
| Holiday calendar (2025–2026 school year) | ✅ Live |
| School year end cap (July 15, 2026) | ✅ Live |
| Past period visual distinction (striped) | ✅ Live |
| Dark mode with persistence | ✅ Live |
| Admin stats dashboard | ✅ Live |
| CSV export for Excel | ✅ Live |
| PWA / offline support | ✅ Live |
| Keyboard navigation (PIN, Escape, Enter) | ✅ Live |
| XSS protection (HTML escaping) | ✅ Live |
| Mobile-responsive layout | ✅ Live |

---

## 🗺️ Roadmap

### Phase 5 — Excel Automation (Pending IT Approval) 🔒

> **Status:** Awaiting IT department approval

**Goal:** Automate the export of booking data directly to Excel/SharePoint, removing the need for manual CSV downloads.

#### Option A — Microsoft Power Automate (Recommended)
- **Trigger:** Airtable webhook on new/updated record
- **Flow:** Airtable → Power Automate → Excel Online (SharePoint)
- **Pros:** No code required, IT-managed, audit trail built in
- **Requirements from IT:**
  - SharePoint site/document library access
  - Power Automate license (included in most Microsoft 365 plans)
  - Airtable API key provisioning

#### Option B — Cloudflare Worker Extension
- Extend the existing proxy worker to push data to Microsoft Graph API
- **Pros:** No additional services needed
- **Cons:** Requires Graph API credentials, more complex error handling

#### Option C — Scheduled Airtable Sync
- Use Airtable's built-in automations to push to Google Sheets/Excel on a schedule
- **Pros:** Simple setup
- **Cons:** Not real-time, limited customization

#### Deliverables (once approved):
- [ ] IT provides SharePoint endpoint and credentials
- [ ] Implement chosen integration method
- [ ] Auto-populate Excel template with columns: GRUPO, MATERIA, FECHA, HORA, Actividad, PROFESOR, Aprendizaje esperado/producto, Observaciones
- [ ] Test with 2-week pilot period
- [ ] Full deployment

### Phase 6 — Potential Future Enhancements

| Feature | Priority | Description |
|---------|----------|-------------|
| Email notifications | Medium | Notify teachers when their booking is confirmed/cancelled |
| Recurring bookings | Medium | Allow weekly recurring reservations |
| Teacher self-service | Low | Teachers can request bookings (admin approves) |
| Usage reports | Low | Monthly PDF reports auto-generated |
| Multi-lab support | Low | Extend to support additional labs/rooms |
| QR code check-in | Low | Generate QR for each booking, scan on arrival |
| Academic calendar sync | Low | Auto-import holidays from SEP calendar |
| Audit log | Medium | Track all admin actions with timestamps |

---

## 🔧 Technical Notes

### Airtable Schema (Current Fields)
| Field | Type | Description |
|-------|------|-------------|
| Profesor | Text | Teacher name |
| Grupo | Text | Group code (101–305, 1A–3B) |
| Materia | Text | Subject name |
| Fecha | Date | Booking date (YYYY-MM-DD) |
| Hora | Text | Time range (e.g., "7:20–8:10") |
| Actividad | Long text | Activity description |
| Aprendizaje esperado/producto | Long text | Expected learning outcome |
| Observaciones | Long text | Notes / cancellation reason |
| Period | Text | Period label (P1–P8) |
| DayOfWeek | Text | Full day name in Spanish |
| WeekOffset | Number | Week offset from current week |
| DayIndex | Number | 0=Mon, 4=Fri |
| SlotKey | Text | Unique key (`YYYY-MM-DD_P#`) |
| Status | Text | `Confirmed`, `Cancelled`, or `Blocked` |

### Service Worker Strategy
- **Cache Name:** `vr-lab-v2`
- **Cached Assets:** `index.html`, `app.js`, `style.css`, `manifest.json`, `icon.svg`
- **Strategy:** Cache-first for listed assets, network-first for API calls
- **Cleanup:** Old caches (`v1`) auto-deleted on SW activation

### Security
- Admin access via 4-digit PIN (client-side only — suitable for low-security school environment)
- HTML escaping on all rendered user content
- Cloudflare Workers proxy hides Airtable API credentials from the client

---

## 📦 Backup & Recovery

| Backup | Branch/Commit |
|--------|---------------|
| Stable snapshot (2026-03-19) | `backup/2026-03-19-stable` → `44d26b0` |

**To restore:** Reset `main` to the backup branch if needed:
```bash
git checkout main
git reset --hard backup/2026-03-19-stable
git push --force origin main
```

---

*Generated on March 19, 2026 · VR Lab Booking System v1.0*