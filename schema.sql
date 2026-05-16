-- ============================================================
-- Amazon Insight Hub — Supabase Database Schema
-- ============================================================
-- HOW TO USE:
--   1. Go to your Supabase project → SQL Editor
--   2. Paste this entire file and click "Run"
--   3. All tables, indexes, and policies are created automatically
-- ============================================================

-- Enable UUID extension (already enabled on Supabase by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: asin_searches
-- Stores every ASIN lookup + scoring result for each user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.asin_searches (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Product identity (from Keepa)
  asin              TEXT        NOT NULL,
  title             TEXT,
  brand             TEXT,
  image             TEXT,
  category          TEXT,

  -- Pricing (from Keepa, 90-day data)
  selling_price     NUMERIC(10,2),
  median_price_90d  NUMERIC(10,2),

  -- Profit analysis (Helium 10-style)
  referral_fee      NUMERIC(10,2),
  fba_fee           NUMERIC(10,2),
  storage_fee       NUMERIC(10,4),
  total_fees        NUMERIC(10,2),
  cogs              NUMERIC(10,2) DEFAULT 0,
  profit_per_unit   NUMERIC(10,2),
  roi_pct           NUMERIC(8,2),
  margin_pct        NUMERIC(8,2),
  break_even_price  NUMERIC(10,2),

  -- Scoring result
  decision          TEXT        CHECK (decision IN ('EXCELLENT','GOOD','AVERAGE','BAD','REJECT')),
  score             INTEGER,
  max_score         INTEGER,
  score_pct         NUMERIC(5,1),
  rejection_reasons TEXT[]      DEFAULT '{}',

  -- Keepa metrics snapshot
  current_bsr       INTEGER,
  avg_bsr_90d       INTEGER,
  rating            NUMERIC(3,1),
  review_count      INTEGER,
  fba_seller_count  INTEGER,
  monthly_sales_est INTEGER,
  monthly_revenue   NUMERIC(12,2),
  is_hazmat         BOOLEAN     DEFAULT FALSE,
  amazon_is_seller  BOOLEAN     DEFAULT FALSE
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_asin_searches_user_id    ON public.asin_searches (user_id);
CREATE INDEX IF NOT EXISTS idx_asin_searches_created_at ON public.asin_searches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asin_searches_asin       ON public.asin_searches (asin);
CREATE INDEX IF NOT EXISTS idx_asin_searches_decision   ON public.asin_searches (decision);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Users can only see/modify their own rows
-- ============================================================
ALTER TABLE public.asin_searches ENABLE ROW LEVEL SECURITY;

-- SELECT: users see only their own searches
CREATE POLICY "Users can view own searches"
  ON public.asin_searches FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: users can insert their own searches
CREATE POLICY "Users can insert own searches"
  ON public.asin_searches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- DELETE: users can delete their own searches
CREATE POLICY "Users can delete own searches"
  ON public.asin_searches FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass (used by backend with SERVICE_ROLE_KEY)
-- The service role key automatically bypasses RLS — no extra policy needed.

-- ============================================================
-- VERIFICATION — run after migration to confirm tables exist
-- ============================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
