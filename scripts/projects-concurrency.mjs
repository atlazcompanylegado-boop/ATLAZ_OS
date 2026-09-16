// Disposable local PostgreSQL only. Never reads .env.local or DATABASE_URL.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
const bin = process.env.PROJECT_TEST_PG_BIN ?? 'C:/Program Files/PostgreSQL/17/bin';
const root = mkdtempSync(path.join(tmpdir(), 'atlaz-projects-'));
const data = path.join(root, 'data');
let started = false;
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
try {
  execFileSync(path.join(bin, 'initdb.exe'), ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C'], { windowsHide: true, stdio: 'pipe' });
  execFileSync(path.join(bin, 'pg_ctl.exe'), ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { windowsHide: true, stdio: 'pipe' });
  started = true;
  const env = { ...process.env, PROJECT_TEST_DATABASE_URL: `postgres://postgres@127.0.0.1:${port}/postgres`, PROJECT_TEST_DATA_DIR: data };
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/integration/project-concurrency.test.ts', '--maxWorkers=1', '--pool=threads'], { windowsHide: true, stdio: 'inherit', env });
  process.exitCode = result.status ?? 1;
} finally {
  if (started) execFileSync(path.join(bin, 'pg_ctl.exe'), ['-D', data, '-m', 'fast', '-w', 'stop'], { windowsHide: true, stdio: 'pipe' });
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('atlaz-projects-')) throw new Error('Unexpected cleanup path');
  rmSync(resolved, { recursive: true, force: true });
  process.stdout.write('Temporary local PostgreSQL stopped and removed.\n');
}
