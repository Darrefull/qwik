import { assert, test, beforeAll, expect } from 'vitest';
import {
  assertHostUnused,
  getPageHtml,
  promisifiedTreeKill,
  runCommandUntil,
  scaffoldQwikProject,
} from '../utils';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SERVE_PORT = 3535;
beforeAll(() => {
  const config = scaffoldQwikProject();
  global.tmpDir = config.tmpDir;
  global.pIds = [];

  return async () => {
    for (const pId of global.pIds) {
      await promisifiedTreeKill(pId, 'SIGKILL');
    }
    config.cleanupFn();
  };
});

test('dummy test', { timeout: 20000 }, async () => {
  const host = `http://localhost:${SERVE_PORT}/`;
  await assertHostUnused(host);
  const p = await runCommandUntil(
    `npm run dev -- --port ${SERVE_PORT}`,
    global.tmpDir,
    (output) => {
      return output.includes(host);
    }
  );
  assert.equal(existsSync(global.tmpDir), true);
  global.pIds.push(p.pid);

  await expectHtmlOnARootPage(host);

  await promisifiedTreeKill(p.pid!, 'SIGKILL');
});

async function expectHtmlOnARootPage(host: string) {
  expect((await getPageHtml(host)).querySelector('.container h1')?.textContent).toBe(
    `So fantasticto have you here`
  );
  const heroComponentPath = join(global.tmpDir, `src/components/starter/hero/hero.tsx`);
  const heroComponentTextContent = readFileSync(heroComponentPath, 'utf-8');
  writeFileSync(
    heroComponentPath,
    heroComponentTextContent.replace(
      `to have <span class="highlight">you</span> here`,
      `to have <span class="highlight">e2e tests</span> here`
    )
  );
  await new Promise((r) => setTimeout(r, 2000));
  expect((await getPageHtml(host)).querySelector('.container h1')?.textContent).toBe(
    `So fantasticto have e2e tests here`
  );
}
