+++
date = '2025-07-17'
location = 'SAN FRANCISCO, CALIFORNIA'
title = 'React Router v7, Vite, and Cloudflare Workers'
bsky = "https://bsky.app/profile/jamie.sh/post/3lu6rfqphs227"
+++

I wanted to build a fun little project. That project was [spacetime](https://spacetime.cv).

I actually built most of it over a couple days, and over the decades I've gotten pretty good at spinning up full-stack web apps from idea to deployment quickly. This time, I wanted a mostly SPA experience, but I'd use Supabase on the backend to try and escape as much API code as I could. I ended up wanting to call OpenAI to generate embeddings, and the Supabase Edge Functions DX with Deno was really frustrating.

For larger projects, I'd probably throw together a quick CRUD API in Go - but I really wanted to keep this small and self contained, so I bolted React Router on top so I could take advantage of server-side actions and create a pseudo-API within the same application.

I've used a variation of Cloudflare Pages, Netlify, or GitHub pages in the past for simple, free deployment - but Cloudflare this time was suggesting I use Cloudflare Workers to deploy my React Router based app. It's "newer" and "supports more stuff" or something.

Turns out, I couldn't just plug in my repository and let it go to work like I could with Cloudflare Pages, and I had to end up pulling out some parts from Cloudflare's [react router template](https://github.com/cloudflare/templates/tree/main/react-router-starter-template) to make it go. This included some new files:

```
- app/
    - entry.server.tsx
- workers/
    - app.ts
- tsconfig.cloudflare.json
- wrangler.json
```

some updates to some existing files:

```
- react-router.config.ts
- tsconfig.json
- tsconfig.node.json
- vite.config.ts
```

and also some new packages in our package.json.

This seems like a lot of work to "make things go", and it also meant that my local development would change to use Cloudflare's wrangler as well. Functionally, there's not a lot of difference in the DX here - but it's not quite as plug-in-and-go as I would have liked. Starting a new project from this template makes sense, but converting a project was pretty clunky.

## Environment variables

In React Router/Vite, I'd just throw my local variables into an `.env.local` file and things would "just work". For the public facing variables, you would just prefix them with VITE\*. In my app I had my `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, which I wanted to be publically available so the client could call Supabase. I also wanted those to be available on the server, so that my server could call Supabase - but my server would also occasionally call OpenAI with the OPENAI_API_KEY variable (which for obvious reasons should not be public).

I pretty distinctly remember this part being easier in the past. Cloudflare's documentation has a bunch of nonsense here to work within their ecosystem, even ChatGPT suggested some overkill things. I really wanted just wanted to make this thing go - with minimal changes, so here's what I ended up with.

### .dev.vars

Cloudflare will look for a `.dev.vars` file for local development. There is some documentation around how you might use this for different environments, but if you don't care - you can essentially rename `.env.local` to `.dev.vars` and your local development will be the same. Don't forget to .gitignore these so you don't commit them to source control.

### wrangler.json

```
"vars": {
    "VITE_SUPABASE_URL": "https://cdgnfaxfwxjbvntadvbm.supabase.co",
    "VITE_SUPABASE_ANON_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
}
```

For production, I put my public keys in the vars section of wrangler.json. These are keys that you don't mind ending up in source control - so you'll notice my OPENAI_API_KEY is not listed here. These keys will end up in the Cloudflare dashboard under Settings > Variable and Secrets - and reflect the variables that will be available to your worker at runtime. For me, that's any of the code running on the server (my pseudo-API routes). I also want my OpenAI API key to be available to those routes, so I added it directly via the Cloudflare Dashboard (Type: Secret).

### Build variables

For the `VITE_` public keys that the client uses - these are built into your production code during the build step. There's actually a "beta" section in the Cloudflare Dashboard under Settings > Build > Variables and secrets that allow you define variables that should be available during the build process.

## Micro conclusion

I miss dragging folders into FileZilla and calling things deployed. I like things being simple, this was a little bit convoluted - but it works, and it'll work for my purposes. Hopefully if you're reading this - it was helpful for you too. A lot of this stuff is in beta and changing all the time - so check the date of this post if you're following along and make sure it's still recent!

That's all for now folks!
