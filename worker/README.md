# VR Lab Booking — Cloudflare Worker

This folder contains the **Cloudflare Worker source code** and supporting scripts for the VR Lab Booking proxy. The Worker is **deployed directly on Cloudflare** and is not served from GitHub Pages — this folder exists for version control and reference.

---

## Architecture Overview

```
Frontend (GitHub Pages)
      │
      │  GET / POST / PATCH
      ▼
Cloudflare Worker  ──────────────────────────────────────┐
      │                                                   │
      │  forward                                          │  mirror (async)
      ▼                                                   ▼
   Airtable API                                   SharePoint List
 (PRIMARY data source)                         (VRLabBookings — mirror)
```

**Phase A (current):** Airtable is the primary source of truth. Every successful write is also mirrored to the SharePoint `VRLabBookings` list. A SharePoint sync failure **never** breaks the frontend.

**Phase B (future):** Cut over to SharePoint as the primary source.

---

## Files

| File | Purpose |
|------|---------|
| `worker.js` | Cloudflare Worker — proxy + SharePoint sync |
| `setup-sharepoint-list.js` | One-time: creates `VRLabBookings` list on SharePoint |
| `migrate-airtable-to-sharepoint.js` | One-time: backfills all Airtable records to SharePoint |
| `README.md` | This file |

---

## 1 — Set Up Cloudflare Worker Secrets

In the Cloudflare Dashboard → **Workers & Pages** → `vr-lab-proxy` → **Settings** → **Variables and Secrets**, add:

| Name | Type | Value |
|------|------|-------|
| `AIRTABLE_TOKEN` | Secret | *(existing)* |
| `AZURE_TENANT_ID` | Secret | Your Azure AD tenant ID |
| `AZURE_CLIENT_ID` | Secret | Your Azure AD app client ID |
| `AZURE_CLIENT_SECRET` | Secret | Your Azure AD app client secret |
| `SHAREPOINT_SITE_URL` | Text | `univanglomex.sharepoint.com/sites/ceamvr` |

Click **Save and Deploy**.

---

## 2 — Create the SharePoint List (one-time)

Run this script once to create the `VRLabBookings` SharePoint list with all the correct columns:

```bash
AZURE_TENANT_ID=<your-tenant-id> \
AZURE_CLIENT_ID=<your-client-id> \
AZURE_CLIENT_SECRET=<your-client-secret> \
SHAREPOINT_SITE_URL=univanglomex.sharepoint.com/sites/ceamvr \
node worker/setup-sharepoint-list.js
```

Expected output:
```
Authenticating with Azure AD…
✓ Token obtained
Resolving site ID for univanglomex.sharepoint.com/sites/ceamvr…
✓ Site ID: univanglomex.sharepoint.com,...
Creating list "VRLabBookings"…
✓ List created successfully (id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)

Done! The VRLabBookings list is ready.
```

Re-running the script is safe — it will detect the existing list and do nothing.

---

## 3 — Migrate Existing Airtable Data (one-time)

After creating the list, backfill all existing Airtable bookings:

```bash
AIRTABLE_TOKEN=<your-airtable-token> \
AZURE_TENANT_ID=<your-tenant-id> \
AZURE_CLIENT_ID=<your-client-id> \
AZURE_CLIENT_SECRET=<your-client-secret> \
SHAREPOINT_SITE_URL=univanglomex.sharepoint.com/sites/ceamvr \
node worker/migrate-airtable-to-sharepoint.js
```

Optional env vars:
- `BATCH_SIZE` — items per batch (default: `10`)
- `BATCH_DELAY` — ms between batches (default: `500`)

Expected output:
```
=== VR Lab — Airtable → SharePoint Migration ===

Authenticating with Azure AD…
✓ Graph token obtained
Resolving SharePoint site…
✓ Site ID: ...
Resolving list "VRLabBookings"…
✓ List ID: ...

Fetching all Airtable records…
✓ Total records to migrate: 87

  [1/87] created: recXXXXXXXXXXXXXX (2025-09-05_P3)
  [2/87] created: recYYYYYYYYYYYYYY (2025-09-08_P1)
  ...

=== Migration complete ===
  Migrated: 87
  Errors:   0
```

---

## 4 — Deploy the Updated Worker

1. Copy the contents of `worker/worker.js`
2. In Cloudflare Dashboard → **Workers & Pages** → `vr-lab-proxy` → **Edit**
3. Paste the new code into the editor
4. Click **Deploy**

> **Tip:** If you use Wrangler CLI:
> ```bash
> wrangler deploy worker/worker.js --name vr-lab-proxy
> ```

---

## 5 — Phase B: Cut Over to SharePoint (future)

When you are confident the SharePoint mirror is accurate and complete, you can switch the Worker to use SharePoint as the primary source:

1. Update `worker.js` to read from the SharePoint list (Graph API GET) instead of Airtable.
2. Continue writing to both during a parallel-run period to verify consistency.
3. Once verified, remove the Airtable write path.
4. Update `SHAREPOINT_SITE_URL` and remove unused Airtable secrets.

See [`docs/SHAREPOINT_MIGRATION.md`](../docs/SHAREPOINT_MIGRATION.md) for the full cut-over plan and rollback strategy.

---

## Airtable → SharePoint Column Mapping

| Airtable field | SharePoint column | Type |
|----------------|-------------------|------|
| *(record id)* | `AirtableId` | Text |
| `Profesor` | `Profesor` | Text |
| `Grupo` | `Grupo` | Text |
| `Materia` | `Materia` | Text |
| `Fecha` | `Fecha` | Text |
| `Hora` | `Hora` | Text |
| `Actividad` | `Actividad` | Multiline text |
| `Aprendizaje esperado/producto` | `AprendizajeEsperado` | Multiline text |
| `Observaciones` | `Observaciones` | Multiline text |
| `Period` | `Period` | Text |
| `DayOfWeek` | `DayOfWeek` | Text |
| `WeekOffset` | `WeekOffset` | Number |
| `DayIndex` | `DayIndex` | Number |
| `SlotKey` | `SlotKey` | Text |
| `Status` | `Status` | Text |
