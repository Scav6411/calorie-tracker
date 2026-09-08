# Calorie Tracker

Personal calorie and macro tracker. React SPA on Cloudflare Pages, Supabase for
database / auth / edge functions. No other backend.

## Stack

| Layer      | Choice                                              |
| ---------- | --------------------------------------------------- |
| Build      | Vite 8 + React 19 + TypeScript                      |
| UI         | Tailwind CSS v4 + shadcn/ui (radix base, nova preset)|
| Routing    | react-router-dom v7                                 |
| Data/auth  | Supabase (Postgres + RLS, magic-link auth)          |
| Server     | Supabase Edge Functions (Deno)                      |
| Hosting    | Cloudflare Pages                                    |

## Layout

```
src/
  components/ui/      shadcn primitives (generated — re-add with `npx shadcn add <name>`)
  components/auth/    sign-in dialog, route guard
  components/layout/  header + shell
  providers/          auth + theme context
  hooks/use-auth.ts   session accessor
  lib/supabase.ts     typed browser client, edge-function helper
  routes/             landing, trends, auth callback, 404
  types/database.ts   generated DB types — do not edit, run `npm run types:gen`
  types/db.ts         hand-written aliases over the generated types
supabase/
  migrations/         SQL migrations, applied in order
  functions/health/   template edge function (JWT-verified echo)
  functions/_shared/  CORS helpers
public/_redirects     SPA fallback for Cloudflare Pages
```

Routes: `/` (home), `/trends` (auth required), `/auth/callback` (magic-link
return), and `/demo` + `/demo/trends`, which are **dev-only** — they are gated
behind `import.meta.env.DEV` and do not exist in a production build.

## First-time setup

1. **Install**

   ```bash
   npm install
   ```

2. **Link the Supabase project**

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>   # ref is in the dashboard URL
   ```

3. **Environment**

   ```bash
   cp .env.example .env.local
   ```

   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
   Dashboard → Project Settings → API. Both are public keys; the service-role
   key must never appear in this app.

4. **Apply the schema**

   ```bash
   npm run db:push        # remote
   # or, against local Docker Postgres:
   npm run db:start && npm run db:reset
   ```

5. **Auth redirect URLs** — Dashboard → Authentication → URL Configuration, add:
   - `http://localhost:5173/auth/callback`
   - `https://<your-pages-domain>/auth/callback`

6. **Run it**

   ```bash
   npm run dev
   ```

## Scripts

| Script              | Does                                              |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Vite dev server on :5173                          |
| `npm run build`     | Typecheck + production build to `dist/`           |
| `npm run lint`      | oxlint                                            |
| `npm test`          | Vitest unit suite (integration tests skip)        |
| `npm run test:watch`| Vitest in watch mode                              |
| `npm run db:push`   | Apply local migrations to the linked project      |
| `npm run db:diff`   | Generate a migration from local schema drift      |
| `npm run db:reset`  | Recreate the local DB from migrations             |
| `npm run types:gen` | Regenerate `src/types/database.ts` from the schema|
| `npm run fn:serve`  | Serve edge functions locally                      |
| `npm run fn:deploy` | Deploy all edge functions                         |
| `npm run deploy`    | Build + direct upload to Pages                    |

## Deploy (Cloudflare Pages)

The app is a static SPA. Cloudflare Pages serves it; Supabase does everything
else. There is no server to deploy.

### Pages project settings

| Setting                 | Value           |
| ----------------------- | --------------- |
| Framework preset        | None            |
| Build command           | `npm run build` |
| Build output directory  | `dist`          |
| Root directory          | `/`             |
| Node version            | 22 (`.nvmrc`)   |

If the build image ignores `.nvmrc`, set `NODE_VERSION=22` as an environment
variable — Vite 8 will not run on Node 18.

### Environment variables

Set both in **Settings → Environment variables**, for **Production _and_
Preview**:

```
VITE_SUPABASE_URL        https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY   <anon public key>
```

Four things about these that cause most first-deploy failures:

- **They are inlined at build time**, not read at runtime. Changing one in the
  dashboard does nothing until you redeploy.
