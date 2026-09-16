// Compares saved metadata only. No network or credentials.
import { readFile, writeFile } from 'node:fs/promises';
const p = JSON.parse(await readFile('docs/projetos-preflight.json', 'utf8'));
const s = JSON.parse(await readFile('src/server/db/migrations/meta/0003_snapshot.json', 'utf8'));
const differences = [];
for (const [qualified, table] of Object.entries(s.tables)) {
  const [schema, name] = qualified.split('.');
  const remote = p.columns.filter(c => c.table_schema === schema && c.table_name === name);
  const expected = Object.values(table.columns);
  if (remote.length !== expected.length) differences.push(`${qualified}: column count`);
  for (const col of expected) {
    const found = remote.find(c => c.column_name === col.name);
    if (!found || found.is_nullable !== (col.notNull ? 'NO' : 'YES') || found.data_type !== col.type ||
      (found.column_default !== null) !== (col.default !== undefined)) differences.push(`${qualified}.${col.name}: type/null/default presence`);
  }
  for (const group of ['foreignKeys', 'checkConstraints', 'uniqueConstraints']) for (const key of Object.keys(table[group] ?? {})) {
    if (!p.constraints.some(c => c.schema === schema && c.table_name === name && c.name === key)) differences.push(`${qualified}: missing constraint ${key}`);
  }
  for (const key of Object.keys(table.indexes ?? {})) if (!p.indexes.some(c => c.schemaname === schema && c.tablename === name && c.indexname === key)) differences.push(`${qualified}: missing index ${key}`);
  if (!p.tables.some(c => c.schema === schema && c.name === name && c.rls === table.isRLSEnabled)) differences.push(`${qualified}: RLS`);
}
p.snapshotComparison = { snapshot: '0003', tablesChecked: Object.keys(s.tables).length, differences,
  scope: 'column names/types/nullability/default presence; FK/check/unique/index names; RLS. Definitions recorded for manual review.' };
await writeFile('docs/projetos-preflight.json', JSON.stringify(p, null, 2) + '\n');
process.stdout.write(JSON.stringify(p.snapshotComparison, null, 2) + '\n');
if (differences.length) process.exitCode = 1;
