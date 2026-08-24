# Jamie.sh / Thoughtspace

A personal timeline rendered as one continuous spiral. Long-form posts come from local Markdown; short signals are normalized from Bluesky and X into Cloudflare D1, then served by the same Worker that hosts the Vite site.

## Architecture

- Vite builds the static site into `dist/`.
- Cloudflare Workers Static Assets serves the site.
- `GET /api/signals` reads the historical signal archive from D1.
- An hourly Cron Trigger imports new Bluesky posts and, when credentials are configured, new X posts.
- Bluesky is paged backward until its available history is stored.
- A protected importer loads a downloaded X archive without exposing it publicly.
- Every import is idempotent: source IDs are unique, so rerunning a sync or archive import is safe.

If the API is unavailable during ordinary Vite development, the browser falls back to the latest public Bluesky feed.

## Local frontend development

```bash
npm install
npm run dev
```

## Full Worker development

Apply the migration to a local D1 database and run the Worker, assets, API, and scheduled handler together:

```bash
npm run cf:migrate:local
npm run cf:dev
```

To test the scheduled sync locally:

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
curl "http://localhost:8787/api/health"
```

Copy `.dev.vars.example` to `.dev.vars` if you want to test protected admin endpoints or X API ingestion locally. `.dev.vars` is ignored by Git.

## First Cloudflare deployment

Authenticate Wrangler:

```bash
npx wrangler login
```

Create the production D1 database and let Wrangler add its generated ID to `wrangler.jsonc`:

```bash
npx wrangler d1 create jamie26-signals --binding DB --update-config --location wnam
```

Build the site, apply all remote D1 migrations, and deploy the Worker:

```bash
npm run cf:deploy
```

The deploy output prints the `workers.dev` URL. You can attach `jamie.sh` as a Custom Domain from the Worker settings in Cloudflare.

## Initial Bluesky history

Create and install an admin token, keeping the generated value in the current shell:

```bash
export ADMIN_TOKEN="$(openssl rand -hex 32)"
printf '%s' "$ADMIN_TOKEN" | npx wrangler secret put ADMIN_TOKEN
export SITE_URL="https://YOUR-WORKER.workers.dev"
```

Then page backward through the Bluesky history until it is complete:

```bash
npm run cf:sync -- --reset
```

The hourly cron continues incremental imports afterward. Check its state at:

```bash
curl "$SITE_URL/api/health"
```

## Importing historical X posts

Request and extract your X archive, then point the importer at either the extracted archive directory or its `data/tweets.js` file:

```bash
SITE_URL="$SITE_URL" ADMIN_TOKEN="$ADMIN_TOKEN" \
  npm run cf:import:x -- /path/to/extracted-x-archive
```

The importer sends batches through the protected Worker endpoint and can be safely rerun.

For automatic future X imports, configure API credentials as Worker secrets and run a sync once:

```bash
npx wrangler secret put X_BEARER_TOKEN
npx wrangler secret put X_USER_ID
npm run cf:sync
```

X API access is optional. Without it, Bluesky continues syncing automatically and an updated X archive can be imported whenever desired.

## Subsequent deployments

```bash
npm run cf:deploy
```

The command builds the site, applies any new migrations, and deploys the Worker and static assets as one unit.

## Writing long-form posts

Posts live in `src/content/<slug>/index.md`. The loader understands the existing TOML frontmatter fields (`title`, `date`, and `location`) and discovers posts automatically. Put deployable images in `public/posts/<slug>/` so relative Markdown image paths resolve in the reader.
