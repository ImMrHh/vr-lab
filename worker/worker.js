/**
 * VR Lab Booking Proxy — Cloudflare Worker
 *
 * Phase A: Airtable is the primary data source. Every successful write
 * (POST / PATCH) is also mirrored to a SharePoint list called VRLabBookings.
 *
 * Env secrets required:
 *   AIRTABLE_TOKEN        — Airtable personal access token
 *   AZURE_TENANT_ID       — Azure AD tenant ID
 *   AZURE_CLIENT_ID       — Azure AD app client ID
 *   AZURE_CLIENT_SECRET   — Azure AD app client secret
 *   SHAREPOINT_SITE_URL   — e.g. univanglomex.sharepoint.com/sites/ceamvr
 */

const BASE_ID    = 'appyuOuEaREVBhsUG';
const TABLE_NAME = 'Bookings';
const AIRTABLE   = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;
const SP_LIST    = 'VRLabBookings';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Module-level cache (lives for the Worker instance lifetime, ~1 h)
let _graphToken     = null;
let _graphTokenExp  = 0;
let _spSiteId       = null;   // cached SharePoint site GUID
let _spListId       = null;   // cached SharePoint list GUID

// ── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // ── Forward to Airtable ──────────────────────────────────────────────────
    let airtableUrl;
    let airtableOpts;

    if (request.method === 'GET') {
      airtableUrl = `${AIRTABLE}${url.search}`;
      airtableOpts = {
        headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` },
      };
    } else if (request.method === 'POST') {
      const body = await request.json();
      airtableUrl = AIRTABLE;
      airtableOpts = {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${env.AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: body.fields }),
      };
    } else if (request.method === 'PATCH') {
      const id   = url.searchParams.get('id');
      const body = await request.json();
      airtableUrl = `${AIRTABLE}/${id}`;
      airtableOpts = {
        method:  'PATCH',
        headers: {
          Authorization:  `Bearer ${env.AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: body.fields }),
      };
    } else {
      return new Response('Method Not Allowed', { status: 405, headers: CORS });
    }

    // Call Airtable
    const atResp = await fetch(airtableUrl, airtableOpts);
    const atBody = await atResp.text();

    // Build response to return to frontend
    const response = new Response(atBody, {
      status:  atResp.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

    // ── SharePoint mirror (true fire-and-forget via ctx.waitUntil) ──────────
    if (atResp.ok && (request.method === 'POST' || request.method === 'PATCH')) {
      try {
        const record = JSON.parse(atBody);
        // waitUntil keeps the Worker alive after the response is sent so
        // SharePoint sync does not delay the response to the frontend.
        ctx.waitUntil(
          syncToSharePoint(env, record).catch(err => {
            console.error('[SP sync error]', err.message || err);
          })
        );
      } catch (err) {
        // JSON parse failure — log and continue
        console.error('[SP sync parse error]', err.message || err);
      }
    }

    return response;
  },
};

// ── Graph API token (cached) ──────────────────────────────────────────────────

/**
 * Obtains (or returns cached) a Microsoft Graph API access token using the
 * OAuth2 client-credentials flow.
 *
 * @param {object} env  Cloudflare Worker env bindings
 * @returns {Promise<string>} Bearer token
 */
