begin;

create table if not exists public.cm_trophy_event_settings (
  event text primary key,
  registration_open boolean not null default true
);

alter table public.cm_trophy_event_settings enable row level security;
revoke all on public.cm_trophy_event_settings from public, anon, authenticated;
grant select on public.cm_trophy_event_settings to service_role;

insert into public.cm_trophy_event_settings (event) values
  ('marathon'),
  ('cricket'),
  ('football-men'),
  ('football-women'),
  ('volleyball'),
  ('badminton'),
  ('carrom'),
  ('group-dance'),
  ('fugdi'),
  ('ghumat-aarti-men'),
  ('ghumat-aarti-women'),
  ('street-play'),
  ('solo-singing'),
  ('rangoli'),
  ('painting')
on conflict (event) do nothing;

create or replace function public.cm_trophy_check_event_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_open boolean;
begin
  select registration_open into is_open
  from public.cm_trophy_event_settings
  where event = new.event
  for share;

  if not found then
    raise exception using errcode = 'PT503', message = 'Registration availability is temporarily unavailable.';
  end if;
  if is_open is not true then
    raise exception using errcode = 'PT409', message = 'Registration for the selected event is not open now.';
  end if;
  return new;
end;
$$;

revoke all on function public.cm_trophy_check_event_open() from public, anon, authenticated;
drop trigger if exists cm_trophy_check_event_open on public.cm_trophy_registrations;
create trigger cm_trophy_check_event_open
before insert on public.cm_trophy_registrations
for each row execute function public.cm_trophy_check_event_open();

commit;
