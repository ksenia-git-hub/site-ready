// Starts the API server and the Vite dev server together, without extra dependencies.
// If either process exits, the other one is stopped too.
import { spawn } from 'node:child_process';

const commands = ['npm run dev:server', 'npm run dev:client'];

const children = commands.map((command) =>
  spawn(command, { stdio: 'inherit', shell: true }),
);

for (const child of children) {
  child.on('exit', (code) => {
    for (const other of children) {
      if (other !== child && other.exitCode === null) other.kill();
    }
    process.exitCode = code ?? 0;
  });
}
