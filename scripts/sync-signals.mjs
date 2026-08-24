const args = new Set(process.argv.slice(2));
const siteUrl = process.env.SITE_URL?.replace(/\/$/, '');
const adminToken = process.env.ADMIN_TOKEN;

if (!siteUrl || !adminToken) {
  console.error('Set SITE_URL and ADMIN_TOKEN before running this command.');
  console.error('Example: SITE_URL=https://jamie26.example.workers.dev ADMIN_TOKEN=... npm run cf:sync');
  process.exit(1);
}

let reset = args.has('--reset');
for (let attempt = 1; attempt <= 50; attempt += 1) {
  const url = new URL('/api/admin/sync', siteUrl);
  url.searchParams.set('pages', '10');
  if (reset) url.searchParams.set('reset', '1');
  reset = false;

  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Sync returned ${response.status}: ${JSON.stringify(body)}`);

  const bluesky = body.sources?.bluesky;
  const x = body.sources?.x;
  console.log(`Pass ${attempt}: Bluesky ${bluesky?.received || 0} records; X ${x?.skipped ? 'not configured' : `${x?.received || 0} records`}`);

  const failed = [bluesky, x].some((source) => source && source.ok === false);
  if (failed) throw new Error(`A source failed to sync: ${JSON.stringify(body.sources)}`);
  const blueskyDone = Boolean(bluesky?.backfillComplete);
  const xDone = Boolean(x?.skipped || x?.backfillComplete);
  if (blueskyDone && xDone) {
    console.log('Historical backfill is complete.');
    process.exit(0);
  }
}

throw new Error('Backfill did not finish after 50 passes. Run the command again to continue.');
