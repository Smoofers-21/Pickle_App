-- Pickle: both picks are optional (owner, Nov 12, 2026).
--
-- "Not my ideal place" (the No) used to be required. Now a member may submit
-- a No, a Yes, both or neither; a member with neither simply doesn't move
-- any scores. "Other" text still goes with an "other" No and nothing else.

alter table public.picks alter column no_tag drop not null;

alter table public.picks drop constraint picks_no_other_check;
alter table public.picks
  add constraint picks_no_other_check check (
    (coalesce(no_tag, '') = 'other') = (no_other is not null) and char_length(no_other) <= 30);
