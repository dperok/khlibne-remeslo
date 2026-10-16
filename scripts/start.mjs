import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--env-file-if-exists=.env.local', 'backend/dist/main.js'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, ['--env-file-if-exists=.env', '--env-file-if-exists=.env.local', 'frontend/node_modules/next/dist/bin/next', 'start', 'frontend'], { cwd: root, stdio: 'inherit' }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
