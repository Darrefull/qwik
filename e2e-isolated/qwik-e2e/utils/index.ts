import { ChildProcess, exec, execSync } from 'child_process';
import { dirSync } from 'tmp';
import { existsSync, mkdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'fs';
import { promisify } from 'util';
import { resolve, join, dirname } from 'path';
import jsdom from 'jsdom';
import treeKill from 'tree-kill';

export function scaffoldQwikProject(): { tmpDir: string; cleanupFn: () => void } {
  const tmpHostDirData = getTmpDirSync(process.env.TEMP_E2E_PATH);
  const cleanupFn = () => !tmpHostDirData.overridden && cleanup(tmpHostDirData.path);
  try {
    const tmpDir = runCreateQwikCommand(tmpHostDirData.path);
    console.log(`Created temporary application at "${tmpDir}"`);
    replacePackagesWithLocalOnes(tmpDir);
    return { cleanupFn, tmpDir };
  } catch (error) {
    cleanupFn();
    throw error;
  }
}

function cleanup(tmpDir: string) {
  console.log(`Removing tmp dir "${tmpDir}"`);
  rmSync(tmpDir, { recursive: true });
}

function getTmpDirSync(tmpDirOverride?: string) {
  if (tmpDirOverride) {
    tmpDirOverride = resolve(workspaceRoot, tmpDirOverride);
  }

  if (tmpDirOverride && !existsSync(tmpDirOverride)) {
    throw new Error(`"${tmpDirOverride}" does not exist.`);
  }
  if (tmpDirOverride) {
    const p = join(tmpDirOverride, 'qwik_e2e');
    if (existsSync(p)) {
      console.log(`Removing project folder "${p}" (will be recreated).`);
      rmSync(p, { recursive: true });
    }
    mkdirSync(p);
    return { path: p, overridden: true };
  }
  return { path: dirSync({ prefix: 'qwik_e2e' }).name, overridden: false };
}

function runCreateQwikCommand(tmpDir: string): string {
  const appDir = 'e2e-app';
  execSync(
    `node "${workspaceRoot}/packages/create-qwik/create-qwik.cjs" playground "${join(tmpDir, appDir)}"`
  );
  execSync(`npm i`, { cwd: join(tmpDir, appDir) });
  return join(tmpDir, appDir);
}

function replacePackagesWithLocalOnes(tmpDir: string) {
  const tarballConfig = JSON.parse(
    readFileSync(join(workspaceRoot, 'temp/tarballs/paths.json'), 'utf-8')
  );
  for (const { name, absolutePath } of tarballConfig) {
    patchPackageJsonForPlugin(tmpDir, name, absolutePath);
  }
  execSync('npm i', { cwd: tmpDir, stdio: [0, 1, 2] });
}

function patchPackageJsonForPlugin(tmpDirName: string, npmPackageName: string, distPath: string) {
  const path = join(tmpDirName, 'package.json');
  const json = JSON.parse(readFileSync(path, 'utf-8'));
  json.devDependencies[npmPackageName] = `file:${distPath}`;
  writeFileSync(path, JSON.stringify(json));
}

export function runCommandUntil(
  command: string,
  tmpDir: string,
  criteria: (output: string) => boolean
): Promise<ChildProcess> {
  const p = exec(command, {
    cwd: tmpDir,
    encoding: 'utf-8',
  });
  return new Promise((res, rej) => {
    let output = '';
    let complete = false;

    function checkCriteria(c: any) {
      output += c.toString();
      if (criteria(stripConsoleColors(output)) && !complete) {
        complete = true;
        res(p);
      }
    }

    p.stdout?.on('data', checkCriteria);
    p.stderr?.on('data', checkCriteria);
    p.on('exit', (code) => {
      if (!complete) {
        rej(`Exited with ${code}`);
      } else {
        res(p);
      }
    });
  });
}
function stripConsoleColors(log: string): string {
  return log.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ''
  );
}

export async function getPageHtml(pageUrl: string): Promise<Document> {
  const res = await fetch(pageUrl, { headers: { accept: 'text/html' } }).then((r) => r.text());
  return new jsdom.JSDOM(res).window.document;
}

export async function assertHostUnused(host: string): Promise<void> {
  try {
    const response = await fetch(host, { headers: { accept: 'text/html' } });
  } catch (error) {
    // TODO: test this in different environments
    if (error.cause.code === 'ECONNREFUSED') {
      return;
    }
  }
  throw new Error(`Host ${host} is already in use!`);
}

// promisify fails to get the proper type overload, so manually enforcing the type
const _promisifiedTreeKill = promisify(treeKill) as (pid: number, signal: string) => Promise<void>;

export const promisifiedTreeKill = (pid: number, signal: string) => {
  try {
    return _promisifiedTreeKill(pid, signal);
  } catch (error) {
    console.error('Failed to kill the process ' + pid, error);
  }
};

export const workspaceRoot = _computeWorkspaceRoot(process.cwd());

function _computeWorkspaceRoot(cwd: string) {
  if (dirname(cwd) === cwd) return process.cwd();

  const packageJsonAtCwd = join(cwd, 'package.json');
  if (existsSync(packageJsonAtCwd)) {
    const content = JSON.parse(readFileSync(packageJsonAtCwd, 'utf-8'));
    if (content.name === 'qwik-monorepo') {
      return cwd;
    }
  }
  return _computeWorkspaceRoot(dirname(cwd));
}