async function getGraphToken(env) {
  const now = Date.now();
  if (_graphToken && now < _graphTokenExp) return _graphToken;

  const tokenUrl =
    `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     env.AZURE_CLIENT_ID,
    client_secret: env.AZURE_CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
  });

  const resp = await fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph token error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  _graphToken    = data.access_token;
  // Expire the cached token 5 min before it actually expires (default 3600 s)
  _graphTokenExp = now + (data.expires_in - 300) * 1000;
  return _graphToken;
}

// ── SharePoint site ID (cached) ───────────────────────────────────────────────

/**
 * Resolves the SharePoint site GUID from the human-readable site URL stored in
 * the SHAREPOINT_SITE_URL env variable.
 *
 * @param {object} env
 * @param {string} token  Graph Bearer token
 * @returns {Promise<string>} Site GUID
 */
async function getSpSiteId(env, token) {
  if (_spSiteId) return _spSiteId;

  // SHAREPOINT_SITE_URL format: "tenant.sharepoint.com/sites/sitename"
  const siteUrl  = env.SHAREPOINT_SITE_URL;           // e.g. univanglomex.sharepoint.com/sites/ceamvr
  const [host, ...pathParts] = siteUrl.split('/');
  const sitePath = pathParts.join('/');               // sites/ceamvr

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${host}:/${sitePath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SP site lookup error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  _spSiteId = data.id;
  return _spSiteId;
}

// ── Ensure list exists ────────────────────────────────────────────────────────

/**
 * Resolves (or returns cached) the VRLabBookings SharePoint list GUID.
 * Creates the list if it doesn't exist yet.
 *
 * @param {object} env
 * @param {string} token  Graph Bearer token
 * @returns {Promise<string>} List GUID
 */
async function ensureSharePointList(env, token) {
  if (_spListId) return _spListId;

  const siteId = await getSpSiteId(env, token);
  const base   = `https://graph.microsoft.com/v1.0/sites/${siteId}`;

  // Try to GET the list first
  const getResp = await fetch(
    `${base}/lists/${SP_LIST}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (getResp.ok) {
    const data = await getResp.json();
    _spListId = data.id;
    return _spListId;
  }

  if (getResp.status !== 404) {
    const text = await getResp.text();
    throw new Error(`SP list lookup error ${getResp.status}: ${text}`);
  }

  // List doesn't exist — create it
  const createResp = await fetch(`${base}/lists`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      displayName: SP_LIST,
      list:        { template: 'genericList' },
      columns: [
        { name: 'AirtableId',           text:   {} },
        { name: 'Profesor',             text:   {} },
        { name: 'Grupo',                text:   {} },
        { name: 'Materia',              text:   {} },
        { name: 'Fecha',                text:   {} },
        { name: 'Hora',                 text:   {} },
        { name: 'Actividad',            text:   {} },
        { name: 'AprendizajeEsperado',  text:   {} },
        { name: 'Observaciones',        text:   {} },
        { name: 'Period',               text:   {} },
        { name: 'DayOfWeek',            text:   {} },
        { name: 'WeekOffset',           number: {} },
        { name: 'DayIndex',             number: {} },
        { name: 'SlotKey',              text:   {} },
        { name: 'Status',               text:   {} },
      ],
    }),
  });

  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`SP list creation error ${createResp.status}: ${text}`);
  }

  const data = await createResp.json();
  _spListId = data.id;
  return _spListId;
}

// ── Field mapping ─────────────────────────────────────────────────────────────

/**
 * Maps an Airtable record's fields to SharePoint list column values.
 *
 * @param {string} airtableId  Airtable record ID (rec…)
 * @param {object} fields      Airtable fields object
 * @returns {object}           SharePoint fields object
 */
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

// ── Sync entry point ──────────────────────────────────────────────────────────

/**
 * Creates or updates a SharePoint list item to mirror an Airtable record.
 * Any error thrown here will be caught by the caller and logged without
 * affecting the response sent to the frontend.
 *
 * @param {object} env             Cloudflare Worker env bindings
 * @param {object} airtableRecord  Full Airtable record (id + fields)
 */
async function syncToSharePoint(env, airtableRecord) {
  const token  = await getGraphToken(env);
  const siteId = await getSpSiteId(env, token);
  const listId = await ensureSharePointList(env, token);

  const base   = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}`;
  const spFields = mapFields(airtableRecord.id, airtableRecord.fields || {});

  // Check if a SharePoint item for this Airtable record already exists.
  // Escape single quotes in the ID to prevent OData filter injection.
  const safeId  = airtableRecord.id.replace(/'/g, "''");
  const filter  = encodeURIComponent(`fields/AirtableId eq '${safeId}'`);
  const findResp = await fetch(`${base}/items?$filter=${filter}&$select=id`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!findResp.ok) {
    const text = await findResp.text();
    throw new Error(`SP item lookup error ${findResp.status}: ${text}`);
  }

  const findData = await findResp.json();
  const existing = (findData.value || [])[0];

  if (existing) {
    // PATCH existing item
    const patchResp = await fetch(`${base}/items/${existing.id}/fields`, {
      method:  'PATCH',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(spFields),
    });
    if (!patchResp.ok) {
      const text = await patchResp.text();
      throw new Error(`SP item PATCH error ${patchResp.status}: ${text}`);
    }
  } else {
    // POST new item
    const postResp = await fetch(`${base}/items`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: spFields }),
    });
    if (!postResp.ok) {
      const text = await postResp.text();
      throw new Error(`SP item POST error ${postResp.status}: ${text}`);
    }
  }
}
