import { readFileSync, writeFileSync } from 'fs';

const typecheckOutput = readFileSync('d:/trae_projects/fivedesigner/typecheck_strict.txt', 'utf8');

const unusedVarRegex = /(.+?)\((\d+),(\d+)\): error TS6133: '(.+?)' is declared but/;
const unusedParamRegex = /(.+?)\((\d+),(\d+)\): error TS6196: '(.+?)' is declared but/;

const fixes = new Map();

function addFix(file, line, col, name, type) {
  const key = `${file}:${line}:${col}`;
  if (!fixes.has(key)) {
    fixes.set(key, { file, line: parseInt(line), col: parseInt(col), name, type });
  }
}

for (const line of typecheckOutput.split('\n')) {
  let m = line.match(unusedVarRegex);
  if (m) {
    const [, file, lineNo, col, name] = m;
    addFix(file.trim(), lineNo, col, name, 'var');
  }
  m = line.match(unusedParamRegex);
  if (m) {
    const [, file, lineNo, col, name] = m;
    addFix(file.trim(), lineNo, col, name, 'param');
  }
}

console.log(`Found ${fixes.size} unused variable/parameter fixes`);

const fileEdits = new Map();
for (const fix of fixes.values()) {
  if (!fileEdits.has(fix.file)) {
    fileEdits.set(fix.file, []);
  }
  fileEdits.get(fix.file).push(fix);
}

for (const [file, edits] of fileEdits) {
  try {
    let content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    const sortedEdits = edits.sort((a, b) => b.line - a.line);

    for (const edit of sortedEdits) {
      const lineIdx = edit.line - 1;
      if (lineIdx >= lines.length) continue;
      const line = lines[lineIdx];

      const name = edit.name;
      if (name.startsWith('_')) continue;

      let newLine = line;

      const varPatterns = [
        { regex: new RegExp(`\\b(const|let|var)\\s+${escapeRegex(name)}\\b`), replacement: `$1 _${name}` },
        { regex: new RegExp(`\\b(const|let|var)\\s+\\{\\s*${escapeRegex(name)}\\s*\\}`), replacement: null },
        { regex: new RegExp(`,\\s*${escapeRegex(name)}\\s*=`), replacement: `, _${name} =` },
        { regex: new RegExp(`\\b${escapeRegex(name)}\\s*:\\s*`), replacement: `_${name}: ` },
      ];

      if (edit.type === 'param') {
        const paramRegex = new RegExp(`(?<![\\w_])${escapeRegex(name)}(?=\\s*[,\\)\\:])`, 'g');
        const match = paramRegex.exec(newLine);
        if (match) {
          const before = newLine.substring(0, match.index);
          const after = newLine.substring(match.index + name.length);
          if (!before.endsWith('_')) {
            newLine = before + '_' + name + after;
          }
        }
      } else {
        const constLetVarRegex = new RegExp(`(const|let|var)\\s+${escapeRegex(name)}\\b`);
        if (constLetVarRegex.test(newLine)) {
          newLine = newLine.replace(constLetVarRegex, `$1 _${name}`);
        } else {
          const destructuredRegex = new RegExp(`([{},\\s])${escapeRegex(name)}([:,}\\s])`);
          if (destructuredRegex.test(newLine)) {
            newLine = newLine.replace(destructuredRegex, `$1_${name}$2`);
          }
        }
      }

      if (newLine !== line) {
        lines[lineIdx] = newLine;
      }
    }

    writeFileSync(file, lines.join('\n'), 'utf8');
    console.log(`Fixed ${edits.length} unused vars/params in ${file}`);
  } catch (e) {
    console.error(`Error processing ${file}:`, e.message);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

console.log('Done!');
