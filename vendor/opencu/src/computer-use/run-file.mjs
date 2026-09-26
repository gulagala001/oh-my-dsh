import { execFile } from 'node:child_process';

// Some console-hiding plugins wrap execFile without preserving promisify.custom.
// Use the public callback contract so stdout/stderr never become undefined.
export function runFile(file, args = [], options = {}) {
  let child;
  const pending = new Promise((resolve, reject) => {
    child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) { Object.assign(error, { stdout, stderr }); reject(error); }
      else resolve({ stdout, stderr });
    });
  });
  pending.child = child;
  return pending;
}
