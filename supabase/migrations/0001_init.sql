-- =============================================================================
-- 0001_init.sql — color-gradle Phase-0 schema
-- PRD §7.2 data model + §7.4 auth + §6.3 commit-reveal RLS
-- =============================================================================
-- Applies to: Supabase Postgres (with auth.users available via GoTrue).
-- Run via:  supabase db push     (from the CLI, after `supabase init`)
--       or:  paste into the Supabase SQL editor.
-- Every CREATE TABLE is idempotent via IF NOT EXISTS; the trigger
-- and RLS policies are dropped-and-recreated for safe re-runs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSION
-- ---------------------------------------------------------------------------
-- pgcrypto gives us gen_random_uuid() if not already enabled by Supabase.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
-- One row per authenticated user (anonymous OR Google-linked).
-- The id EQUALS auth.users.id — profiles are a thin, application-owned
-- projection of the auth record, so history survives the anon→Google upgrade
-- (PRD §7.4: linkIdentity preserves the user id with no migration).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  -- Stable identifier: always auth.users.id (uuid).
  id              uuid        primary key references auth.users (id) on delete cascade,

  -- True when the user has never done a Google linkIdentity upgrade.
  is_anonymous    boolean     not null default true,

  -- Generated adjective-noun handle (e.g. "CrimsonOtter47").
  -- Set on creation by the application; survives the Google upgrade.
  display_name    text        not null,

  -- Optional avatar URL (set from Google profile on upgrade, or a
  -- generated identicon URL on creation).
  avatar_url      text,

  -- UTC timestamp of the Google linkIdentity upgrade; null while anonymous.
  upgraded_at     timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user (anon or Google). id = auth.users.id. '
  'Survives the anon→Google linkIdentity upgrade (PRD §7.4).';

