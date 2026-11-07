// Read-only inventory. Candidates require runtime/config review before removal.
// Run from the repository root: node scripts/audit-dependencies.mjs [output.json]
import fs from 'node:fs';
import path from 'node:path';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const root = process.cwd();
const skip = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.vite']);
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (skip.has(entry.name) || entry.name.startsWith('_backup_')) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const files = walk(root);
const sources = files.filter(file => /\.[cm]?[jt]sx?$/.test(file));
const texts = new Map(sources.map(file => [file, fs.readFileSync(file, 'utf8')]));
const referenceTexts = new Map(files.filter(file => /\.(?:[cm]?[jt]sx?|html|css|json)$/.test(file)
  && !file.endsWith('package-lock.json') && !relative(file).startsWith('docs/'))
  .map(file => [file, fs.readFileSync(file, 'utf8')]));
const modules = sources.filter(file => /^(frontend\/src|backend\/src|shared|src)\//.test(relative(file)));
const edges = [];
const dynamic = [];
const exports = [];
for (const file of modules) {
  const ast = ts.createSourceFile(file, texts.get(file), ts.ScriptTarget.Latest, true);
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      specifier = node.arguments[0];
      dynamic.push({ file: relative(file), expression: node.getText(ast) });
    }
    if (specifier && ts.isStringLiteral(specifier)) {
      const name = specifier.text;
      if (name.startsWith('.') || name.startsWith('@shared/')) {
        const base = name.startsWith('@shared/')
          ? path.join(root, 'shared', name.slice(8)) : path.resolve(path.dirname(file), name);
        const stem = base.replace(/\.js$/, '');
        const resolved = [base, `${stem}.ts`, `${stem}.tsx`, path.join(base, 'index.ts')]
          .find(candidate => texts.has(candidate));
        edges.push({ from: relative(file), to: resolved ? relative(resolved) : name, resolved: !!resolved });
      } else edges.push({ from: relative(file), package: name });
    }
    if (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      const names = ts.isVariableStatement(node)
        ? node.declarationList.declarations.map(declaration => declaration.name.getText(ast))
        : node.name ? [node.name.getText(ast)] : [];
      for (const name of names) {
        const references = [...referenceTexts].filter(([other, content]) => other !== file
          && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(content))
          .map(([other]) => relative(other));
        if (references.length === 0) exports.push({ file: relative(file), name });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const reachable = new Set();
function follow(file) {
  if (reachable.has(file)) return;
  reachable.add(file);
  for (const edge of edges) if (edge.from === file && edge.resolved) follow(edge.to);
}
follow('frontend/src/main.ts');
follow('backend/src/index.ts');
const result = JSON.stringify({
  note: 'Static import graph + conservative text references; not an automatic deletion list.',
  moduleCount: modules.length,
  reachableFromCurrentEntrypoints: [...reachable].sort(),
  outsideCurrentRuntime: modules.map(relative).filter(file => !reachable.has(file)),
  exportCandidatesWithoutExternalTextReferences: exports,
  dynamicImports: dynamic,
  edges,
}, null, 2) + '\n';
if (process.argv[2]) fs.writeFileSync(process.argv[2], result, 'utf8');
else process.stdout.write(result);
