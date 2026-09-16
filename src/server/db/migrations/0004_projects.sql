-- Checkpoint B: preparada e revisada; aplicar somente após aprovação explícita.
-- Não modifica migrations antigas, dados de Clientes ou grants de papéis RBAC.
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  client_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'planning',
  priority text NOT NULL DEFAULT 'normal',
  owner_user_id uuid,
  start_date date,
  due_date date,
  completed_at timestamptz,
  progress integer,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT projects_org_id_id_key UNIQUE (org_id, id),
  CONSTRAINT projects_org_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE RESTRICT,
  CONSTRAINT projects_client_fkey FOREIGN KEY (org_id, client_id) REFERENCES public.clients(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT projects_owner_fkey FOREIGN KEY (org_id, owner_user_id) REFERENCES public.memberships(org_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT projects_creator_fkey FOREIGN KEY (org_id, created_by) REFERENCES public.memberships(org_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT projects_name_check CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 160),
  CONSTRAINT projects_description_check CHECK (description IS NULL OR (char_length(btrim(description)) >= 1 AND char_length(description) <= 10000)),
  CONSTRAINT projects_status_check CHECK (status IN ('planning','active','paused','review','completed','cancelled')),
  CONSTRAINT projects_priority_check CHECK (priority IN ('low','normal','high','urgent')),
  CONSTRAINT projects_progress_check CHECK (progress IS NULL OR progress BETWEEN 0 AND 100),
  CONSTRAINT projects_dates_check CHECK (start_date IS NULL OR due_date IS NULL OR due_date >= start_date),
  -- IS NOT NULL explícito evita que SQL UNKNOWN aceite completed com progress NULL.
  CONSTRAINT projects_completed_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL AND progress IS NOT NULL AND progress = 100)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT projects_version_check CHECK (version >= 1)
);
CREATE INDEX projects_org_client_created_idx ON public.projects(org_id, client_id, created_at DESC, id);
CREATE INDEX projects_org_created_idx ON public.projects(org_id, created_at DESC, id);
CREATE INDEX projects_org_updated_idx ON public.projects(org_id, updated_at DESC, id);
CREATE INDEX projects_org_name_idx ON public.projects(org_id, name, id);
CREATE INDEX projects_org_status_idx ON public.projects(org_id, status);
CREATE INDEX projects_org_owner_idx ON public.projects(org_id, owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX projects_org_due_idx ON public.projects(org_id, due_date, id) WHERE due_date IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION atlaz.validate_project_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'project identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'project version must advance by one' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.version <> 1 THEN
    RAISE EXCEPTION 'initial project version must be one' USING ERRCODE = '23514';
  END IF;
  IF NEW.owner_user_id IS NOT NULL AND
    (TG_OP = 'INSERT' OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id) THEN
    PERFORM 1 FROM public.memberships m JOIN public.users u ON u.id = m.user_id
    WHERE m.org_id = NEW.org_id AND m.user_id = NEW.owner_user_id AND m.is_active AND u.is_active
    FOR SHARE OF m, u;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid project owner' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER projects_validate_write BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION atlaz.validate_project_write();
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION atlaz.set_updated_at();
REVOKE ALL ON FUNCTION atlaz.validate_project_write() FROM PUBLIC;
--> statement-breakpoint
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated USING (
  org_id = atlaz.current_org_id()
  AND atlaz.has_permission('project:read')
  AND atlaz.has_permission('client:read')
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    JOIN public.roles r ON r.id = m.role_id AND r.org_id = m.org_id
    JOIN public.users u ON u.id = m.user_id AND u.is_active
    WHERE m.org_id = projects.org_id AND m.user_id = atlaz.current_user_id()
      AND m.is_active AND m.scope = 'org'
  )
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.org_id = projects.org_id AND c.id = projects.client_id)
);
-- Revogar também default privileges de service_role antes de conceder o mínimo.
REVOKE ALL ON public.projects FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.projects TO service_role;
--> statement-breakpoint
-- Substituição, não policy adicional permissiva (que seria combinada via OR).
DROP POLICY activity_select ON public.activity_events;
CREATE POLICY activity_select ON public.activity_events FOR SELECT TO authenticated USING (
  org_id = atlaz.current_org_id()
  AND atlaz.is_member()
  AND (
    (entity_type = 'client' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.org_id = activity_events.org_id AND c.id = activity_events.entity_id
    ))
    OR (entity_type = 'project' AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.org_id = activity_events.org_id AND p.id = activity_events.entity_id
    ))
    OR entity_type NOT IN ('client', 'project')
  )
);
-- Cliente mantém exatamente o predicado anterior; Projects aplica a própria RLS.
-- Outros tipos mantêm a regra organizacional herdada. Órfãos não são apagados.
-- Grants de activity_events/audit.log permanecem intocados (sem escrita pública).
