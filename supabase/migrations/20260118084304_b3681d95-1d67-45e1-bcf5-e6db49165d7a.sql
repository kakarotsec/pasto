-- Enable extensions needed for scheduled HTTP calls
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Add configurable session TTL (in hours) to admin settings
alter table public.clipbeam_admin_settings
add column if not exists session_ttl_hours integer not null default 24;

comment on column public.clipbeam_admin_settings.session_ttl_hours is 'Inactivity TTL (hours) after which sessions are expired and fully purged by the hourly cleanup job.';

-- Ensure existing rows have a value (defensive)
update public.clipbeam_admin_settings
set session_ttl_hours = 24
where session_ttl_hours is null;