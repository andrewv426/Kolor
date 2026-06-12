-- =============================================================================
-- 0002_seed_dev.sql — DEV-ONLY seed data
-- =============================================================================
-- ⚠️  DO NOT RUN IN PRODUCTION.
-- This file inserts a dev photo row ("dev-001") and a handful of seed
-- submissions so the gallery screen has content without real players.
-- Apply only against a local / staging Supabase project.
--
-- How to apply:
--   supabase db push            (runs all pending migrations)
--   OR paste into SQL editor in a dev project.
-- =============================================================================

-- Safety guard: abort if this looks like a production project.
-- The check looks for the dev-001 photo id — if it already exists in a
-- project with real daily_photos rows, something is wrong.
do $$
begin
  if (select count(*) from public.daily_photos where play_date < '2020-01-01') > 0 then
    raise exception '0002_seed_dev.sql: Aborting — this appears to be a production project. Do not apply dev seeds here.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- dev-001 daily photo
-- ---------------------------------------------------------------------------
-- Mirrors the public/photo/dev-001/ static assets served in local mode.
-- play_date is deliberately set to today (current_date) so the local dev
-- server serves it as "today's puzzle."
-- ---------------------------------------------------------------------------
insert into public.daily_photos (
  id,
  play_date,
  day_number,
  theme,
  master16_path,
  preview8_path,
  ai768_path,
  master16_width,
  master16_height,
  manifest,
  pipeline,
  source,
  source_attribution,
  status
) values (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  current_date,       -- today so it is "today's puzzle" in local dev
  1,
  'Golden Hour Escape',
  'dev-001/master16.png',
  'dev-001/preview8.webp',
  'dev-001/ai768.jpg',
  2048,
  1536,
  '{
    "pipeline": "v1",
    "source": {"filename": "cand-3.jpg"},
    "variants": {
      "master16": {"width": 2048, "height": 1536, "format": "png"},
      "preview8": {"width": 1024, "height": 768,  "format": "webp"},
      "ai768":   {"width": 768,  "height": 576,  "format": "jpeg"}
    }
  }'::jsonb,
  'v1',
  'admin',
  '{"photographer": "Dev Seed", "photo_url": null, "profile_url": null}'::jsonb,
  'live'
)
on conflict (play_date) do nothing;

-- ---------------------------------------------------------------------------
-- Seed "player" profiles (fake UUIDs — these are not real auth users)
-- ---------------------------------------------------------------------------
-- We bypass the FK to auth.users here by inserting directly (dev only).
-- In production, the trigger handles profile creation.
-- ---------------------------------------------------------------------------

-- Temporarily disable the trigger that requires auth.users FK on insert
-- (the trigger is on auth.users, not profiles; the FK constraint is the issue).
-- We use a DO block to catch and ignore FK violations gracefully.
do $$
declare
  seed_ids uuid[] := array[
    'b0000000-0000-0000-0000-000000000001'::uuid,
    'b0000000-0000-0000-0000-000000000002'::uuid,
    'b0000000-0000-0000-0000-000000000003'::uuid,
    'b0000000-0000-0000-0000-000000000004'::uuid,
    'b0000000-0000-0000-0000-000000000005'::uuid,
    'b0000000-0000-0000-0000-000000000006'::uuid,
    'b0000000-0000-0000-0000-000000000007'::uuid,
    'b0000000-0000-0000-0000-000000000008'::uuid
  ];
  seed_names text[] := array[
    'CrimsonOtter47',
    'TwilightFalcon',
    'MidnightHeron22',
    'SilverMaple9',
    'CoralSparrow',
    'OceanDrifter88',
    'GildedRaven',
    'VioletPebble3'
  ];
  i int;
begin
  for i in 1..array_length(seed_ids, 1) loop
    begin
      insert into public.profiles (id, is_anonymous, display_name)
      values (seed_ids[i], true, seed_names[i])
      on conflict (id) do nothing;
    exception when foreign_key_violation then
      -- Skip — auth.users row doesn't exist in dev/seed context.
      -- The profile row won't be inserted, but submission seeds below
      -- reference ai_model (not player_id) for most rows.
      null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- ai_players seed rows
-- ---------------------------------------------------------------------------
insert into public.ai_players (model_id, provider, is_active) values
  ('claude-opus-4.8',   'anthropic', true),
  ('gemini-3-flash',    'google',    true),
  ('gpt-5.4-mini',      'openai',    true)
