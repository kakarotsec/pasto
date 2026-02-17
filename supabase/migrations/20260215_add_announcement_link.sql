-- Add announcement_link column for custom CTA URL
ALTER TABLE public.clipbeam_admin_settings
  ADD COLUMN IF NOT EXISTS announcement_link TEXT;
