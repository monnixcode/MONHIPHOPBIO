-- ==========================================================
-- Mon HipHop Bio — Supabase schema (run once in the SQL Editor)
-- Safe to re-run (idempotent)
--
-- Creates:
--   * profiles  : artist profiles (unique username, display name, bio, avatar)
--   * links     : bio link buttons (order, on/off, click count)
--   * RLS       : everyone can read; owners can change only their own rows
--   * trigger   : create the profile automatically on sign-up
--   * RPC       : is_username_available(), track_click()
--   * storage   : bucket "avatars" for profile photos
-- ==========================================================

begin;

-- 1. HELPERS -------------------------------------------------
create or replace function public.is_valid_username(u text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select u ~ '^[a-z0-9_]{3,30}$'
       and lower(u) not in ('admin','login','dashboard','profile','api','assets',
                            'www','u','about','help','support','mon','root','null');
$$;

-- 2. TABLES ---------------------------------------------------
create table if not exists public.profiles (
    id           uuid primary key references auth.users(id) on delete cascade,
    username     text not null unique,
    display_name text not null default '' check (char_length(display_name) <= 60),
    bio          text not null default '' check (char_length(bio) <= 280),
    avatar_url   text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint profiles_username_format check (public.is_valid_username(username))
);

create table if not exists public.links (
    id          uuid primary key default gen_random_uuid(),
    profile_id  uuid not null references public.profiles(id) on delete cascade,
    title       text not null check (char_length(title) between 1 and 80),
    url         text not null check (char_length(url) <= 500 and url ~* '^https?://[^\s]+$'),
    position    integer not null default 0,
    active      boolean not null default true,
    clicks      integer not null default 0 check (clicks >= 0),
    created_at  timestamptz not null default now()
);

create index if not exists links_profile_idx on public.links (profile_id, position);

-- 3. TRIGGERS --------------------------------------------------
-- 3.1 normalise + guard profiles
create or replace function public.guard_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.username     := lower(trim(new.username));
    new.display_name := trim(coalesce(new.display_name, ''));
    new.bio          := trim(coalesce(new.bio, ''));
    if not public.is_valid_username(new.username) then
        raise exception 'username_invalid' using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' then
        new.id         := old.id;
        new.created_at := old.created_at;
    end if;
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
    before insert or update on public.profiles
    for each row execute function public.guard_profile();

-- 3.2 max 30 links per profile, normalise title/url
create or replace function public.guard_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.title := trim(coalesce(new.title, ''));
    new.url   := trim(coalesce(new.url, ''));
    if tg_op = 'INSERT' then
        if (select count(*) from public.links l where l.profile_id = new.profile_id) >= 30 then
            raise exception 'link_limit' using errcode = 'check_violation';
        end if;
    else
        new.profile_id := old.profile_id;  -- owner can never move a link to another profile
    end if;
    return new;
end;
$$;

drop trigger if exists links_guard on public.links;
create trigger links_guard
    before insert or update on public.links
    for each row execute function public.guard_link();

-- 3.3 create profile automatically when someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    uname text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
    dname text := left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 60);
begin
    if not public.is_valid_username(uname) or exists (select 1 from public.profiles where username = uname) then
        uname := 'user' || substr(replace(new.id::text, '-', ''), 1, 12);
    end if;
    insert into public.profiles (id, username, display_name)
    values (new.id, uname, dname);
    return new;
exception when unique_violation then
    insert into public.profiles (id, username, display_name)
    values (new.id, 'user' || substr(replace(new.id::text, '-', ''), 1, 12), dname);
    return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- 4. RPC -------------------------------------------------------
create or replace function public.is_username_available(u text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_valid_username(lower(trim(u)))
       and not exists (select 1 from public.profiles p where p.username = lower(trim(u)));
$$;

create or replace function public.track_click(p_link uuid)
returns void
language sql
security definer
set search_path = public
as $$
    update public.links set clicks = clicks + 1
    where id = p_link and active = true;
$$;

revoke all on function public.is_username_available(text) from public;
revoke all on function public.track_click(uuid)           from public;
grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.track_click(uuid)           to anon, authenticated;

-- 5. ROW LEVEL SECURITY -----------------------------------------
alter table public.profiles enable row level security;
alter table public.links    enable row level security;

drop policy if exists "profiles public read"  on public.profiles;
drop policy if exists "profiles owner update" on public.profiles;
drop policy if exists "links public read"     on public.links;
drop policy if exists "links owner insert"    on public.links;
drop policy if exists "links owner update"    on public.links;
drop policy if exists "links owner delete"    on public.links;

create policy "profiles public read"
on public.profiles for select to anon, authenticated
using (true);

create policy "profiles owner update"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- anon sees only active links; the owner sees all of their own links
create policy "links public read"
on public.links for select to anon, authenticated
using (
    active = true
    or profile_id = auth.uid()
);

create policy "links owner insert"
on public.links for insert to authenticated
with check (profile_id = auth.uid());

create policy "links owner update"
on public.links for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "links owner delete"
on public.links for delete to authenticated
using (profile_id = auth.uid());

-- column-level grants: the browser can never set clicks, id or profile_id directly
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (username, display_name, bio, avatar_url) on public.profiles to authenticated;

revoke all on public.links from anon, authenticated;
grant select on public.links to anon, authenticated;
grant insert (profile_id, title, url, position, active) on public.links to authenticated;
grant update (title, url, position, active)              on public.links to authenticated;
grant delete on public.links to authenticated;

-- 6. STORAGE: avatars (public read, owner folder write) ------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars public read"  on storage.objects;
drop policy if exists "avatars owner insert" on storage.objects;
drop policy if exists "avatars owner update" on storage.objects;
drop policy if exists "avatars owner delete" on storage.objects;

create policy "avatars public read"
on storage.objects for select to anon, authenticated
using (bucket_id = 'avatars');

create policy "avatars owner insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars owner update"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars owner delete"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

commit;

-- CHECK (you should see two rows with counts)
select 'profiles' as table_name, count(*) from public.profiles
union all
select 'links', count(*) from public.links;
