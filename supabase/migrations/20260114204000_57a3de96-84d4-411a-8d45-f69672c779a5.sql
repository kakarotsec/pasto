-- Admin attempts log
CREATE TABLE public.clipbeam_admin_attempts (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT,
  success BOOLEAN NOT NULL
);

ALTER TABLE public.clipbeam_admin_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access admin attempts"
ON public.clipbeam_admin_attempts
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Cleanup events log
CREATE TABLE public.clipbeam_cleanup_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_items INTEGER NOT NULL,
  deleted_bytes BIGINT NOT NULL
);

ALTER TABLE public.clipbeam_cleanup_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access cleanup events"
ON public.clipbeam_cleanup_events
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');