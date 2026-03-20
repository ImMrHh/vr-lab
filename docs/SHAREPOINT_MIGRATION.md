# SharePoint Migration Guide

## Overview

This document describes the migration strategy for moving the VR Lab Booking System from **Airtable** to **SharePoint Lists** as the backend database.

The migration is split into two phases to minimise risk:

- **Phase A (complete):** Add a sync layer — every write to Airtable is also mirrored to SharePoint. Airtable remains the primary data source.
- **Phase B (future):** Cut over to SharePoint as the primary data source and retire the Airtable dependency.

---

## Why Migrate?

| Reason | Details |
|--------|---------|
| **Cost** | Airtable's free tier has row limits and API rate limits. SharePoint is included in the school's existing Microsoft 365 licence at no extra cost. |
| **Integration** | SharePoint integrates natively with Power BI, Excel Online, Power Automate, and Teams — tools already used by the school's IT department. |
| **Ownership** | Data stored in SharePoint is fully controlled by the school's IT administrator, not a third-party SaaS. |
| **Compliance** | The school's data governance policy requires student-related data to reside within the school's Microsoft 365 tenant. |
| **Long-term support** | Microsoft 365 has a contractual SLA; Airtable free-tier features can be removed without notice. |

---

## Phase A — Sync Layer (implemented)

### What was built

| File | Purpose |
|------|---------|
| `worker/worker.js` | Updated Cloudflare Worker: proxies Airtable API + mirrors writes to SharePoint |
| `worker/setup-sharepoint-list.js` | One-time script to create the `VRLabBookings` SharePoint list |
| `worker/migrate-airtable-to-sharepoint.js` | One-time script to backfill existing Airtable data |

### How it works

```
Frontend → Cloudflare Worker → Airtable (primary)
                             ↘ SharePoint VRLabBookings (mirror)
```

1. Every `POST` (new booking or block) calls Airtable first. On success, the same record is also `POST`ed to SharePoint.
2. Every `PATCH` (cancel or update) calls Airtable first. On success, the matching SharePoint item is `PATCH`ed.
3. If the SharePoint sync fails for any reason, **the Airtable operation still succeeds**. The error is logged to the Worker console but the frontend receives a normal success response.

### Setup steps

1. **Cloudflare secrets** — Add these to the `vr-lab-proxy` Worker:
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `SHAREPOINT_SITE_URL` = `univanglomex.sharepoint.com/sites/ceamvr`

2. **Create SharePoint list** (one-time):
   ```bash
   AZURE_TENANT_ID=xxx AZURE_CLIENT_ID=xxx AZURE_CLIENT_SECRET=xxx \
   SHAREPOINT_SITE_URL=univanglomex.sharepoint.com/sites/ceamvr \
   node worker/setup-sharepoint-list.js
   ```

3. **Backfill existing data** (one-time):
   ```bash
   AIRTABLE_TOKEN=xxx AZURE_TENANT_ID=xxx AZURE_CLIENT_ID=xxx \
   AZURE_CLIENT_SECRET=xxx \
   SHAREPOINT_SITE_URL=univanglomex.sharepoint.com/sites/ceamvr \
   node worker/migrate-airtable-to-sharepoint.js
   ```

4. **Deploy updated worker** — paste `worker/worker.js` into Cloudflare and deploy.

### Verification

After completing Phase A, verify the mirror is working:

- Make a test booking through the frontend.
- Open the SharePoint site → `VRLabBookings` list.
- Confirm the new item appears with matching field values.

---

## Phase B — Cut Over to SharePoint (future)

### Prerequisites

- Phase A sync has been running without errors for at least **two full school weeks**.
- The `VRLabBookings` list has been manually spot-checked for completeness and accuracy.
- IT team has been notified of the upcoming change.

### Cut-over steps

1. **Update the Worker** to read from the SharePoint Graph API instead of Airtable:
   - Replace the `GET` Airtable call with a Graph API call to the `VRLabBookings` list.
   - Keep Airtable as a secondary write target during a parallel-run period (optional).

