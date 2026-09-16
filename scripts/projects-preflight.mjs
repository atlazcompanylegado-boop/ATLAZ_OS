// Explicit read-only preflight. Does not import the migrator or export business rows.
import postgres from 'postgres';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 });
try {
  const result = await sql.begin('isolation level repeatable read read only', async tx => {
    await tx`set local statement_timeout = '20s'`;
    const journal = JSON.parse(await readFile('src/server/db/migrations/meta/_journal.json', 'utf8'));
    const local = await Promise.all(journal.entries.filter(e => e.idx < 4).map(async e => ({
      tag: e.tag, created_at: String(e.when),
      hash: createHash('sha256').update(await readFile(`src/server/db/migrations/${e.tag}.sql`)).digest('hex'),
    })));
    const ledger = await tx`select hash, created_at::text from drizzle.__drizzle_migrations order by created_at`;
    const tables = await tx`select n.nspname as schema, c.relname as name, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','audit') and c.relkind='r' order by 1,2`;
    const columns = await tx`select table_schema, table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns where table_schema in ('public','audit') order by 1,2,ordinal_position`;
    const constraints = await tx`select n.nspname as schema, c.relname as table_name, k.conname as name, pg_get_constraintdef(k.oid) as definition
      from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','audit') order by 1,2,3`;
    const indexes = await tx`select schemaname, tablename, indexname, indexdef from pg_indexes where schemaname in ('public','audit') order by 1,2,3`;
    const policies = await tx`select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies where schemaname in ('public','audit') order by 1,2,3`;
    const grants = await tx`select table_schema, table_name, grantee, privilege_type from information_schema.table_privileges
      where table_schema in ('public','audit') and grantee in ('anon','authenticated','service_role','PUBLIC') order by 1,2,3,4`;
    const triggers = await tx`select n.nspname as schema, c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid) as definition
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal and n.nspname in ('public','audit') order by 1,2,3`;
    const permissionCatalog = await tx`select key from public.permissions order by key`;
    const projectGrants = await tx`select o.slug as organization, r.key as role, rp.permission_key
      from public.roles r join public.orgs o on o.id=r.org_id
      left join public.role_permissions rp on rp.role_id=r.id and rp.permission_key like 'project:%'
      order by 1,2,3`;
    const events = await tx`select entity_type, count(*)::integer as count from public.activity_events group by entity_type order by entity_type`;
    const projectExists = tables.some(t => t.schema === 'public' && t.name === 'projects');
    const projectCount = events.find(e => e.entity_type === 'project')?.count ?? 0;
    const orphanCount = projectExists ? null : projectCount;
    return { checkedAt: new Date().toISOString(), readOnly: true, local, ledger,
      ledgerMatches: JSON.stringify(local.map(({hash,created_at})=>({hash,created_at}))) === JSON.stringify(ledger),
      projectExists, projectCount, orphanCount, tables, columns, constraints, indexes, policies, grants, triggers, permissionCatalog, projectGrants, events };
  });
  await writeFile('docs/projetos-preflight.json', JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ readOnly: result.readOnly, ledgerMatches: result.ledgerMatches, projectExists: result.projectExists,
    projectCount: result.projectCount, orphanCount: result.orphanCount, projectGrants: result.projectGrants, report: 'docs/projetos-preflight.json' }, null, 2) + '\n');
} catch (error) {
  console.error('Preflight falhou:', error.code ?? error.name); process.exitCode = 1;
} finally { await sql.end({ timeout: 5 }); }