- **They end up in the JavaScript bundle**, visible to anyone. That is fine and
  intended — the anon key is a public key and RLS is what protects the data.
  The service-role key must never be set here.
- **Do not set `NODE_ENV=production`.** `npm run build` runs `tsc -b` first,
  which needs devDependencies; Pages skips installing them if you do.
- **Do not commit a `wrangler.jsonc` / `wrangler.toml` to the repo root.** When
  Pages finds one it reads build configuration from that file and *ignores the
  dashboard environment variables entirely* — the build log prints
  `Build environment variables: (none found)` and the site ships as a blank
  page. This project deliberately has no Wrangler config file.

### Two ways to ship

**Git integration (recommended).** Connect the repo in the Pages dashboard.
Every push to `main` builds and deploys; every branch gets a preview URL. The
build runs on Cloudflare, so it uses the **dashboard** env vars.

**Direct upload.**

```bash
npx wrangler login
npm run deploy          # build + wrangler pages deploy dist
```

This builds **locally**, so it uses your **`.env.local`** — not the dashboard
values. Easy to ship the wrong Supabase project this way; prefer Git
integration for anything real.

### Supabase auth URLs

Dashboard → **Authentication → URL Configuration**. Magic links will not return
to the app until these are right:

- **Site URL**: `https://<project>.pages.dev`
- **Redirect URLs**:
  - `https://<project>.pages.dev/auth/callback`
  - `https://*.<project>.pages.dev/auth/callback` — preview deploys get a unique
    subdomain per branch, so without the wildcard login only works in production
  - `http://localhost:5173/auth/callback` — keep for local dev

On a custom domain, add it to both fields too.

### SPA routing

`public/_redirects` holds:

```
/*  /index.html  200
```

Without it, a hard refresh or a shared link to `/trends` returns 404 — Pages
looks for a file at that path. Real files are still served first, so this does
not swallow `/assets/*`.

### What Pages does *not* deploy

Database and edge functions ship separately, from your machine:

```bash
npm run db:push      # migrations to the linked Supabase project
npm run fn:deploy    # edge functions (apple-health-sync, create-sync-token)
```

Run `npm run db:push` **before** the first Pages deploy, or the app will build
fine and then fail on every query.

### First-deploy checklist

1. `npm run db:push` — schema is live
2. Pages project created, build command and output dir set as above
3. Both `VITE_` vars set for Production and Preview
4. Supabase Site URL + redirect URLs include the Pages domain (and the wildcard)
5. Pages domain added to `PRODUCTION_ORIGINS` in
   `supabase/functions/_shared/cors.ts`, then `npm run fn:deploy` — otherwise
   the browser cannot call an edge function from production
6. Deploy, then verify: page loads → magic link arrives → `/auth/callback`
   returns you signed in → hard-refresh `/trends` does not 404


## Database

`supabase/migrations/20260907000000_init_profiles.sql` creates `public.profiles`
(one row per auth user: timezone and daily calorie/macro goals), enables RLS with
owner-only policies, and adds a trigger that inserts a profile on signup.

Later migrations add `energy_readings` (Apple Health cumulative snapshots),
`food_items` + `meal_logs` (the food catalogue and what was eaten),
`weight_logs`, and three `security_invoker` views: `daily_energy`,
`daily_intake`, and `recent_foods` (one row per distinct food a user has
logged, holding their most recent entry for it, which drives "Log again").

## Tests

`npm test` runs the unit suite — pure logic only, no network. Modules are split
so this stays possible: `meal-math.ts` / `trend-math.ts` / `energy-math.ts` hold
the pure functions, and `meals.ts` / `trends.ts` / `energy.ts` wrap them with
the Supabase queries. `src/lib/supabase.ts` throws at import time without env
vars, so anything a test imports must not reach it.

`src/lib/meals.integration.test.ts` checks RLS isolation and the `recent_foods`
view against the real linked project. It skips unless a service-role key is
present:

```bash
SUPABASE_SERVICE_ROLE_KEY=... npm test
```

It creates throwaway users at `ct-itest-<uuid>@calorie-tracker.test`, sweeps any
left by a crashed run before starting, and deletes them in `afterAll` — deleting
an auth user cascades to all of its rows, so that is the whole cleanup.

