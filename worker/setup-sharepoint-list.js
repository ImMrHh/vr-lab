#!/usr/bin/env node
/**
 * setup-sharepoint-list.js
 *
 * One-time script that creates the VRLabBookings SharePoint list with all
 * columns matching the Airtable Bookings schema.
 *
 * Usage:
 *   AZURE_TENANT_ID=xxx \
 *   AZURE_CLIENT_ID=xxx \
 *   AZURE_CLIENT_SECRET=xxx \
 *   SHAREPOINT_SITE_URL=univanglomex.sharepoint.com/sites/ceamvr \
 *   node worker/setup-sharepoint-list.js
 *
 * Requires Node.js 18+ (native fetch) or node-fetch v3 installed.
 */

'use strict';

const LIST_NAME = 'VRLabBookings';

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return val;
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const tenantId     = requireEnv('AZURE_TENANT_ID');
  const clientId     = requireEnv('AZURE_CLIENT_ID');
  const clientSecret = requireEnv('AZURE_CLIENT_SECRET');
  const siteUrl      = requireEnv('SHAREPOINT_SITE_URL');

  console.log('Authenticating with Azure AD…');
  const token = await getGraphToken({ tenantId, clientId, clientSecret });
  console.log('✓ Token obtained');

  console.log(`Resolving site ID for ${siteUrl}…`);
  const siteId = await getSiteId(siteUrl, token);
  console.log(`✓ Site ID: ${siteId}`);

  const base = `https://graph.microsoft.com/v1.0/sites/${siteId}`;

  // Check if list already exists
  console.log(`Checking if list "${LIST_NAME}" already exists…`);
  const checkResp = await fetch(`${base}/lists/${LIST_NAME}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (checkResp.ok) {
    const existing = await checkResp.json();
    console.log(`✓ List already exists (id: ${existing.id}). Nothing to do.`);
    return;
  }

  if (checkResp.status !== 404) {
    const text = await checkResp.text();
    throw new Error(`List check error ${checkResp.status}: ${text}`);
  }

  // Create the list
  console.log(`Creating list "${LIST_NAME}"…`);
  const createResp = await fetch(`${base}/lists`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      displayName: LIST_NAME,
      list:        { template: 'genericList' },
      columns: [
        {
          name:        'AirtableId',
          description: 'Airtable record ID (rec…)',
          text:        { allowMultipleLines: false },
          indexed:     true,
        },
        {
          name:        'Profesor',
          description: 'Teacher name',
          text:        { allowMultipleLines: false },
        },
        {
          name:        'Grupo',
          description: 'Group code (101–305, 1A–3B)',
          text:        { allowMultipleLines: false },
        },
        {
          name:        'Materia',
          description: 'Subject name',
          text:        { allowMultipleLines: false },
        },
        {
          name:        'Fecha',
          description: 'Booking date (YYYY-MM-DD)',
          text:        { allowMultipleLines: false },
        },
        {
          name:        'Hora',
          description: 'Time range e.g. 7:20–8:10',
          text:        { allowMultipleLines: false },
        },
        {
          name:        'Actividad',
          description: 'Activity description',
          text:        { allowMultipleLines: true },
        },
        {
          name:        'AprendizajeEsperado',
          description: 'Expected learning outcome (Aprendizaje esperado/producto)',
          text:        { allowMultipleLines: true },
        },
        {
          name:        'Observaciones',
          description: 'Notes / cancellation reason',
          text:        { allowMultipleLines: true },
        },
        {
          name:        'Period',
          description: 'Period label (P1–P8)',
          text:        { allowMultipleLines: false },
        },
        {
          name:        'DayOfWeek',
          description: 'Full day name in Spanish',
          text:        { allowMultipleLines: false },
        },
        {
          name:   'WeekOffset',
          description: 'Week offset from current week',
          number: {},
        },
        {
          name:   'DayIndex',
          description: '0=Mon … 4=Fri',
          number: {},
        },
        {
          name:        'SlotKey',
          description: 'Unique key (YYYY-MM-DD_P#)',
          text:        { allowMultipleLines: false },
          indexed:     true,
        },
        {
          name:        'Status',
          description: 'Confirmed / Blocked / Cancelled',
          text:        { allowMultipleLines: false },
        },
      ],
    }),
  });

  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`List creation error ${createResp.status}: ${text}`);
  }

  const list = await createResp.json();
  console.log(`✓ List created successfully (id: ${list.id})`);
  console.log('\nDone! The VRLabBookings list is ready.');
}

main().catch(err => {
  console.error('\n✗ Error:', err.message || err);
  process.exit(1);
});