-- ---------------------------------------------------------------------------
-- 1a. profiles — auto-insert trigger
-- ---------------------------------------------------------------------------
-- When GoTrue creates a new auth.users row (anonymous sign-in or OAuth),
-- we immediately create the corresponding profiles row with a placeholder
-- display_name. The application overwrites display_name in the same
-- transaction (or shortly after) with the generated adjective-noun handle.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, is_anonymous, display_name)
  values (
    new.id,
    -- GoTrue marks anonymous users via app_metadata.provider = 'anonymous'
    -- (or is_anonymous on newer builds). Coalesce both signals.
    coalesce(
      (new.raw_app_meta_data ->> 'provider') = 'anonymous',
      new.is_anonymous,
      true
    ),
    -- Temporary placeholder; the application sets the real handle shortly after.
    'player-' || substr(new.id::text, 1, 8)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Drop-and-recreate for idempotent re-runs.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. daily_photos
-- ---------------------------------------------------------------------------
-- One row per calendar day (UTC). Holds the frozen variant set
-- (master16 / preview8 / ai768) and the preprocessing manifest
-- (PRD §6.2.1 and §7.2).
-- ---------------------------------------------------------------------------
create table if not exists public.daily_photos (
  id                  uuid        primary key default gen_random_uuid(),

  -- The UTC calendar date this photo is the puzzle for.
  -- UNIQUE enforces one global puzzle/day (PRD §6.8).
  play_date           date        not null unique,

  -- Human-readable day sequence number (Day 1, 2, …).
  day_number          int         not null check (day_number > 0),

  -- One-line theme shown on the landing screen ("Golden Hour Street").
  theme               text        not null default '',

  -- -------------------------------------------------------------------------
  -- Frozen variant paths in Supabase Storage (PRD §6.2.1).
  -- Relative to the storage bucket root; CDN URL is derived at serve time.
  -- master16 — 2048px 16-bit sRGB PNG; consumed by the editor + inspect view.
  -- preview8 — 1024px 8-bit WebP;       gallery tiles + landing hero.
  -- ai768    — 768px 8-bit JPEG;         AI player prompts (Phase 5).
  -- -------------------------------------------------------------------------
  master16_path       text        not null,
  preview8_path       text        not null,
  ai768_path          text        not null,

  -- Raw pixel dimensions of the master16 variant (width × height in px).
  master16_width      int         not null default 0,
  master16_height     int         not null default 0,

  -- Preprocessing manifest: pinned tool versions, filter graph, curation-gate
  -- result, per-variant sha256s, etc. — exact shape documented in PRD §6.2.1.
  manifest            jsonb       not null default '{}',

  -- Pipeline version that produced this master (frozen = "v1").
  -- Stored here so the client can select the correct renderer without parsing
  -- the full manifest.
  pipeline            text        not null default 'v1',

  -- Photo source: 'pexels' | 'admin'
  source              text        not null default 'admin'
                        check (source in ('pexels', 'admin')),

  -- Attribution as required by Pexels terms (photographer name, photo url,
  -- pexels profile url). Null for admin-curated picks without external source.
  source_attribution  jsonb,

  -- Lifecycle: 'pending' | 'staged' | 'live' | 'archived'
  -- pre-stage workflow sets 'staged'; rollover cron sets 'live'.
  status              text        not null default 'staged'
                        check (status in ('pending', 'staged', 'live', 'archived')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.daily_photos is
  'One row per UTC calendar day. Holds the frozen variant set '
  '(master16/preview8/ai768) and preprocessing manifest (PRD §6.2.1/§7.2). '
  'play_date UNIQUE enforces one global puzzle per day.';

comment on column public.daily_photos.pipeline is
  'Frozen pipeline version ("v1"). Selects the correct client renderer '
  'without parsing the full manifest. v1 is frozen forever (PRD §6.2.1).';

comment on column public.daily_photos.manifest is
  'Full preprocessing manifest: pinned tool versions, filter graph params, '
  'optional ML model id + weights sha256, curation-gate threshold + result, '
  'per-variant {width, height, format, encoder_version, quality, sha256}. '
  'Schema: see PRD §6.2.1 and scripts/prepare-master output.';

-- ---------------------------------------------------------------------------
-- 3. ai_players
-- ---------------------------------------------------------------------------
-- Registry of AI players (one row per model). Referenced by
-- submissions.ai_model (Phase 5). Built from day one so the data model
-- supports AI players even before Phase 5 ships (PRD §7.2).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_players (
  id          uuid    primary key default gen_random_uuid(),

  -- The exact model id as used in the gallery (e.g. "claude-opus-4.8",
  -- "gemini-3-flash"). Also the display name — no aliases or personas
  -- (PRD §6.7: "named by their model ID").
  model_id    text    not null unique,

  -- Provider name for grouping/display (e.g. "anthropic", "google", "openai").
  provider    text    not null,

  -- Optional avatar URL (AI badge + avatar in the gallery).
  avatar_url  text,

  -- False to pause a model without deleting its historical submissions.
  is_active   boolean not null default true,

  created_at  timestamptz not null default now()
);

comment on table public.ai_players is
  'Registry of AI players (one row per model). model_id is the exact '
  'model identifier AND the display name in the gallery (PRD §6.7). '
  'Referenced by submissions.ai_model in Phase 5.';

-- ---------------------------------------------------------------------------
-- 4. submissions
-- ---------------------------------------------------------------------------
-- One player's edit for one day. The settings jsonb IS the edit — no
-- rendered image is stored (PRD invariant #1: "An edit IS a small settings JSON").
-- AI players appear as regular submissions with ai_model set (PRD §6.7).
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
  id                uuid        primary key default gen_random_uuid(),

  -- The puzzle this edit belongs to.
  daily_photo_id    uuid        not null references public.daily_photos (id)
                                  on delete restrict,

  -- The human player who submitted. NULL for AI-generated submissions
  -- (ai_model is set instead). The FK to profiles is intentionally nullable
  -- so AI rows don't need a fake profiles entry.
  player_id         uuid        references public.profiles (id)
                                  on delete set null,

  -- For AI submissions: the exact model id (e.g. "claude-opus-4.8").
  -- NULL for human submissions. Cross-references ai_players.model_id
  -- (loose reference — no FK so AI rows can be inserted before ai_players
  -- is populated, and dropping a model doesn't cascade).
  ai_model          text,

  -- The frozen edit settings JSON (PRD §6.2 example shape):
  -- { v:1, pipeline:"v1", engine:"webgl2", colorSpace:"srgb",
  --   photoId:"...", tone:{temp,tint,exposure,...} }
  -- Validated and clamped server-side via clampToneSettings before insert.
  settings          jsonb       not null,

  -- Schema version of the settings JSON (currently 1). Allows future
  -- migrations to detect and handle old shapes.
  schema_version    int         not null default 1,

  -- Optional cached thumbnail path in Storage (added only if mobile perf
  -- later demands it — PRD §7.3: "no thumbnails for MVP").
  thumb_path        text,

  -- Wall-clock milliseconds from editor-start to submit (null for AI/admin).
  time_taken_ms     bigint,

  -- Denormalized like count — maintained by the insert/delete trigger on
  -- votes (see section 5a). Read-only from the application; the trigger
  -- is the single writer.
  like_count        int         not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Core integrity constraints (PRD §6.5 + §7.2):
  -- One submission per human player per day.
  constraint submissions_unique_player_day
    unique (daily_photo_id, player_id),

  -- A submission must be either human (player_id set) or AI (ai_model set),
  -- not neither (though NOT both is handled by application logic / validator).
  constraint submissions_player_or_ai
    check (player_id is not null or ai_model is not null)
);

comment on table public.submissions is
  'One player edit per day. settings jsonb IS the edit — no rendered image '
  'stored (PRD invariant #1). AI rows set ai_model instead of player_id. '
  'UNIQUE(daily_photo_id, player_id) enforces one submission/day (PRD §6.5).';

comment on column public.submissions.settings is
  'Frozen EditSettings JSON: {v:1, pipeline:"v1", engine:"webgl2", '
  'colorSpace:"srgb", photoId:"...", tone:{...}}. '
  'Validated + clamped before insert via clampToneSettings (PRD invariant #3).';

comment on column public.submissions.like_count is
  'Denormalized; maintained exclusively by the votes insert/delete trigger. '
  'Never written by the application directly.';

-- ---------------------------------------------------------------------------
-- 5. votes
-- ---------------------------------------------------------------------------
-- One like per player per submission. The UNIQUE constraint is the primary
-- integrity defense (PRD §7.2 + §6.4). A trigger maintains the denormalized
-- like_count on submissions.
-- ---------------------------------------------------------------------------
create table if not exists public.votes (
  id              uuid        primary key default gen_random_uuid(),

  -- The submission being liked.
  submission_id   uuid        not null references public.submissions (id)
                                on delete cascade,

  -- The player casting the like. Must be an authenticated user.
  voter_id        uuid        not null references public.profiles (id)
                                on delete cascade,

  created_at      timestamptz not null default now(),

  -- One like per voter per submission (PRD §6.4 + §7.2).
  constraint votes_unique_voter_submission
    unique (submission_id, voter_id)
);

comment on table public.votes is
  'One like per voter per submission. UNIQUE(submission_id, voter_id) is the '
  'primary integrity guard (PRD §6.4). Insert/delete trigger keeps '
  'submissions.like_count in sync.';

-- ---------------------------------------------------------------------------
-- 5a. votes — like_count maintenance trigger
-- ---------------------------------------------------------------------------
-- Fires AFTER INSERT or DELETE on votes; atomically increments/decrements
-- the denormalized like_count on the parent submissions row.
-- Using a trigger (rather than a view or application-side count) keeps
-- like_count consistent even under concurrent inserts without requiring
-- a full count(*) scan per read.
-- ---------------------------------------------------------------------------
create or replace function public.handle_vote_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.submissions
    set like_count = like_count + 1,
        updated_at = now()
    where id = new.submission_id;
  elsif (tg_op = 'DELETE') then
    update public.submissions
    set like_count = greatest(like_count - 1, 0),
        updated_at = now()
    where id = old.submission_id;
  end if;
  return null; -- AFTER trigger; return value is ignored
end;
$$;

drop trigger if exists on_vote_change on public.votes;
create trigger on_vote_change
  after insert or delete on public.votes
  for each row execute procedure public.handle_vote_change();

-- ---------------------------------------------------------------------------
-- 6. friendships (Phase 6 stub)
-- ---------------------------------------------------------------------------
-- Included in the Phase-0 schema so the data model supports friends from
-- the start (PRD §7.2 + §11 Phase 6). All friendship logic is deferred;
-- this table is never queried until Phase 6.
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id              uuid        primary key default gen_random_uuid(),

  -- The user who sent the friend request.
  requester_id    uuid        not null references public.profiles (id)
                                on delete cascade,

  -- The user who received it.
  addressee_id    uuid        not null references public.profiles (id)
                                on delete cascade,

  -- 'pending' | 'accepted' | 'declined'
  status          text        not null default 'pending'
                    check (status in ('pending', 'accepted', 'declined')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Exactly one friendship record per ordered pair; prevents duplicate
  -- requests and self-friendship.
  constraint friendships_unique_pair
    unique (requester_id, addressee_id),

  constraint friendships_no_self
    check (requester_id <> addressee_id)
);

comment on table public.friendships is
  'Phase-6 stub. Friend graph for Google-linked users. '
  'Deferred: no application code reads this table until Phase 6.';

-- ---------------------------------------------------------------------------
-- 7. Row Level Security (RLS)
-- ---------------------------------------------------------------------------
-- Philosophy (PRD §7.4):
--   • Users write submissions/votes only AS auth.uid() — server authority.
--   • Public read: profiles, daily_photos, ai_players.
--   • Commit-reveal: a user may only SELECT submissions for *today's* photo
--     once they have their own submission row for it (PRD invariant #5).
--     Past days' galleries are always public.
-- ---------------------------------------------------------------------------

-- Enable RLS on all user-facing tables.
alter table public.profiles     enable row level security;
alter table public.daily_photos enable row level security;
alter table public.submissions  enable row level security;
alter table public.votes        enable row level security;
alter table public.ai_players   enable row level security;
alter table public.friendships  enable row level security;

-- ---- profiles ---------------------------------------------------------------

-- Anyone (including anonymous users) can read all profiles.
drop policy if exists "profiles: public read"           on public.profiles;
create policy "profiles: public read"
  on public.profiles for select
  using (true);

-- A user may insert and update their OWN profile row only.
drop policy if exists "profiles: own insert"            on public.profiles;
create policy "profiles: own insert"
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists "profiles: own update"            on public.profiles;
create policy "profiles: own update"
  on public.profiles for update
  using (id = auth.uid());

-- ---- daily_photos -----------------------------------------------------------

-- Publicly readable (the client needs URLs to load the photo).
drop policy if exists "daily_photos: public read"       on public.daily_photos;
create policy "daily_photos: public read"
  on public.daily_photos for select
  using (true);

-- Only service-role (server-side pre-stage workflow) may write.
-- Application RLS never permits direct insert/update by a client.
-- (No insert/update policies = service_role only, which bypasses RLS.)

-- ---- ai_players -------------------------------------------------------------

-- Publicly readable (gallery needs model metadata for AI badge display).
drop policy if exists "ai_players: public read"         on public.ai_players;
create policy "ai_players: public read"
  on public.ai_players for select
  using (true);

-- ---- submissions — SELECT (commit-reveal, PRD invariant #5) -----------------
--
-- The rule: a user may read ALL submissions for a given photo ONLY IF:
--   (a) the photo is NOT today's puzzle (past days are always public), OR
--   (b) the photo IS today's puzzle AND the user already has their own
--       submission row for it.
--
-- This is enforced as a single RLS policy via an EXISTS subquery so the
-- check is atomic and server-side — never gated only by hiding a client route.
--
-- Implementation note: "today" is `current_date` in Postgres UTC.
-- The daily rollover at 00:00 UTC means a new day's photo is hidden until
-- the user submits, matching PRD §6.3's per-user reveal rule.
-- ---------------------------------------------------------------------------

drop policy if exists "submissions: commit-reveal read" on public.submissions;
create policy "submissions: commit-reveal read"
  on public.submissions for select
  using (
    -- Past day: always readable.
    (
      select dp.play_date
      from public.daily_photos dp
      where dp.id = daily_photo_id
    ) < current_date
    or
    -- Today: only if the viewer already submitted.
    exists (
      select 1
      from public.submissions s2
      join public.daily_photos dp2 on dp2.id = s2.daily_photo_id
      where s2.player_id  = auth.uid()
        and s2.daily_photo_id = submissions.daily_photo_id
        and dp2.play_date = current_date
    )
  );

-- ---- submissions — INSERT ----------------------------------------------------

-- A logged-in user may insert exactly one submission per day (the UNIQUE
-- constraint on (daily_photo_id, player_id) enforces one-per-day; RLS ensures
-- player_id equals the authenticated user so they can't spoof another's id).
drop policy if exists "submissions: own insert"         on public.submissions;
create policy "submissions: own insert"
  on public.submissions for insert
  with check (
    -- Must be a real authenticated session (not service_role anonymous fake).
    auth.uid() is not null
    and
    -- The player_id on the row being inserted must be the caller.
    player_id = auth.uid()
  );

-- No UPDATE or DELETE policies for submissions — edits are final (PRD §5 step 4:
-- "you can't re-edit today"). Service-role bypass handles admin operations.

-- ---- votes ------------------------------------------------------------------

-- A voter may read votes for submissions they can already see (handled by the
-- submissions commit-reveal policy above indirectly; for votes we allow public
-- read since like counts are displayed in the gallery).
drop policy if exists "votes: public read"              on public.votes;
create policy "votes: public read"
  on public.votes for select
  using (true);

-- A logged-in user may insert a vote — the UNIQUE constraint prevents doubles.
drop policy if exists "votes: own insert"               on public.votes;
create policy "votes: own insert"
  on public.votes for insert
  with check (
    auth.uid() is not null
    and voter_id = auth.uid()
  );

-- A user may delete (unlike) their OWN vote only.
drop policy if exists "votes: own delete"               on public.votes;
create policy "votes: own delete"
  on public.votes for delete
  using (voter_id = auth.uid());

-- ---- friendships (Phase 6 — minimal starter policies) ----------------------

-- Users can see friendships they are a party to.
drop policy if exists "friendships: participant read"   on public.friendships;
create policy "friendships: participant read"
  on public.friendships for select
  using (
    requester_id = auth.uid() or addressee_id = auth.uid()
  );

drop policy if exists "friendships: own insert"         on public.friendships;
create policy "friendships: own insert"
  on public.friendships for insert
  with check (requester_id = auth.uid());

drop policy if exists "friendships: own update"         on public.friendships;
create policy "friendships: own update"
  on public.friendships for update
  using (addressee_id = auth.uid()); -- addressee accepts/declines

-- ---------------------------------------------------------------------------
-- 8. Indexes (for common query patterns)
-- ---------------------------------------------------------------------------

-- Fast lookup of today's photo by play_date (nightly cron + landing query).
create index if not exists idx_daily_photos_play_date
  on public.daily_photos (play_date desc);

-- Gallery query: all submissions for a given photo, ordered by like_count.
create index if not exists idx_submissions_daily_photo_id
  on public.submissions (daily_photo_id);

create index if not exists idx_submissions_daily_photo_likes
  on public.submissions (daily_photo_id, like_count desc);

-- Commit-reveal EXISTS subquery: does player_id have a submission for photo_id?
create index if not exists idx_submissions_player_photo
  on public.submissions (player_id, daily_photo_id);

-- Vote lookup: did voter_id already like submission_id?
create index if not exists idx_votes_submission_voter
  on public.votes (submission_id, voter_id);

-- ---------------------------------------------------------------------------
-- End of 0001_init.sql
-- ---------------------------------------------------------------------------