New migration:

```bash
supabase migration new <name>
# then edit the generated file and run npm run db:push
```

## Apple Health sync

`apple-health-sync` ingests cumulative energy from an iOS Shortcut. Shortcuts
cannot hold a refreshing Supabase JWT, so the function runs with
`verify_jwt = false` and authenticates on a per-user token instead. There is no
shared secret.

**Minting one:** sign in, then Home -> gear icon -> **Sync tokens**, name the
device, **Create**. The raw `cts_...` value is shown **once** and never again --
only its SHA-256 and a 12-character prefix are stored. Up to 10 active; the
trash icon revokes one.

**What the Shortcut sends:**

```
POST https://<project-ref>.supabase.co/functions/v1/apple-health-sync
Content-Type:  application/json
x-user-token:  cts_...

{ "synced_at": "<iso8601>", "active_energy": 123, "resting_energy": 456 }
```

No `Authorization` header. `x-sync-secret` is accepted as an alias for
`x-user-token` so an older Shortcut only needs its value swapped, not its header
name. Looking the hash up in `sync_tokens` both authenticates the caller and
identifies whose rows to write -- which is why the token is per user and not a
project-wide secret.

`synced_at` accepts ISO 8601, or the localised string Shortcuts produces
("7 Sep 2026 at 2:06 PM"), which carries no offset and is read in
`SYNC_TIMEZONE` (default `Asia/Kolkata`).

Over plain http on a LAN IP the **Copy token** button falls back to
`document.execCommand` because `navigator.clipboard` needs a secure context. If
it fails, the token is `select-all` -- long-press to select it by hand. Not an
issue on the deployed https domain.

### Triggering a sync

**Launch the app from a Shortcut, not from Safari.** The Home Screen icon is a
Shortcut whose actions are, in order:

1. **Open URL** -> the app
2. **Run Shortcut** -> Sync Health Data

Opening the app *is* the sync trigger, so it cannot be missed. This beats a
time-of-day Personal Automation, which iOS defers or drops while the phone is
locked, and it is the only reliable option: a web page cannot run a Shortcut in
the background, because iOS always foregrounds the app a URL scheme targets, and
there is no HealthKit web API to go around it.

### Getting the reading on screen

Action 1 hands off to Safari and the page reads `energy_readings` while action
2's upload is still travelling, so a naive first render shows the *previous*
sync. Three things close that, in order of how much they are relied on:

- **`useEnergyRealtime`** -- a Postgres subscription. The edge function writes
  the row, Postgres publishes the change, the day refetches. No polling and no
  guess at timing. `energy_readings` has to be in the `supabase_realtime`
  publication for this to receive anything, which is what the
  `20260908130000_energy_realtime` migration does. RLS applies to the
  subscription, so a socket only ever carries rows its own select policy would
  have returned.
- **`useSyncCatchUp`** -- refetches at 2.5s and 7s, covering the socket not
  being connected yet at launch. Fixed delays rather than polling until
  something changes: nothing can distinguish "the upload has not landed yet"
  from "the Shortcut never ran", and a loop that cannot tell those apart would
  spin forever on the second.
- **The circular-arrows button** in the Home header -- a plain refetch, for when
  both of the above have had their turn.

The line under Eaten/Burned reports staleness (`synced 3h ago`) rather than a
clock time, because the question being asked is "did the sync run?".


## Edge functions

`supabase/functions/health` is the template: it handles CORS preflight, verifies
the caller's JWT, and returns the user id. Copy it for real functions.

Browser origins are allowed in `supabase/functions/_shared/cors.ts`:
`PRODUCTION_ORIGINS` for the apex Pages domain, `PAGES_ORIGIN` for the
per-deployment preview hostnames, `LOCAL_ORIGIN` for localhost and the LAN.
Add a custom domain there and redeploy the functions, or the browser cannot
call any of them from it.

Secrets:

```bash
cp supabase/.env.example supabase/.env.local
supabase functions serve --env-file supabase/.env.local   # local
supabase secrets set --env-file supabase/.env.local       # remote
```

Call one from the app with `invokeFunction('health')` in `src/lib/supabase.ts` —
it forwards the session JWT automatically.
