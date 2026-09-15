-- Fundação sanitizada para PostgreSQL em memória. Nunca executar em Supabase.
-- Estrutura/policies herdadas verificadas no catálogo durante a auditoria.
-- auth.uid() e auth.users abaixo são um substituto de teste, NÃO Supabase Auth.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema atlaz;
create schema audit;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
create table public.orgs (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  name text not null, legal_name text, settings jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.users (
  id uuid primary key default gen_random_uuid(), auth_user_id uuid not null unique,
  email text not null, full_name text not null, avatar_url text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index users_email_key on public.users (lower(email));
create table public.roles (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.orgs on delete cascade,
  key text not null, name text not null, description text, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint roles_org_id_key_key unique (org_id, key)
);
create table public.permissions (key text primary key, resource text not null, action text not null, description text not null);
create table public.role_permissions (
  role_id uuid not null references public.roles on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key(role_id, permission_key)
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.orgs on delete cascade,
  user_id uuid not null references public.users on delete cascade,
  role_id uuid not null references public.roles on delete restrict, job_title text,
  scope text not null default 'org' check (scope in ('org', 'assigned')), is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint memberships_org_id_user_id_key unique(org_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);
create index memberships_org_idx on public.memberships(org_id);
create table public.activity_events (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.orgs on delete cascade,
  entity_type text not null, entity_id uuid not null, kind text not null, summary text not null,
  payload jsonb not null default '{}', actor_user_id uuid references public.users on delete set null,
  source text not null default 'app', occurred_at timestamptz not null default now()
);
create index activity_entity_idx on public.activity_events(entity_type, entity_id, occurred_at desc);
create index activity_org_idx on public.activity_events(org_id, occurred_at desc);
create table audit.log (
  id uuid primary key default gen_random_uuid(), org_id uuid not null, actor_user_id uuid, actor_label text not null,
  action text not null, entity_type text not null, entity_id uuid, before jsonb, after jsonb,
  context jsonb not null default '{}', at timestamptz not null default now()
);
create index audit_log_org_at_idx on audit.log(org_id, at desc);
create index audit_log_entity_idx on audit.log(entity_type, entity_id);
create function atlaz.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger trg_orgs_updated before update on public.orgs for each row execute function atlaz.set_updated_at();
create trigger trg_users_updated before update on public.users for each row execute function atlaz.set_updated_at();
create trigger trg_roles_updated before update on public.roles for each row execute function atlaz.set_updated_at();
create trigger trg_memberships_updated before update on public.memberships for each row execute function atlaz.set_updated_at();
create function atlaz.current_user_id() returns uuid language sql stable security definer set search_path = public as $$
  select u.id from users u where u.auth_user_id = auth.uid() and u.is_active
$$;
create function atlaz.current_org_id() returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_setting text := current_setting('atlaz.org_id', true);
  v_uid uuid := atlaz.current_user_id(); v_org uuid;
begin
  if v_setting is not null and v_setting <> '' then
    select m.org_id into v_org from memberships m where m.user_id = v_uid and m.org_id = v_setting::uuid and m.is_active;
    return v_org;
  end if;
  select m.org_id into v_org from memberships m where m.user_id = v_uid and m.is_active order by m.created_at limit 1;
  return v_org;
end $$;
create function atlaz.is_member() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from memberships m where m.user_id = atlaz.current_user_id() and m.org_id = atlaz.current_org_id() and m.is_active)
$$;
create function atlaz.has_permission(p_permission text) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from memberships m join roles r on r.id = m.role_id left join role_permissions rp on rp.role_id = r.id
    where m.user_id = atlaz.current_user_id() and m.org_id = atlaz.current_org_id() and m.is_active
    and (r.key = 'super_admin' or rp.permission_key = p_permission))
$$;
alter table public.orgs enable row level security;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships enable row level security;
alter table public.activity_events enable row level security;
alter table audit.log enable row level security;
create policy orgs_select on public.orgs for select using (id = atlaz.current_org_id());
create policy orgs_update on public.orgs for update using (id = atlaz.current_org_id() and atlaz.has_permission('settings:manage'));
create policy memberships_select on public.memberships for select using (org_id = atlaz.current_org_id());
create policy memberships_write on public.memberships for all using (org_id = atlaz.current_org_id() and atlaz.has_permission('team:manage')) with check (org_id = atlaz.current_org_id() and atlaz.has_permission('team:manage'));
create policy users_select on public.users for select using (auth_user_id = auth.uid() or exists(
  select 1 from memberships m1 join memberships m2 on m2.org_id = m1.org_id where m1.user_id = atlaz.current_user_id() and m2.user_id = users.id
));
create policy users_update_self on public.users for update using (auth_user_id = auth.uid());
create policy roles_select on public.roles for select using (org_id = atlaz.current_org_id());
create policy roles_write on public.roles for all using (org_id = atlaz.current_org_id() and atlaz.has_permission('team:manage')) with check (org_id = atlaz.current_org_id() and atlaz.has_permission('team:manage'));
create policy permissions_select on public.permissions for select using (atlaz.is_member());
create policy role_permissions_select on public.role_permissions for select using (exists(select 1 from roles r where r.id = role_permissions.role_id and r.org_id = atlaz.current_org_id()));
create policy role_permissions_write on public.role_permissions for all using (atlaz.has_permission('team:manage') and exists(select 1 from roles r where r.id = role_permissions.role_id and r.org_id = atlaz.current_org_id())) with check (atlaz.has_permission('team:manage') and exists(select 1 from roles r where r.id = role_permissions.role_id and r.org_id = atlaz.current_org_id()));
create policy activity_select on public.activity_events for select using (org_id = atlaz.current_org_id() and atlaz.is_member());
create policy activity_insert on public.activity_events for insert with check (org_id = atlaz.current_org_id() and atlaz.is_member());
create policy audit_select on audit.log for select using (org_id = atlaz.current_org_id() and atlaz.has_permission('audit:read'));
create policy audit_insert on audit.log for insert with check (org_id = atlaz.current_org_id());
grant usage on schema public, auth, atlaz to anon, authenticated, service_role;
grant usage on schema audit to authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant select, insert on audit.log to authenticated;
grant all on audit.log to service_role;
