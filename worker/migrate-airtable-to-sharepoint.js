#!/usr/bin/env node
/**
 * migrate-airtable-to-sharepoint.js
 *
 * One-time migration script: reads ALL records from Airtable (using
 * pagination) and creates corresponding items in the SharePoint VRLabBookings
 * list.
 *
 * Usage:
 *   AIRTABLE_TOKEN=xxx \
 *   AZURE_TENANT_ID=xxx \
 *   AZURE_CLIENT_ID=xxx \
 *   AZURE_CLIENT_SECRET=xxx \
 *   SHAREPOINT_SITE_URL=univanglomex.sharepoint.com/sites/ceamvr \
 *   node worker/migrate-airtable-to-sharepoint.js
 *
 * Requires Node.js 18+ (native fetch).
 *
 * Options (via env vars):
 *   BATCH_SIZE   — number of SP items to POST per batch (default: 10)
 *   BATCH_DELAY  — ms to wait between batches (default: 500)
 */

'use strict';

const BASE_ID    = 'appyuOuEaREVBhsUG';
const TABLE_NAME = 'Bookings';
const AIRTABLE   = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;
const LIST_NAME  = 'VRLabBookings';

const BATCH_SIZE  = parseInt(process.env.BATCH_SIZE  || '10',  10);
const BATCH_DELAY = parseInt(process.env.BATCH_DELAY || '500', 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return val;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getGraphToken({ tenantId, clientId, clientSecret }) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'https://graph.microsoft.com/.default',
  });

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return data.access_token;
}

async function getSiteId(siteUrl, token) {
  const [host, ...pathParts] = siteUrl.split('/');
  const sitePath = pathParts.join('/');

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${host}:/${sitePath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Site lookup error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return data.id;
}

async function getListId(siteId, token) {
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${LIST_NAME}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `List lookup error ${resp.status}: ${text}\n` +
      `Run worker/setup-sharepoint-list.js first to create the list.`
    );
  }

  const data = await resp.json();
  return data.id;
}

// ── Airtable pagination ───────────────────────────────────────────────────────

async function fetchAllAirtableRecords(token) {
  const records = [];
  let offset    = '';

  do {
    const url = offset
      ? `${AIRTABLE}?pageSize=100&offset=${encodeURIComponent(offset)}`
      : `${AIRTABLE}?pageSize=100`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Airtable fetch error ${resp.status}: ${text}`);
    }

    const data = await resp.json();
    records.push(...(data.records || []));
    offset = data.offset || '';
    process.stdout.write(`  Fetched ${records.length} records…\r`);
  } while (offset);

  return records;
}

// ── Field mapping ─────────────────────────────────────────────────────────────

function mapFields(airtableId, fields) {
  return {
    AirtableId:          airtableId,
    Profesor:            fields.Profesor            || '',
    Grupo:               fields.Grupo               || '',
    Materia:             fields.Materia             || '',
    Fecha:               fields.Fecha               || '',
    Hora:                fields.Hora                || '',
    Actividad:           fields.Actividad           || '',
    AprendizajeEsperado: fields['Aprendizaje esperado/producto'] || '',
    Observaciones:       fields.Observaciones       || '',
    Period:              fields.Period              || '',
    DayOfWeek:           fields.DayOfWeek           || '',
    WeekOffset:          fields.WeekOffset          ?? null,
    DayIndex:            fields.DayIndex            ?? null,
    SlotKey:             fields.SlotKey             || '',
    Status:              fields.Status              || '',
  };
}

// ── SharePoint upsert ─────────────────────────────────────────────────────────

/**
 * Looks up whether a SharePoint item with the given AirtableId already exists.
 * Returns the existing SP item id or null.
 */
async function findSpItem(base, airtableId, token) {
  const filter = encodeURIComponent(`fields/AirtableId eq '${airtableId}'`);
  const resp = await fetch(`${base}/items?$filter=${filter}&$select=id`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SP item lookup error ${resp.status}: ${text}`);
  }

  const data  = await resp.json();
  const found = (data.value || [])[0];
  return found ? found.id : null;
}

async function upsertSpItem(base, record, token) {
  const spFields  = mapFields(record.id, record.fields || {});
  const existingId = await findSpItem(base, record.id, token);

  if (existingId) {
    // Update existing item
    const resp = await fetch(`${base}/items/${existingId}/fields`, {
      method:  'PATCH',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(spFields),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`SP PATCH error ${resp.status}: ${text}`);
    }
    return 'updated';
  } else {
    // Create new item
    const resp = await fetch(`${base}/items`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: spFields }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`SP POST error ${resp.status}: ${text}`);
    }
    return 'created';
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const airtableToken = requireEnv('AIRTABLE_TOKEN');
  const tenantId      = requireEnv('AZURE_TENANT_ID');
  const clientId      = requireEnv('AZURE_CLIENT_ID');
  const clientSecret  = requireEnv('AZURE_CLIENT_SECRET');
  const siteUrl       = requireEnv('SHAREPOINT_SITE_URL');

  console.log('=== VR Lab — Airtable → SharePoint Migration ===\n');

  // Auth
  console.log('Authenticating with Azure AD…');
  const graphToken = await getGraphToken({ tenantId, clientId, clientSecret });
  console.log('✓ Graph token obtained');

  // Site + list IDs
  console.log(`Resolving SharePoint site: ${siteUrl}…`);
  const siteId = await getSiteId(siteUrl, graphToken);
  console.log(`✓ Site ID: ${siteId}`);

  console.log(`Resolving list "${LIST_NAME}"…`);
  const listId = await getListId(siteId, graphToken);
  console.log(`✓ List ID: ${listId}`);

  const base = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}`;

  // Fetch all Airtable records
  console.log('\nFetching all Airtable records…');
  const records = await fetchAllAirtableRecords(airtableToken);
  console.log(`\n✓ Total records to migrate: ${records.length}`);

  if (records.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  // Process in batches
  let migrated = 0;
  let errors   = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async record => {
        try {
          const action = await upsertSpItem(base, record, graphToken);
          migrated++;
          console.log(
            `  [${migrated + errors}/${records.length}] ${action}: ${record.id} (${record.fields?.SlotKey || record.fields?.Fecha || '—'})`
          );
        } catch (err) {
          errors++;
          console.error(
            `  [${migrated + errors}/${records.length}] ERROR for ${record.id}: ${err.message}`
          );
        }
      })
    );

    // Rate-limit pause between batches (skip after last batch)
    if (i + BATCH_SIZE < records.length) {
      await sleep(BATCH_DELAY);
    }
  }

  console.log('\n=== Migration complete ===');
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Errors:   ${errors}`);

  if (errors > 0) {
    console.warn('\nSome records failed to migrate. Check the errors above and re-run if needed.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message || err);
  process.exit(1);
});
