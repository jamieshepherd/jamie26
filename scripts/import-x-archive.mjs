import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const input = process.argv[2];
const siteUrl = process.env.SITE_URL?.replace(/\/$/, '');
const adminToken = process.env.ADMIN_TOKEN;
const handle = process.env.X_HANDLE || 'jamiesheep';

if (!input || !siteUrl || !adminToken) {
  console.error('Usage: SITE_URL=https://... ADMIN_TOKEN=... npm run cf:import:x -- /path/to/x-archive/data/tweets.js');
  console.error('You may also pass the extracted archive directory; tweets*.js files will be discovered.');
  process.exit(1);
}

const findTweetFiles = async (target) => {
  const targetStat = await stat(target);
  if (targetStat.isFile()) return [target];
  const candidates = [target, path.join(target, 'data')];
  const found = [];
  for (const directory of candidates) {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && /^tweets(?:-part\d+)?\.js$/i.test(entry.name)) {
          found.push(path.join(directory, entry.name));
        }
      }
    } catch {
      // The archive may not contain both candidate directories.
    }
  }
  return [...new Set(found)].sort();
};

const parseArchiveFile = async (filename) => {
  const source = await readFile(filename, 'utf8');
  const start = source.indexOf('[');
  if (start < 0) throw new Error(`Could not find tweet data in ${filename}`);
  const payload = source.slice(start).trim().replace(/;\s*$/, '');
  const rows = JSON.parse(payload);
  return rows.flatMap((row) => {
    const tweet = row.tweet || row;
    const sourceId = String(tweet.id_str || tweet.id || '');
    const text = String(tweet.full_text || tweet.text || '').trim();
    const date = new Date(tweet.created_at);
    if (!sourceId || !text || Number.isNaN(date.valueOf())) return [];
    return [{
      sourceId,
      createdAt: date.toISOString(),
      text,
      url: `https://x.com/${handle}/status/${sourceId}`,
    }];
  });
};

const files = await findTweetFiles(path.resolve(input));
if (!files.length) throw new Error('No tweets.js or tweets-part*.js file was found. Extract the X archive first.');

const records = (await Promise.all(files.map(parseArchiveFile))).flat();
console.log(`Found ${records.length} tweets across ${files.length} archive file(s).`);

let imported = 0;
for (let index = 0; index < records.length; index += 200) {
  const batch = records.slice(index, index + 200);
  const response = await fetch(new URL('/api/admin/import/x', siteUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ signals: batch }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Import returned ${response.status}: ${JSON.stringify(body)}`);
  imported += body.imported || 0;
  console.log(`Imported ${imported}/${records.length}`);
}

console.log('X archive import complete. Re-importing the same archive is safe.');
