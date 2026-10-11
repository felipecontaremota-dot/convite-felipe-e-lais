-- Optional explicit form of address; never inferred from a person's name.
-- No changes to access, RSVP, RPCs, sessions or invitation credentials.
alter table public.guests add column greeting_form text
 constraint guests_greeting_form_check check (greeting_form in ('NEUTRAL','MASCULINE','FEMININE'));
