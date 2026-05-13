import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

const serverPath = path.join(process.cwd(), 'index.js');
const serverProcess = spawn('cmd.exe', ['/c', 'node', serverPath], {
  cwd: process.cwd(),
  detached: true,
  stdio: 'ignore',
  shell: true
});

serverProcess.unref();

console.log('Server started with PID:', serverProcess.pid);

setTimeout(() => {
  process.exit(0);
}, 3000);