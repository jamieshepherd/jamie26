# Jamie.sh / Thoughtspace

A deliberately non-standard personal site: part portfolio, part life-map, part live signal receiver. The landing field is one continuous calendar spiral: Jamie's 1990 origin is at the center, the quiet 1990–2010 span is compressed, and each revolution after 2010 advances roughly two years toward now. Long-form posts and live Bluesky signals sit directly on the thread at their dates. The field opens in overview; drag to pan and use the mouse wheel to zoom.

## Run it

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Writing

Long-form posts live in `src/content/<slug>/index.md`. The loader understands the existing TOML frontmatter fields (`title`, `date`, and `location`) and discovers posts automatically. Put post images alongside the Markdown and copy deployable image files to `public/posts/<slug>/` so relative Markdown image paths resolve in the reader.

The short-form signal drawer reads the public Bluesky feed for `jamie.sh` in the browser. If the feed cannot be reached, it falls back to direct Bluesky and X links instead of displaying invented content.
