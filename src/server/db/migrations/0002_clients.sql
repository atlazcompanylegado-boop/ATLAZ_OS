-- DDL deliberado; a reconciliação da fundação foi somente representacional.
-- Não altera tabelas herdadas, dados, grants de papéis de negócio ou Supabase Auth.
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  trade_name text,
  legal_name text,
  person_type text,
  document text,
  status text NOT NULL DEFAULT 'lead',
  source text,
  owner_user_id uuid,
  website text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT clients_org_id_id_key UNIQUE (org_id, id),
  CONSTRAINT clients_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE RESTRICT,
  CONSTRAINT clients_owner_membership_fkey FOREIGN KEY (org_id, owner_user_id) REFERENCES public.memberships(org_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT clients_creator_membership_fkey FOREIGN KEY (org_id, created_by) REFERENCES public.memberships(org_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT clients_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT clients_trade_name_check CHECK (trade_name IS NULL OR char_length(btrim(trade_name)) BETWEEN 1 AND 160),
  CONSTRAINT clients_legal_name_check CHECK (legal_name IS NULL OR char_length(btrim(legal_name)) BETWEEN 1 AND 200),
  CONSTRAINT clients_person_type_check CHECK (person_type IS NULL OR person_type IN ('individual', 'company')),
  CONSTRAINT clients_document_check CHECK (document IS NULL OR (person_type IS NOT NULL AND (
    (person_type = 'individual' AND document ~ '^[0-9]{11}$') OR
    (person_type = 'company' AND document ~ '^[A-Z0-9]{12}[0-9]{2}$')
  ))),
  CONSTRAINT clients_status_check CHECK (status IN ('lead', 'onboarding', 'active', 'paused', 'closed')),
  CONSTRAINT clients_source_check CHECK (source IS NULL OR char_length(btrim(source)) BETWEEN 1 AND 120),
  CONSTRAINT clients_website_check CHECK (website IS NULL OR (char_length(website) <= 2048 AND website ~ '^https?://[^[:space:]]+$')),
  CONSTRAINT clients_notes_check CHECK (notes IS NULL OR char_length(notes) <= 10000),
  CONSTRAINT clients_version_check CHECK (version >= 1)
);
CREATE UNIQUE INDEX clients_org_document_key ON public.clients(org_id, document) WHERE document IS NOT NULL;
CREATE INDEX clients_org_created_idx ON public.clients(org_id, created_at DESC, id);
CREATE INDEX clients_org_updated_idx ON public.clients(org_id, updated_at DESC, id);
CREATE INDEX clients_org_name_idx ON public.clients(org_id, name, id);
CREATE INDEX clients_org_status_idx ON public.clients(org_id, status);
CREATE INDEX clients_org_owner_idx ON public.clients(org_id, owner_user_id) WHERE owner_user_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  client_id uuid NOT NULL,
  name text NOT NULL,
  job_title text,
  type text,
  email text,
  phone text,
  whatsapp text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_contacts_client_fkey FOREIGN KEY (org_id, client_id) REFERENCES public.clients(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT client_contacts_creator_membership_fkey FOREIGN KEY (org_id, created_by) REFERENCES public.memberships(org_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT client_contacts_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT client_contacts_job_title_check CHECK (job_title IS NULL OR char_length(btrim(job_title)) BETWEEN 1 AND 120),
  CONSTRAINT client_contacts_type_check CHECK (type IS NULL OR char_length(btrim(type)) BETWEEN 1 AND 60),
  CONSTRAINT client_contacts_email_check CHECK (email IS NULL OR (char_length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
  CONSTRAINT client_contacts_phone_check CHECK (phone IS NULL OR phone ~ '^[0-9]{8,15}$'),
  CONSTRAINT client_contacts_whatsapp_check CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{8,15}$'),
  CONSTRAINT client_contacts_notes_check CHECK (notes IS NULL OR char_length(notes) <= 5000)
);
CREATE UNIQUE INDEX client_contacts_primary_key ON public.client_contacts(org_id, client_id) WHERE is_primary;
CREATE INDEX client_contacts_client_idx ON public.client_contacts(org_id, client_id, name, id);
--> statement-breakpoint
-- Mesma seleção da sessão: vínculo ativo mais antigo, com desempate estável.
-- Preserva o override organizacional previamente existente e sua validação.
CREATE OR REPLACE FUNCTION atlaz.current_org_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_setting text := current_setting('atlaz.org_id', true);
  v_uid uuid := atlaz.current_user_id();
  v_org uuid;
BEGIN
  IF v_setting IS NOT NULL AND v_setting <> '' THEN
    SELECT m.org_id INTO v_org FROM public.memberships m
    WHERE m.user_id = v_uid AND m.org_id = v_setting::uuid AND m.is_active;
    RETURN v_org;
  END IF;
  SELECT m.org_id INTO v_org FROM public.memberships m
  WHERE m.user_id = v_uid AND m.is_active
  ORDER BY m.created_at, m.id LIMIT 1;
  RETURN v_org;
END $$;
--> statement-breakpoint
CREATE FUNCTION atlaz.validate_client_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'client identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'client version must advance by one' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.version <> 1 THEN
    RAISE EXCEPTION 'initial client version must be one' USING ERRCODE = '23514';
  END IF;
  IF NEW.owner_user_id IS NOT NULL AND
     (TG_OP = 'INSERT' OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id) THEN
    PERFORM 1 FROM public.memberships m JOIN public.users u ON u.id = m.user_id
    WHERE m.org_id = NEW.org_id AND m.user_id = NEW.owner_user_id AND m.is_active AND u.is_active
    FOR SHARE OF m, u;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid client owner' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clients_validate_write BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION atlaz.validate_client_write();
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION atlaz.set_updated_at();
--> statement-breakpoint
CREATE FUNCTION atlaz.validate_client_contact_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'contact identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_contacts_validate_write BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION atlaz.validate_client_contact_write();
CREATE TRIGGER client_contacts_updated_at BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION atlaz.set_updated_at();
--> statement-breakpoint
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated USING (
  org_id = atlaz.current_org_id()
  AND atlaz.has_permission('client:read')
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    JOIN public.roles r ON r.id = m.role_id AND r.org_id = m.org_id
    WHERE m.org_id = clients.org_id AND m.user_id = atlaz.current_user_id()
      AND m.is_active AND m.scope = 'org'
  )
);
CREATE POLICY client_contacts_select ON public.client_contacts FOR SELECT TO authenticated USING (
  org_id = atlaz.current_org_id()
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.org_id = client_contacts.org_id AND c.id = client_contacts.client_id)
);
-- Mutations somente via servidor para não contornar ator, versão e auditoria atômica.
-- REVOKE explícito neutraliza inclusive os default privileges herdados do Supabase.
REVOKE ALL ON public.clients, public.client_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.clients, public.client_contacts TO authenticated;
-- Mantém administração confiável e não expõe service_role no frontend.
GRANT SELECT, INSERT, UPDATE ON public.clients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO service_role;
REVOKE ALL ON FUNCTION atlaz.validate_client_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION atlaz.validate_client_contact_write() FROM PUBLIC;
