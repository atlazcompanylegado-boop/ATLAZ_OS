-- RLS, funções auxiliares e trigger de sincronização auth.users -> profiles.
-- Não gerado pelo Drizzle (schema TS só descreve tabelas/colunas/FKs) — ver docs/banco.md §2
-- e docs/seguranca.md §3-4. Escrito à mão, versionado como qualquer outra migration.

-- 1) Sincroniza profiles a partir de auth.users no signup/convite (Supabase Auth).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2) Organizações do usuário autenticado — base de toda policy de isolamento por org.
create or replace function public.auth_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.memberships where user_id = auth.uid();
$$;

-- 3) RLS ligado em toda tabela de negócio desde a Fase 0.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;

-- organizations: membro lê a própria organização.
create policy "member reads own org" on public.organizations
  for select
  using (id in (select public.auth_org_ids()));

-- profiles: usuário lê e atualiza o próprio perfil.
create policy "user reads own profile" on public.profiles
  for select
  using (id = auth.uid());

create policy "user updates own profile" on public.profiles
  for update
  using (id = auth.uid());

-- profiles: enxerga perfis de quem está na mesma organização (para telas como Equipe).
create policy "user reads profiles from same org" on public.profiles
  for select
  using (
    id in (
      select user_id from public.memberships
      where org_id in (select public.auth_org_ids())
    )
  );

-- memberships: qualquer membro lê os vínculos da própria organização.
create policy "member reads memberships of own org" on public.memberships
  for select
  using (org_id in (select public.auth_org_ids()));

-- memberships: só super_admin/ceo da organização criam, alteram ou removem vínculos.
create policy "only super_admin or ceo manage memberships" on public.memberships
  for all
  using (
    org_id in (select public.auth_org_ids())
    and exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid()
        and m.org_id = memberships.org_id
        and m.role in ('super_admin', 'ceo')
    )
  )
  with check (
    org_id in (select public.auth_org_ids())
    and exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid()
        and m.org_id = memberships.org_id
        and m.role in ('super_admin', 'ceo')
    )
  );

-- audit_log: leitura só para super_admin/ceo da organização. Sem policy de escrita para
-- o papel "authenticated" — só a service layer grava, usando a conexão direta (Fase 1+).
create policy "super_admin or ceo read audit log" on public.audit_log
  for select
  using (
    org_id in (select public.auth_org_ids())
    and exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid()
        and m.org_id = audit_log.org_id
        and m.role in ('super_admin', 'ceo')
    )
  );
