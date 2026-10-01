CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"domain_name" text NOT NULL,
	"registrar" text,
	"registration_date" date,
	"expiration_date" date NOT NULL,
	"auto_renew_status" text DEFAULT 'unknown' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"owner_user_id" uuid,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "domains_org_id_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "domains_name_check" CHECK ("domains"."domain_name" = lower("domains"."domain_name") and "domains"."domain_name" !~ '\.$' and char_length("domains"."domain_name") between 1 and 253),
	CONSTRAINT "domains_registrar_check" CHECK ("domains"."registrar" is null or (char_length(btrim("domains"."registrar")) >= 1 and char_length("domains"."registrar") <= 160)),
	CONSTRAINT "domains_notes_check" CHECK ("domains"."notes" is null or (char_length(btrim("domains"."notes")) >= 1 and char_length("domains"."notes") <= 2000)),
	CONSTRAINT "domains_status_check" CHECK ("domains"."status" in ('active','transferring','inactive')),
	CONSTRAINT "domains_auto_renew_check" CHECK ("domains"."auto_renew_status" in ('configured','disabled','unknown')),
	CONSTRAINT "domains_dates_check" CHECK ("domains"."registration_date" is null or "domains"."expiration_date" >= "domains"."registration_date"),
	CONSTRAINT "domains_version_check" CHECK ("domains"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_org_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_client_fkey" FOREIGN KEY ("org_id","client_id") REFERENCES "public"."clients"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_project_fkey" FOREIGN KEY ("org_id","client_id","project_id") REFERENCES "public"."projects"("org_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_owner_fkey" FOREIGN KEY ("org_id","owner_user_id") REFERENCES "public"."memberships"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_creator_fkey" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."memberships"("org_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domains_org_active_name_key" ON "domains" USING btree ("org_id","domain_name") WHERE "domains"."status" <> 'inactive';--> statement-breakpoint
CREATE INDEX "domains_org_client_idx" ON "domains" USING btree ("org_id","client_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "domains_org_project_idx" ON "domains" USING btree ("org_id","project_id") WHERE "domains"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "domains_org_status_idx" ON "domains" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "domains_org_expiration_idx" ON "domains" USING btree ("org_id","expiration_date","id");--> statement-breakpoint
CREATE INDEX "domains_org_owner_idx" ON "domains" USING btree ("org_id","owner_user_id") WHERE "domains"."owner_user_id" is not null;--> statement-breakpoint
CREATE INDEX "domains_org_created_idx" ON "domains" USING btree ("org_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "domains_org_updated_idx" ON "domains" USING btree ("org_id","updated_at" DESC NULLS LAST,"id");
--> statement-breakpoint
-- Checkpoint B de Domínios: preparada e revisada; aplicar somente após aprovação explícita.
-- Não modifica migrations antigas nem nenhum dado/tabela existente de Clientes/Projetos/Suporte.
-- Nenhuma constraint nova em projects: a FK tripla acima já reaproveita o UNIQUE(org_id,
-- client_id, id) aditivo criado pela 0005 (para Suporte) — não é necessário criar outro.
CREATE FUNCTION atlaz.validate_domain_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.domain_name IS DISTINCT FROM OLD.domain_name
      OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'domain identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'domain version must advance by one' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.version <> 1 THEN
    RAISE EXCEPTION 'initial domain version must be one' USING ERRCODE = '23514';
  END IF;
  IF NEW.owner_user_id IS NOT NULL AND
    (TG_OP = 'INSERT' OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id) THEN
    PERFORM 1 FROM public.memberships m JOIN public.users u ON u.id = m.user_id
    WHERE m.org_id = NEW.org_id AND m.user_id = NEW.owner_user_id AND m.is_active AND u.is_active
    FOR SHARE OF m, u;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid domain owner' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER domains_validate_write BEFORE INSERT OR UPDATE ON public.domains
  FOR EACH ROW EXECUTE FUNCTION atlaz.validate_domain_write();
CREATE TRIGGER domains_updated_at BEFORE UPDATE ON public.domains
  FOR EACH ROW EXECUTE FUNCTION atlaz.set_updated_at();
REVOKE ALL ON FUNCTION atlaz.validate_domain_write() FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY domains_select ON public.domains FOR SELECT TO authenticated USING (
  org_id = atlaz.current_org_id()
  AND atlaz.has_permission('domain:read')
  AND atlaz.has_permission('client:read')
  -- project:read NUNCA entra aqui: ele só libera detalhes do Projeto vinculado na camada de
  -- serviço (Checkpoint A §6, mesmo desenho de support_tickets_select). Exigi-lo na RLS do
  -- domínio bloquearia o domínio inteiro por causa de um vínculo opcional, o que não foi aprovado.
  AND EXISTS (
    SELECT 1 FROM public.memberships m
    JOIN public.roles r ON r.id = m.role_id AND r.org_id = m.org_id
    JOIN public.users u ON u.id = m.user_id AND u.is_active
    WHERE m.org_id = domains.org_id AND m.user_id = atlaz.current_user_id()
      AND m.is_active AND m.scope = 'org'
  )
  AND EXISTS (SELECT 1 FROM public.clients c WHERE c.org_id = domains.org_id AND c.id = domains.client_id)
);
REVOKE ALL ON public.domains FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.domains TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.domains TO service_role;
-- Sem DELETE (nunca há exclusão — status "inactive" preserva histórico, mesmo padrão de
-- support_tickets/projects).
--> statement-breakpoint
-- Quarto ramo — substituição única, nunca policy adicional permissiva (que seria combinada
-- via OR). Client, Project e Ticket mantêm exatamente os predicados já aprovados/aplicados.
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
    OR (entity_type = 'domain' AND EXISTS (
      SELECT 1 FROM public.domains d
      WHERE d.org_id = activity_events.org_id AND d.id = activity_events.entity_id
    ))
    OR entity_type NOT IN ('client', 'project', 'ticket', 'domain')
  )
);
-- Client/Project/Ticket mantêm exatamente o predicado anterior; Domain aplica a própria RLS
-- (que por sua vez não exige project:read — ver nota acima). Outros tipos mantêm a regra
-- organizacional herdada. Órfãos não são apagados. Grants de activity_events/audit.log
-- permanecem intocados (sem escrita pública).