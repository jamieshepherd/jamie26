const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
};

const json = (value, init = {}) => new Response(JSON.stringify(value), {
  ...init,
  headers: { ...JSON_HEADERS, ...(init.headers || {}) },
});

const errorMessage = (error) => error instanceof Error ? error.message : String(error);
const boundedInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

const readSyncState = async (env, source) => env.DB
  .prepare('SELECT source, cursor, backfill_complete, last_synced_at, last_error FROM sync_state WHERE source = ?')
  .bind(source)
  .first();

const writeSyncState = async (env, source, cursor, backfillComplete, lastError = null) => {
  await env.DB.prepare(`
    INSERT INTO sync_state (source, cursor, backfill_complete, last_synced_at, last_error)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source) DO UPDATE SET
      cursor = excluded.cursor,
      backfill_complete = excluded.backfill_complete,
      last_synced_at = excluded.last_synced_at,
      last_error = excluded.last_error
  `).bind(
    source,
    cursor || null,
    backfillComplete ? 1 : 0,
    new Date().toISOString(),
    lastError,
  ).run();
};

const recordSyncError = async (env, source, error) => {
  const state = await readSyncState(env, source);
  await writeSyncState(
    env,
    source,
    state?.cursor || null,
    Boolean(state?.backfill_complete),
    errorMessage(error).slice(0, 500),
  );
};

const storeSignals = async (env, signals) => {
  if (!signals.length) return 0;
  const statement = env.DB.prepare(`
    INSERT INTO signals (id, source, source_id, created_at, text, url)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      created_at = excluded.created_at,
      text = excluded.text,
      url = excluded.url
  `);
  await env.DB.batch(signals.map((signal) => statement.bind(
    `${signal.source}:${signal.sourceId}`,
    signal.source,
    signal.sourceId,
    signal.createdAt,
    signal.text,
    signal.url,
  )));
  return signals.length;
};

const fetchBlueskyPage = async (actor, cursor) => {
  const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed');
  url.searchParams.set('actor', actor);
  url.searchParams.set('limit', '100');
  url.searchParams.set('filter', 'posts_no_replies');
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Bluesky returned ${response.status}`);
  return response.json();
};

const normalizeBluesky = (feed, actor) => feed.flatMap((item) => {
  const post = item.post;
  const record = post?.record;
  if (!post || !record?.text || item.reason || record.reply) return [];
  if (post.author?.handle !== actor && post.author?.did !== actor) return [];
  const sourceId = post.uri?.split('/').at(-1);
  const date = new Date(record.createdAt || post.indexedAt);
  if (!sourceId || Number.isNaN(date.valueOf())) return [];
  return [{
    source: 'bluesky',
    sourceId,
    createdAt: date.toISOString(),
    text: record.text,
    url: `https://bsky.app/profile/${post.author.handle}/post/${sourceId}`,
  }];
});

const syncBluesky = async (env, pageLimit) => {
  const actor = env.BLUESKY_ACTOR || 'jamie.sh';
  const state = await readSyncState(env, 'bluesky');
  let cursor = state?.cursor || null;
  let backfillComplete = Boolean(state?.backfill_complete);
  let pages = 0;
  let received = 0;

  if (cursor) {
    const latest = await fetchBlueskyPage(actor, null);
    received += await storeSignals(env, normalizeBluesky(latest.feed || [], actor));
  }

  if (backfillComplete) {
    if (!cursor) {
      const latest = await fetchBlueskyPage(actor, null);
      received += await storeSignals(env, normalizeBluesky(latest.feed || [], actor));
    }
  } else {
    while (pages < pageLimit) {
      const page = await fetchBlueskyPage(actor, cursor);
      received += await storeSignals(env, normalizeBluesky(page.feed || [], actor));
      pages += 1;
      cursor = page.cursor || null;
      if (!cursor) {
        backfillComplete = true;
        break;
      }
    }
  }

  await writeSyncState(env, 'bluesky', cursor, backfillComplete);
  return { ok: true, pages, received, backfillComplete };
};

const fetchXPage = async (env, cursor) => {
  const url = new URL(`https://api.x.com/2/users/${env.X_USER_ID}/tweets`);
  url.searchParams.set('max_results', '100');
  url.searchParams.set('exclude', 'retweets,replies');
  url.searchParams.set('tweet.fields', 'created_at');
  if (cursor) url.searchParams.set('pagination_token', cursor);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${env.X_BEARER_TOKEN}`, accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`X returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
  return response.json();
};

const normalizeX = (posts, handle) => posts.flatMap((post) => {
  if (!post?.id || !post.text || !post.created_at) return [];
  const date = new Date(post.created_at);
  if (Number.isNaN(date.valueOf())) return [];
  return [{
    source: 'x',
    sourceId: post.id,
    createdAt: date.toISOString(),
    text: post.text,
    url: `https://x.com/${handle}/status/${post.id}`,
  }];
});

