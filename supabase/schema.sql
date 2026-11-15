create table public.cm_trophy_registrations (
  registration_number text primary key,
  created_at timestamptz not null default now(),
  category text not null,
  event text not null,
  details jsonb not null check (jsonb_typeof(details) = 'object')
);

alter table public.cm_trophy_registrations enable row level security;
revoke all on public.cm_trophy_registrations from public, anon, authenticated;
grant insert on public.cm_trophy_registrations to service_role;
