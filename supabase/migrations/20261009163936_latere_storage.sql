create table public.posts (
  id text primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' is not null and data->>'id' = id)
);
alter table public.posts enable row level security;
revoke all on public.posts from anon, authenticated;
grant select, insert, update, delete on public.posts to service_role;

create table public.shots (
  id text primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' is not null and data->>'id' = id)
);
alter table public.shots enable row level security;
revoke all on public.shots from anon, authenticated;
grant select, insert, update, delete on public.shots to service_role;

create table public.requests (
  id text primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' is not null and data->>'id' = id)
);
alter table public.requests enable row level security;
revoke all on public.requests from anon, authenticated;
grant select, insert, update, delete on public.requests to service_role;

create table public.hooks (
  id text primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' is not null and data->>'id' = id)
);
alter table public.hooks enable row level security;
revoke all on public.hooks from anon, authenticated;
grant select, insert, update, delete on public.hooks to service_role;

create table public.lessons (
  id text primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' is not null and data->>'id' = id)
);
alter table public.lessons enable row level security;
revoke all on public.lessons from anon, authenticated;
grant select, insert, update, delete on public.lessons to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 26214400, array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'video/quicktime']);
