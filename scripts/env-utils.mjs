import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const ENV_FILE = path.resolve('.env');

export function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = (s) => {
      // vypíše jen otázku, ne psané znaky
      if (s.includes(question)) rl.output.write(s);
    };
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

// Uloží proměnné do .env, existující se stejným názvem přepíše.
export function saveToEnv(values) {
  const lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/) : [];
  const rest = lines.filter((l) => l && !Object.keys(values).some((k) => l.startsWith(`${k}=`)));
  const added = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_FILE, [...rest, ...added, ''].join('\n'));
}
