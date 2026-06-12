# lib/data — the data layer

The UI imports `getAdapter()` from `@/lib/data` and uses the `DataAdapter`
interface (`./types.ts`, a frozen shared contract). Two implementations sit
behind it:

- **LocalAdapter** — `localStorage` (keys prefixed `cg2_`, matching the
  prototype) + a seeded gallery of edits. The **default** when Supabase env vars
  are missing or still placeholders. Lets the whole app run with zero backend.
- **SupabaseAdapter** — real Supabase code paths (auth anon sign-in, RLS reads,
  submit/vote). Compiles but is inert until real keys exist.

`getAdapter()` selects LocalAdapter unless **both** `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present and are **not** the
`.env.example` placeholders (`https://YOUR-PROJECT.supabase.co` /
`YOUR-ANON-KEY`).

## Ownership note

The backend agent owns `lib/data/**` (except `types.ts`), `lib/supabase/**`, and
`supabase/**`. To avoid concurrent edits to `.env.example` (owned by scaffold),
**list any additional env vars you need here** rather than editing
`.env.example` directly:

### Env vars needed by the data/backend layer

| Var | Purpose | Default in local mode |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | placeholder → local mode |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | placeholder → local mode |

_(Add rows here as the SupabaseAdapter grows — scaffold will fold them into
`.env.example`.)_

---

## Applying migrations

### Against a local Supabase project (CLI)

```bash
# First-time setup
supabase login
supabase init                       # creates supabase/ config if not present
supabase link --project-ref <ref>   # link to your Supabase project

# Apply migrations
supabase db push                    # runs 0001_init.sql (+ 0002_seed_dev.sql in dev)
```

### Against a remote project (SQL editor)

1. Open the Supabase dashboard → **SQL editor**.
2. Paste and run `supabase/migrations/0001_init.sql` first.
3. For a **dev/staging** project only, also paste and run
   `supabase/migrations/0002_seed_dev.sql`.
   **Do not run 0002 in production** — it inserts fake seed rows and will abort
   if it detects a production project (see the safety guard in the file).

---

## Dashboard settings to enable

After applying migrations, configure the Supabase project dashboard:

### Authentication → Providers

| Setting | Value | When |
|---|---|---|
| **Anonymous sign-in** | **Enabled** | Phase 0 (required — LocalAdapter doesn't need it; SupabaseAdapter's `getIdentity()` calls `signInAnonymously()` on first load) |
| **Google OAuth** | Enabled + client ID/secret | Phase 4 only |
| **Manual linking** | **Enabled** | Phase 4 — required for `linkIdentity({ provider: 'google' })` to preserve the user id (PRD §7.4) |

To enable anonymous sign-in: **Authentication → Providers → Anonymous** → toggle on.

To enable manual linking: **Authentication → Sign In Methods** → scroll to
"Manual linking" → toggle on. (This is a separate setting from enabling the
Google provider.)

### Storage

Create a bucket named **`photos`** (the SupabaseAdapter's `storageUrl()` helper
references this bucket by name):

1. **Storage → New bucket** → name it `photos` → **Public bucket** (variants
   are served via CDN; no signed URLs needed).
2. Upload the dev-001 variant files to `photos/dev-001/` for staging testing.

### Cloudflare (recommended for production — Phase 3+)

Put Cloudflare in front of Supabase Storage to cache `master16.png` at the CDN
edge. The master16 is ~8–18 MB/day but immutable once staged; near-100% CDN
cache hit keeps origin egress near zero (PRD §9).

---

## What is inert until real keys exist

When `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are absent or
placeholder, `isSupabaseConfigured()` returns `false` and `getAdapter()` returns
a `LocalAdapter`. The following are therefore inert in local mode:

- `lib/supabase/client.ts` — `getSupabaseClient()` is never called.
- `lib/data/supabase.ts` — `SupabaseAdapter` is never instantiated.
- `supabase/migrations/` — not applied; LocalAdapter uses only localStorage.
- All auth flows (`signInAnonymously`, `linkIdentity`) — identity is generated
  locally via `crypto.randomUUID()` + the adjective-noun handle generator.
- The commit-reveal RLS policy — enforced client-side in LocalAdapter
  (`getGallery()` returns `[]` until the user has a localStorage submission).

In Supabase mode (real keys set), all of the above become active and the RLS
policy takes over server-side enforcement of commit-reveal (PRD invariant #5).