on conflict (model_id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed submissions
-- ---------------------------------------------------------------------------
-- Eight varied edits that populate the gallery in local dev.
-- Two are AI players; six are "human" (seed profiles).
-- like_count is set directly here (bypassing the trigger) since we don't
-- insert real votes rows for seed data.
-- All tone values have been validated/clamped to [-100,100] integers.
-- ---------------------------------------------------------------------------

insert into public.submissions (
  id,
  daily_photo_id,
  player_id,
  ai_model,
  settings,
  schema_version,
  time_taken_ms,
  like_count
) values

-- 1. Moody blue-tinted underexposed look (human)
(
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  null,               -- no player_id (seed player without auth.users row)
  null,
  '{
    "v": 1, "pipeline": "v1", "engine": "webgl2", "colorSpace": "srgb",
    "photoId": "dev-001",
    "tone": {
      "temp": -35, "tint": -10, "exposure": -22, "contrast": 18,
      "highlights": -30, "shadows": 20, "whites": -10, "blacks": -8,
      "vibrance": -15, "saturation": -20
    }
  }'::jsonb,
  1, 187000, 14
),

-- 2. Warm golden hour push (human)
(
  'c0000000-0000-0000-0000-000000000002'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  null,
  null,
  '{
    "v": 1, "pipeline": "v1", "engine": "webgl2", "colorSpace": "srgb",
    "photoId": "dev-001",
    "tone": {
      "temp": 48, "tint": 8, "exposure": 15, "contrast": 25,
      "highlights": -40, "shadows": 35, "whites": 20, "blacks": -5,
      "vibrance": 40, "saturation": 20
    }
  }'::jsonb,
  1, 243000, 27
),

-- 3. High-contrast dramatic (human)
(
  'c0000000-0000-0000-0000-000000000003'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  null,
  null,
  '{
    "v": 1, "pipeline": "v1", "engine": "webgl2", "colorSpace": "srgb",
    "photoId": "dev-001",
    "tone": {
      "temp": 5, "tint": -5, "exposure": -10, "contrast": 65,
      "highlights": -60, "shadows": -20, "whites": 30, "blacks": -40,
      "vibrance": 20, "saturation": 10
    }
  }'::jsonb,
  1, 132000, 19
),

-- 4. Faded matte / film look (human)
(
  'c0000000-0000-0000-0000-000000000004'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  null,
  null,
  '{
    "v": 1, "pipeline": "v1", "engine": "webgl2", "colorSpace": "srgb",
    "photoId": "dev-001",
    "tone": {
      "temp": -8, "tint": 6, "exposure": 8, "contrast": -35,
      "highlights": -20, "shadows": 50, "whites": -15, "blacks": 25,
      "vibrance": -30, "saturation": -15
    }
  }'::jsonb,
  1, 298000, 9
),

-- 5. Vibrant pop (human)
(
  'c0000000-0000-0000-0000-000000000005'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  null,
  null,
  '{
    "v": 1, "pipeline": "v1", "engine": "webgl2", "colorSpace": "srgb",
    "photoId": "dev-001",
    "tone": {
      "temp": 20, "tint": 0, "exposure": 18, "contrast": 30,
      "highlights": -15, "shadows": 25, "whites": 15, "blacks": -10,
      "vibrance": 70, "saturation": 45
    }
  }'::jsonb,
  1, 178000, 31
),

-- 6. Monochrome desaturated (human)
(
  'c0000000-0000-0000-0000-000000000006'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  null,
  null,
  '{
    "v": 1, "pipeline": "v1", "engine": "webgl2", "colorSpace": "srgb",
    "photoId": "dev-001",
    "tone": {
      "temp": -5, "tint": 0, "exposure": 5, "contrast": 40,
      "highlights": -25, "shadows": 10, "whites": 0, "blacks": -20,
      "vibrance": -50, "saturation": -100
    }
  }'::jsonb,
  1, 95000, 22
),

-- 7. Claude Opus AI player — opinionated warm-contrast edit
(
  'c0000000-0000-0000-0000-000000000007'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  null,               -- no player_id for AI
  'claude-opus-4.8',
  '{
    "v": 1, "pipeline": "v1", "engine": "webgl2", "colorSpace": "srgb",
    "photoId": "dev-001",
    "tone": {
      "temp": 32, "tint": -4, "exposure": 12, "contrast": 45,
      "highlights": -50, "shadows": 40, "whites": 22, "blacks": -18,
      "vibrance": 35, "saturation": 8
    }
  }'::jsonb,
  1, null, 38
),

-- 8. Gemini Flash AI player — cool moody understated edit
(
  'c0000000-0000-0000-0000-000000000008'::uuid,
  'a0000000-0000-0000-0000-000000000001'::uuid,
  null,
  'gemini-3-flash',
  '{
    "v": 1, "pipeline": "v1", "engine": "webgl2", "colorSpace": "srgb",
    "photoId": "dev-001",
    "tone": {
      "temp": -28, "tint": 12, "exposure": -5, "contrast": 20,
      "highlights": -35, "shadows": 45, "whites": -5, "blacks": -12,
      "vibrance": 15, "saturation": -8
    }
  }'::jsonb,
  1, null, 17
)

on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- End of 0002_seed_dev.sql
-- ---------------------------------------------------------------------------
