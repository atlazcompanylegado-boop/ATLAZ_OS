-- Checkpoint B: preparada e revisada; aplicar somente após aprovação explícita.
-- Não modifica migrations antigas, dados de Clientes/Projetos ou grants de papéis RBAC.
-- Aditiva em projects: só acrescenta um UNIQUE novo (org_id, client_id, id) para permitir a
-- FK tripla de support_tickets abaixo. Nenhuma coluna, dado, trigger, policy ou grant de
-- Projetos é alterado.
ALTER TABLE public.projects ADD CONSTRAINT projects_org_client_id_key UNIQUE (org_id, client_id, id);
--> statement-breakpoint
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificador humano (#1042): gerado pelo banco via IDENTITY, race-safe (garantido pelo
  -- próprio Postgres, sem SELECT MAX()+1), sequência global (não por organização — ver
  -- docs/suporte-checkpoint-a.md §12). GENERATED ALWAYS impede a aplicação de definir o
  -- valor manualmente. Buracos na sequência são aceitáveis (rollback de transação, chamado
  -- nunca persistido) — não há tentativa de renumerar ou preencher lacunas.
  ticket_number bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  org_id uuid NOT NULL,
  client_id uuid NOT NULL,
  project_id uuid,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  assigned_user_id uuid,
  due_at timestamptz,
  resolved_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT support_tickets_org_id_id_key UNIQUE (org_id, id),
  CONSTRAINT support_tickets_ticket_number_key UNIQUE (ticket_number),
  CONSTRAINT support_tickets_org_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE RESTRICT,
  CONSTRAINT support_tickets_client_fkey FOREIGN KEY (org_id, client_id) REFERENCES public.clients(org_id, id) ON DELETE RESTRICT,
  -- FK tripla estrutural (Checkpoint A §8): quando project_id é informado, ele precisa
  -- pertencer exatamente ao mesmo cliente do chamado. MATCH SIMPLE (padrão do Postgres) não
  -- avalia esta constraint quando project_id é NULL — chamado sem projeto passa livre.
  CONSTRAINT support_tickets_project_fkey FOREIGN KEY (org_id, client_id, project_id) REFERENCES public.projects(org_id, client_id, id) ON DELETE RESTRICT,
  CONSTRAINT support_tickets_assignee_fkey FOREIGN KEY (org_id, assigned_user_id) REFERENCES public.memberships(org_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT support_tickets_creator_fkey FOREIGN KEY (org_id, created_by) REFERENCES public.memberships(org_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT support_tickets_title_check CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT support_tickets_description_check CHECK (char_length(btrim(description)) >= 1 AND char_length(description) <= 10000),
  CONSTRAINT support_tickets_status_check CHECK (status IN ('open','triage','in_progress','waiting_client','resolved','cancelled')),
  CONSTRAINT support_tickets_priority_check CHECK (priority IN ('low','normal','high','critical')),
  -- resolved exige resolved_at preenchido; qualquer outro status (incluindo cancelled) exige
  -- resolved_at NULL — cancelar nunca finge resolução (Checkpoint B §15).
  CONSTRAINT support_tickets_resolved_check CHECK (
    (status = 'resolved' AND resolved_at IS NOT NULL) OR (status <> 'resolved' AND resolved_at IS NULL)
  ),
  CONSTRAINT support_tickets_version_check CHECK (version >= 1)
);
CREATE INDEX support_tickets_org_created_idx ON public.support_tickets(org_id, created_at DESC, id);
CREATE INDEX support_tickets_org_updated_idx ON public.support_tickets(org_id, updated_at DESC, id);
CREATE INDEX support_tickets_org_client_idx ON public.support_tickets(org_id, client_id, created_at DESC, id);
CREATE INDEX support_tickets_org_project_idx ON public.support_tickets(org_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX support_tickets_org_status_idx ON public.support_tickets(org_id, status);
CREATE INDEX support_tickets_org_priority_idx ON public.support_tickets(org_id, priority);
CREATE INDEX support_tickets_org_assignee_idx ON public.support_tickets(org_id, assigned_user_id) WHERE assigned_user_id IS NOT NULL;
CREATE INDEX support_tickets_org_due_idx ON public.support_tickets(org_id, due_at, id) WHERE due_at IS NOT NULL;
--> statement-breakpoint
-- Comentários são imutáveis na V1: sem updated_at, sem version, sem exclusão
-- (docs/suporte-checkpoint-a.md §11). Grants abaixo não concedem UPDATE/DELETE a ninguém.
CREATE TABLE public.ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_comments_org_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE RESTRICT,
  CONSTRAINT ticket_comments_ticket_fkey FOREIGN KEY (org_id, ticket_id) REFERENCES public.support_tickets(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT ticket_comments_author_fkey FOREIGN KEY (org_id, author_user_id) REFERENCES public.memberships(org_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT ticket_comments_content_check CHECK (char_length(btrim(content)) >= 1 AND char_length(content) <= 10000)
);
CREATE INDEX ticket_comments_ticket_created_idx ON public.ticket_comments(org_id, ticket_id, created_at, id);
--> statement-breakpoint
CREATE FUNCTION atlaz.validate_ticket_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.ticket_number IS DISTINCT FROM OLD.ticket_number THEN
      RAISE EXCEPTION 'ticket identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'ticket version must advance by one' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.version <> 1 THEN
    RAISE EXCEPTION 'initial ticket version must be one' USING ERRCODE = '23514';
  END IF;
  IF NEW.assigned_user_id IS NOT NULL AND
    (TG_OP = 'INSERT' OR NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id) THEN
    PERFORM 1 FROM public.memberships m JOIN public.users u ON u.id = m.user_id
    WHERE m.org_id = NEW.org_id AND m.user_id = NEW.assigned_user_id AND m.is_active AND u.is_active
    FOR SHARE OF m, u;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid ticket assignee' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_tickets_validate_write BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION atlaz.validate_ticket_write();
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION atlaz.set_updated_at();
REVOKE ALL ON FUNCTION atlaz.validate_ticket_write() FROM PUBLIC;
--> statement-breakpoint
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_tickets_select ON public.support_tickets FOR SELECT TO authenticated USING (
  org_id = atlaz.current_org_id()
  AND atlaz.has_permission('ticket:read')
  AND atlaz.has_permission('client:read')
  -- project:read NUNCA entra aqui: ele só libera detalhes do Projeto vinculado na camada de
  -- serviço (Checkpoint A §5, Opção A). Exigi-lo na RLS do chamado voltaria à Opção B, que
  -- não foi aprovada.
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    JOIN public.roles r ON r.id = m.role_id AND r.org_id = m.org_id
    JOIN public.users u ON u.id = m.user_id AND u.is_active
    WHERE m.org_id = support_tickets.org_id AND m.user_id = atlaz.current_user_id()
      AND m.is_active AND m.scope = 'org'
  )
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.org_id = support_tickets.org_id AND c.id = support_tickets.client_id)
);
-- Comentários herdam a visibilidade do chamado pai (mesmo padrão de client_contacts → clients):
-- o EXISTS reaplica a própria RLS de support_tickets, sem duplicar nenhuma condição de permissão aqui.
CREATE POLICY ticket_comments_select ON public.ticket_comments FOR SELECT TO authenticated USING (
  org_id = atlaz.current_org_id()
  AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.org_id = ticket_comments.org_id AND t.id = ticket_comments.ticket_id)
);
REVOKE ALL ON public.support_tickets, public.ticket_comments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.support_tickets, public.ticket_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO service_role;
-- Sem DELETE em support_tickets (nunca há exclusão — status final preserva histórico) e sem
-- UPDATE/DELETE em ticket_comments (imutáveis na V1): só SELECT/INSERT para service_role.
GRANT SELECT, INSERT ON public.ticket_comments TO service_role;
--> statement-breakpoint
-- Terceiro ramo — substituição única, nunca policy adicional permissiva (que seria
-- combinada via OR). Client e Project mantêm exatamente os predicados anteriores.
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
    OR (entity_type = 'ticket' AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.org_id = activity_events.org_id AND t.id = activity_events.entity_id
    ))
    OR entity_type NOT IN ('client', 'project', 'ticket')
  )
);
-- Client/Project mantêm exatamente o predicado anterior; Ticket aplica a própria RLS
-- (que por sua vez não exige project:read — ver nota acima). Outros tipos mantêm a regra
-- organizacional herdada. Órfãos não são apagados. Grants de activity_events/audit.log
-- permanecem intocados (sem escrita pública).