const syncX = async (env, pageLimit) => {
  if (!env.X_BEARER_TOKEN || !env.X_USER_ID) {
    return { ok: true, skipped: true, reason: 'X_BEARER_TOKEN and X_USER_ID are not configured' };
  }
  const state = await readSyncState(env, 'x');
  let cursor = state?.cursor || null;
  let backfillComplete = Boolean(state?.backfill_complete);
  let pages = 0;
  let received = 0;

  if (cursor) {
    const latest = await fetchXPage(env, null);
    received += await storeSignals(env, normalizeX(latest.data || [], env.X_HANDLE || 'jamiesheep'));
  }

  if (backfillComplete) {
    if (!cursor) {
      const latest = await fetchXPage(env, null);
      received += await storeSignals(env, normalizeX(latest.data || [], env.X_HANDLE || 'jamiesheep'));
    }
  } else {
    while (pages < pageLimit) {
      const page = await fetchXPage(env, cursor);
      received += await storeSignals(env, normalizeX(page.data || [], env.X_HANDLE || 'jamiesheep'));
      pages += 1;
      cursor = page.meta?.next_token || null;
      if (!cursor) {
        backfillComplete = true;
        break;
      }
    }
  }

  await writeSyncState(env, 'x', cursor, backfillComplete);
  return { ok: true, pages, received, backfillComplete };
};

const syncSources = async (env, pageLimit) => {
  const result = {};
  for (const [source, sync] of [['bluesky', syncBluesky], ['x', syncX]]) {
    try {
      result[source] = await sync(env, pageLimit);
    } catch (error) {
      console.error(`${source} sync failed`, error);
      await recordSyncError(env, source, error);
      result[source] = { ok: false, error: errorMessage(error) };
    }
  }
  return result;
};

const isAuthorized = (request, env) => {
  if (!env.ADMIN_TOKEN) return false;
  return request.headers.get('authorization') === `Bearer ${env.ADMIN_TOKEN}`;
};

const listSignals = async (request, env) => {
  const url = new URL(request.url);
  const limit = boundedInteger(url.searchParams.get('limit'), 1000, 1, 2000);
  const before = url.searchParams.get('before');
  const source = url.searchParams.get('source');
  const filters = [];
  const values = [];
  if (before && Number.isFinite(Date.parse(before))) {
    filters.push('created_at < ?');
    values.push(new Date(before).toISOString());
  }
  if (source === 'bluesky' || source === 'x') {
    filters.push('source = ?');
    values.push(source);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const query = env.DB.prepare(`
    SELECT source, source_id AS sourceId, created_at AS createdAt, text, url
    FROM signals ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(...values, limit);
  const { results } = await query.all();
  return json({ signals: results, count: results.length }, {
    headers: { 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
};

const importXArchive = async (request, env) => {
  if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 1_500_000) return json({ error: 'Import batch is too large' }, { status: 413 });
  const body = await request.json();
  const records = Array.isArray(body) ? body : body.signals;
  if (!Array.isArray(records) || records.length > 250) {
    return json({ error: 'Expected a signals array containing at most 250 records' }, { status: 400 });
  }
  const handle = env.X_HANDLE || 'jamiesheep';
  const signals = records.flatMap((record) => {
    const sourceId = String(record.sourceId || record.id || '');
    const text = String(record.text || '').trim();
    const date = new Date(record.createdAt || record.created_at);
    if (!sourceId || !text || Number.isNaN(date.valueOf())) return [];
    return [{
      source: 'x',
      sourceId,
      createdAt: date.toISOString(),
      text: text.slice(0, 20_000),
      url: String(record.url || `https://x.com/${handle}/status/${sourceId}`),
    }];
  });
  await storeSignals(env, signals);
  return json({ imported: signals.length });
};

const health = async (env) => {
  const counts = await env.DB.prepare('SELECT source, COUNT(*) AS count FROM signals GROUP BY source').all();
  const state = await env.DB.prepare('SELECT source, backfill_complete AS backfillComplete, last_synced_at AS lastSyncedAt, last_error AS lastError FROM sync_state ORDER BY source').all();
  return json({ ok: true, counts: counts.results, sync: state.results }, {
    headers: { 'cache-control': 'no-store' },
  });
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/api/signals') return listSignals(request, env);
      if (request.method === 'GET' && url.pathname === '/api/health') return health(env);
      if (request.method === 'POST' && url.pathname === '/api/admin/sync') {
        if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, { status: 401 });
        if (url.searchParams.get('reset') === '1') {
          await env.DB.prepare('DELETE FROM sync_state').run();
        }
        const pageLimit = boundedInteger(url.searchParams.get('pages'), 6, 1, 10);
        return json({ sources: await syncSources(env, pageLimit) });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/import/x') {
        return importXArchive(request, env);
      }
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, { status: 404 });
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('Request failed', error);
      return json({ error: 'Internal server error' }, { status: 500 });
    }
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(syncSources(env, 4));
  },
};
