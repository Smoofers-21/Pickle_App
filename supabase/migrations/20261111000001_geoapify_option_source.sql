-- Allow the new provider's results to be cached. Keep the legacy source
-- value for historical rows; do not mislabel Google data as Geoapify/OSM.
alter table public.options
  drop constraint options_source_check,
  add constraint options_source_check
    check (source in ('geoapify', 'ticketmaster', 'google'));
