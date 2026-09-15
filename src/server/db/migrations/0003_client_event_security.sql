-- Etapa B: escrita de eventos exclusivamente pelo servidor confiável.
-- Numerada após 0002 porque a policy de timeline valida o cliente real.
-- Não altera dados nem remove as estruturas herdadas.
-- users_update_self herdada permite atualizar qualquer coluna do próprio perfil.
-- Sem restringir o grant, um usuário inativo poderia reativar a si mesmo por REST.
REVOKE UPDATE ON public.users FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, auth_user_id, email, full_name, avatar_url, is_active, created_at, updated_at)
  ON public.users FROM PUBLIC, anon, authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.users TO authenticated;
--> statement-breakpoint
DROP POLICY IF EXISTS audit_insert ON audit.log;
DROP POLICY IF EXISTS activity_insert ON public.activity_events;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON audit.log FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.activity_events FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
-- Mantém audit_select (audit:read) intacta; nenhuma auditoria bruta vai à timeline.
-- Eventos de contatos usam entity_type='client' e o ID do cliente pai.
DROP POLICY IF EXISTS activity_select ON public.activity_events;
CREATE POLICY activity_select ON public.activity_events
  FOR SELECT TO authenticated
  USING (
    org_id = atlaz.current_org_id()
    AND atlaz.is_member()
    AND (
      entity_type <> 'client'
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.org_id = activity_events.org_id AND c.id = activity_events.entity_id
      )
    )
  );
-- O SELECT em clients aplica a própria RLS: client:read, scope='org',
-- usuário/membership ativos e papel pertencente à mesma organização.
