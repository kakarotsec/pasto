-- Create clipbeam_sessions table
CREATE TABLE IF NOT EXISTS public.clipbeam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_ip JSONB,
  ended_at TIMESTAMPTZ
);

-- Create clipbeam_items table
CREATE TABLE IF NOT EXISTS public.clipbeam_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.clipbeam_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  text_content TEXT,
  file_name TEXT,
  file_size BIGINT,
  mime_type TEXT,
  file_path TEXT
);

-- Create clipbeam_join_attempts table
CREATE TABLE IF NOT EXISTS public.clipbeam_join_attempts (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip JSONB NOT NULL,
  session_code TEXT,
  success BOOLEAN NOT NULL
);

-- Enable RLS on all three tables (edge functions will use service role and bypass RLS)
ALTER TABLE public.clipbeam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clipbeam_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clipbeam_join_attempts ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for now (no direct client access; all access via backend functions)
CREATE POLICY "no_direct_select_clipbeam_sessions" ON public.clipbeam_sessions
  FOR SELECT USING (false);
CREATE POLICY "no_direct_modify_clipbeam_sessions" ON public.clipbeam_sessions
  FOR ALL USING (false) WITH CHECK (false);

CREATE POLICY "no_direct_select_clipbeam_items" ON public.clipbeam_items
  FOR SELECT USING (false);
CREATE POLICY "no_direct_modify_clipbeam_items" ON public.clipbeam_items
  FOR ALL USING (false) WITH CHECK (false);

CREATE POLICY "no_direct_select_clipbeam_join_attempts" ON public.clipbeam_join_attempts
  FOR SELECT USING (false);
CREATE POLICY "no_direct_modify_clipbeam_join_attempts" ON public.clipbeam_join_attempts
  FOR ALL USING (false) WITH CHECK (false);

-- Create storage bucket for items if it does not exist yet
INSERT INTO storage.buckets (id, name, public)
VALUES ('clipbeam-items', 'clipbeam-items', false)
ON CONFLICT (id) DO NOTHING;