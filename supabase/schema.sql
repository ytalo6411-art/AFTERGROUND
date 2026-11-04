-- =============================================================================
-- AFTERGROUND — Rebuild What Remains
-- Complete PostgreSQL / Supabase Schema with Row Level Security (RLS)
-- =============================================================================

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Comandante',
  username text NOT NULL DEFAULT ('cmdr_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  avatar_url text,
  username_claimed boolean NOT NULL DEFAULT false,
  email_linked boolean NOT NULL DEFAULT false,
  colony_title text NOT NULL DEFAULT 'Comandante Aegis',
  preferred_language text NOT NULL DEFAULT 'pt-BR',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS colony_title text NOT NULL DEFAULT 'Comandante Aegis',
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_own') THEN
    CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_insert_own') THEN
    CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_own') THEN
    CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- 2. WORLDS
CREATE TABLE IF NOT EXISTS public.worlds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  seed text NOT NULL CHECK (char_length(trim(seed)) BETWEEN 1 AND 64),
  difficulty text NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy', 'normal', 'hard')),
  map_width integer NOT NULL DEFAULT 200 CHECK (map_width BETWEEN 64 AND 512),
  map_height integer NOT NULL DEFAULT 100 CHECK (map_height BETWEEN 64 AND 256),
  day integer NOT NULL DEFAULT 1 CHECK (day >= 1),
  year integer NOT NULL DEFAULT 2241 CHECK (year >= 2189),
  era integer NOT NULL DEFAULT 1 CHECK (era BETWEEN 1 AND 5),
  population integer NOT NULL DEFAULT 0 CHECK (population >= 0),
  play_time_seconds integer NOT NULL DEFAULT 0 CHECK (play_time_seconds >= 0),
  progress_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worlds_user_updated ON public.worlds(user_id, updated_at DESC);
ALTER TABLE public.worlds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'worlds' AND policyname = 'worlds_select_own') THEN
    CREATE POLICY worlds_select_own ON public.worlds FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'worlds' AND policyname = 'worlds_insert_own') THEN
    CREATE POLICY worlds_insert_own ON public.worlds FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'worlds' AND policyname = 'worlds_update_own') THEN
    CREATE POLICY worlds_update_own ON public.worlds FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'worlds' AND policyname = 'worlds_delete_own') THEN
    CREATE POLICY worlds_delete_own ON public.worlds FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. GAME SAVES (Versioned JSON payloads per world and slot)
CREATE TABLE IF NOT EXISTS public.game_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  slot_name text NOT NULL DEFAULT 'autosave' CHECK (char_length(trim(slot_name)) BETWEEN 1 AND 40),
  save_version integer NOT NULL DEFAULT 1 CHECK (save_version >= 1),
  day integer NOT NULL DEFAULT 1,
  year integer NOT NULL DEFAULT 2241,
  population integer NOT NULL DEFAULT 0,
  play_time_seconds integer NOT NULL DEFAULT 0,
  checksum text,
  save_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, world_id, slot_name)
);

CREATE INDEX IF NOT EXISTS idx_game_saves_user_world ON public.game_saves(user_id, world_id, updated_at DESC);
ALTER TABLE public.game_saves ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'game_saves' AND policyname = 'game_saves_select_own') THEN
    CREATE POLICY game_saves_select_own ON public.game_saves FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'game_saves' AND policyname = 'game_saves_insert_own') THEN
    CREATE POLICY game_saves_insert_own ON public.game_saves FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'game_saves' AND policyname = 'game_saves_update_own') THEN
    CREATE POLICY game_saves_update_own ON public.game_saves FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'game_saves' AND policyname = 'game_saves_delete_own') THEN
    CREATE POLICY game_saves_delete_own ON public.game_saves FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- 4. GAME SETTINGS
CREATE TABLE IF NOT EXISTS public.game_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'pt-BR' CHECK (language IN ('pt-BR', 'en-US')),
  master_volume numeric NOT NULL DEFAULT 0.8 CHECK (master_volume BETWEEN 0 AND 1),
  music_volume numeric NOT NULL DEFAULT 0.55 CHECK (music_volume BETWEEN 0 AND 1),
  sfx_volume numeric NOT NULL DEFAULT 0.8 CHECK (sfx_volume BETWEEN 0 AND 1),
  graphics_quality text NOT NULL DEFAULT 'high' CHECK (graphics_quality IN ('low', 'medium', 'high')),
  fps_limit integer NOT NULL DEFAULT 60 CHECK (fps_limit IN (30, 60)),
  autosave_interval_sec integer NOT NULL DEFAULT 60 CHECK (autosave_interval_sec BETWEEN 15 AND 600),
  accessibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  keybindings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'game_settings' AND policyname = 'game_settings_select_own') THEN
    CREATE POLICY game_settings_select_own ON public.game_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'game_settings' AND policyname = 'game_settings_insert_own') THEN
    CREATE POLICY game_settings_insert_own ON public.game_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'game_settings' AND policyname = 'game_settings_update_own') THEN
    CREATE POLICY game_settings_update_own ON public.game_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'game_settings' AND policyname = 'game_settings_delete_own') THEN
    CREATE POLICY game_settings_delete_own ON public.game_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. ACHIEVEMENTS
CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key text NOT NULL CHECK (char_length(trim(achievement_key)) BETWEEN 1 AND 80),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  progress numeric NOT NULL DEFAULT 100,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user ON public.achievements(user_id);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'achievements' AND policyname = 'achievements_select_own') THEN
    CREATE POLICY achievements_select_own ON public.achievements FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'achievements' AND policyname = 'achievements_insert_own') THEN
    CREATE POLICY achievements_insert_own ON public.achievements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'achievements' AND policyname = 'achievements_update_own') THEN
    CREATE POLICY achievements_update_own ON public.achievements FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'achievements' AND policyname = 'achievements_delete_own') THEN
    CREATE POLICY achievements_delete_own ON public.achievements FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- 6. PLAYER STATISTICS
CREATE TABLE IF NOT EXISTS public.player_statistics (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_play_time_seconds integer NOT NULL DEFAULT 0,
  worlds_created integer NOT NULL DEFAULT 0,
  max_population_reached integer NOT NULL DEFAULT 0,
  total_buildings_constructed integer NOT NULL DEFAULT 0,
  total_tiles_excavated integer NOT NULL DEFAULT 0,
  total_technologies_researched integer NOT NULL DEFAULT 0,
  total_expeditions_completed integer NOT NULL DEFAULT 0,
  total_days_survived integer NOT NULL DEFAULT 0,
  history_snapshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_statistics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_statistics' AND policyname = 'player_statistics_select_own') THEN
    CREATE POLICY player_statistics_select_own ON public.player_statistics FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_statistics' AND policyname = 'player_statistics_insert_own') THEN
    CREATE POLICY player_statistics_insert_own ON public.player_statistics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_statistics' AND policyname = 'player_statistics_update_own') THEN
    CREATE POLICY player_statistics_update_own ON public.player_statistics FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_statistics' AND policyname = 'player_statistics_delete_own') THEN
    CREATE POLICY player_statistics_delete_own ON public.player_statistics FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