2. **Parallel run** (recommended — 1 week):
   - The Worker reads from SharePoint.
   - Both Airtable and SharePoint are still written to.
   - Monitor for discrepancies.

3. **Remove Airtable**:
   - Remove Airtable write paths from the Worker.
   - Archive the Airtable base (keep as read-only backup for 6 months).
   - Remove `AIRTABLE_TOKEN` from Cloudflare secrets.

4. **Update documentation** to reflect SharePoint-only architecture.

### Estimated timeline

| Step | Duration |
|------|----------|
| Phase A running without errors | 2 weeks |
| Parallel run period | 1 week |
| Final cut-over and cleanup | 1 day |

---

## Rollback Strategy

### Phase A rollback

If the updated Worker causes any issues, roll back by:

1. In Cloudflare Dashboard → `vr-lab-proxy` → **Deployments**.
2. Click **Roll back** on the previous stable deployment.
3. The frontend will immediately revert to the original Airtable-only behaviour.
4. No data loss occurs — Airtable is still the primary source.

### Phase B rollback

If Phase B causes issues after the Airtable write paths have been removed:

1. Roll back the Worker deployment (see above).
2. Re-enable the Airtable token in Cloudflare secrets.
3. Run the migration script again to sync any changes made during the Phase B period back to Airtable (requires a reverse migration script — to be written before Phase B begins).

---

## Checklist

### Phase A

- [x] Azure AD app registered (`ceam-vr-sharepoint-sync`)
- [x] `Sites.ReadWrite.All` permission granted (admin consent)
- [x] Cloudflare secrets added: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `SHAREPOINT_SITE_URL`
- [x] `worker/setup-sharepoint-list.js` created
- [x] `worker/migrate-airtable-to-sharepoint.js` created
- [x] `worker/worker.js` updated with SharePoint sync
- [ ] SharePoint list created (run `setup-sharepoint-list.js`)
- [ ] Airtable data backfilled (run `migrate-airtable-to-sharepoint.js`)
- [ ] Updated Worker deployed to Cloudflare
- [ ] Sync verified with a test booking

### Phase B (future)

- [ ] Phase A running cleanly for 2+ weeks
- [ ] SharePoint list spot-checked for completeness
- [ ] IT team notified
- [ ] Worker updated to read from SharePoint
- [ ] Parallel run completed without errors
- [ ] Airtable removed from Worker
- [ ] Airtable base archived
- [ ] Cloudflare `AIRTABLE_TOKEN` secret removed
- [ ] Documentation updated

---

## SharePoint List Schema

**List name:** `VRLabBookings`  
**Site:** `univanglomex.sharepoint.com/sites/ceamvr`

| Column | Internal name | Type | Notes |
|--------|--------------|------|-------|
| Airtable ID | `AirtableId` | Text | Unique — used for upsert lookups (indexed) |
| Profesor | `Profesor` | Text | Teacher name |
| Grupo | `Grupo` | Text | Group code (101–305, 1A–3B) |
| Materia | `Materia` | Text | Subject |
| Fecha | `Fecha` | Text | `YYYY-MM-DD` |
| Hora | `Hora` | Text | e.g. `7:20–8:10` |
| Actividad | `Actividad` | Multiline text | Activity description |
| Aprendizaje esperado | `AprendizajeEsperado` | Multiline text | Expected learning outcome |
| Observaciones | `Observaciones` | Multiline text | Notes / cancellation reason |
| Period | `Period` | Text | `P1`–`P8` |
| DayOfWeek | `DayOfWeek` | Text | Full day name in Spanish |
| WeekOffset | `WeekOffset` | Number | Offset from current week |
| DayIndex | `DayIndex` | Number | `0`=Mon … `4`=Fri |
| SlotKey | `SlotKey` | Text | Unique key `YYYY-MM-DD_P#` (indexed) |
| Status | `Status` | Text | `Confirmed` / `Blocked` / `Cancelled` |

> **Note:** The built-in SharePoint `Title` column is left with a default placeholder value (`—`). All booking data is stored in the custom columns above.
