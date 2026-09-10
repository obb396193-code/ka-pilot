import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import ts from "typescript";

type Bindings = Record<string, string>;
export interface PathInventory { paths: string[]; unresolved: string[] }
const parse = (source: string) => ts.createSourceFile("inventory.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function walk(node: ts.Node, visit: (child: ts.Node) => void): void { visit(node); ts.forEachChild(node, child => walk(child, visit)); }
function unwrap(node: ts.Expression): ts.Expression { return ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node; }

// Finite guards preserve correlated route kinds (work-items/ignore vs changesets/dry-run).
// Do not take the cross-product of unrelated discriminators and invent four routes.
function guards(raw: ts.Expression): Bindings[] {
  const node = unwrap(raw);
  if (!ts.isBinaryExpression(node)) return [{}];
  if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) return [...guards(node.left), ...guards(node.right)];
  if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return guards(node.left).flatMap(left => guards(node.right)
    .filter(right => Object.keys(right).every(key => left[key] === undefined || left[key] === right[key]))
    .map(right => ({ ...left, ...right })));
  if (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken && ts.isStringLiteral(node.right)) return [{ [node.left.getText()]: node.right.text }];
  return [{}];
}
function enclosingGuards(node: ts.Node): Bindings[] {
  let branches: Bindings[] = [{}];
  for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isIfStatement(parent) && parent.thenStatement === child) branches = branches.flatMap(branch => guards(parent.expression).map(next => ({ ...branch, ...next })));
  }
  return branches;
}
function literalTypes(node: ts.TypeNode | undefined, aliases: Map<string, ts.TypeNode>): string[] | undefined {
  if (!node) return undefined;
  if (ts.isTypeReferenceNode(node)) return literalTypes(aliases.get(node.typeName.getText()), new Map([...aliases].filter(([key]) => key !== node.typeName.getText())));
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return [node.literal.text];
  if (ts.isUnionTypeNode(node)) {
    const types = node.types.map(type => literalTypes(type, aliases));
    return types.every(type => type !== undefined) ? types.flat() as string[] : undefined;
  }
  return undefined;
}
function parameterValues(node: ts.Identifier, aliases: Map<string, ts.TypeNode>): string[] | undefined {
  for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) || ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) {
      const param = parent.parameters.find(parameter => parameter.name.getText() === node.text);
      if (param) return literalTypes(param.type, aliases);
    }
  }
  return undefined;
}
function render(raw: ts.Expression, bindings: Bindings, aliases: Map<string, ts.TypeNode>): string[] {
  const node = unwrap(raw), bound = bindings[node.getText()];
  if (bound !== undefined) return [bound];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isConditionalExpression(node)) return [...render(node.whenTrue, bindings, aliases), ...render(node.whenFalse, bindings, aliases)];
  if (ts.isTemplateExpression(node)) {
    let values = [node.head.text];
    for (const span of node.templateSpans) {
      values = values.flatMap(prefix => render(span.expression, bindings, aliases).map(value => prefix + value + span.literal.text));
      if (values.length > 100) throw new Error("Route template expansion overflow");
    }
    return values;
  }
  if (ts.isIdentifier(node)) return parameterValues(node, aliases) ?? [":p"];
  return [":p"];
}
function regexPaths(text: string): string[] | undefined {
  if (!text.startsWith("/^\\/api\\/v1")) return undefined;
  if (!text.endsWith("$/")) throw new Error(`Unresolved route regex: ${text}`);
  const source = text.slice(2, -2);
  let values = [""], end = 0;
  for (const match of source.matchAll(/\(([^()]*)\)/g)) {
    const prefix = source.slice(end, match.index), inner = match[1]!.replace(/^\?:/, "");
    // Only plain finite literal alternatives are expanded; arbitrary regex
    // capture content still represents a parameter, never executable regex.
    const choices = /^[A-Za-z0-9_-]+(?:\|[A-Za-z0-9_-]+)*$/.test(inner) ? inner.split("|") : [":p"];
    if (values.length * choices.length > 100) throw new Error("Route regex expansion overflow");
    values = values.flatMap(value => choices.map(choice => value + prefix + choice));
    end = match.index + match[0].length;
  }
  const paths = values.map(value => (value + source.slice(end)).replace(/\\\//g, "/"));
  if (paths.some(value => !/^\/api\/v1\/(?:[A-Za-z0-9_.:-]+\/?)+$/.test(value))) throw new Error(`Unresolved route regex: ${text}`);
  return paths;
}

/** Syntax-only inventory: never execute browser modules, read secrets or call services. */
export function sourcePaths(source: string): PathInventory {
  const root = parse(source), paths = new Set<string>(), unresolved: string[] = [], aliases = new Map<string, ts.TypeNode>();
  walk(root, node => { if (ts.isTypeAliasDeclaration(node)) aliases.set(node.name.text, node.type); });
  const add = (value: string) => {
    const index = value.indexOf("/api/v1/"); if (index < 0) return;
    const path = value.slice(index).split("?")[0]!;
    if (!/^\/api\/v1\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.:-]+)*$/.test(path)) unresolved.push(value);
    else paths.add(path);
  };
  walk(root, node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node.text);
    else if (ts.isTemplateExpression(node) && node.getText().includes("/api/v1/")) {
      for (const bindings of enclosingGuards(node)) for (const value of render(node, bindings, aliases)) add(value);
    } else if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      try { for (const path of regexPaths(node.getText()) ?? []) paths.add(path); }
      catch (error) { unresolved.push((error as Error).message); }
    }
  });
  return { paths: [...paths].sort(), unresolved: [...new Set(unresolved)].sort() };
}
export function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(resolve(directory, entry.name)) :
    entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [resolve(directory, entry.name)] : []);
}
export function inventory(files: string[]): PathInventory {
  const paths = new Set<string>(), unresolved: string[] = [];
  for (const file of files) {
    const found = sourcePaths(readFileSync(file, "utf8")); found.paths.forEach(path => paths.add(path));
    unresolved.push(...found.unresolved.map(issue => `${file}: ${issue}`));
  }
  return { paths: [...paths].sort(), unresolved };
}
/** Only explicitly imported HTTP_PATH constants, not arbitrary service URLs in dependencies. */
export function importedHttpPaths(shellFile: string): string[] {
  const source = parse(readFileSync(shellFile, "utf8")), paths: string[] = [];
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const names = bindings.elements.filter(element => element.name.text.endsWith("_HTTP_PATH")).map(element => element.propertyName?.text ?? element.name.text);
    if (!names.length) continue;
    const file = resolve(dirname(shellFile), node.moduleSpecifier.text.replace(/\.js$/, ".ts"));
    const imported = parse(readFileSync(file, "utf8"));
    const seen = new Set<string>();
    walk(imported, declaration => {
      if (!ts.isVariableDeclaration(declaration) || !names.includes(declaration.name.getText()) || !declaration.initializer) return;
      const values = sourcePaths(declaration.initializer.getText());
      if (values.unresolved.length || values.paths.length !== 1) throw new Error(`Unresolved HTTP path in ${relative(dirname(shellFile), file)}`);
      paths.push(...values.paths); seen.add(declaration.name.getText());
    });
    if (names.some(name => !seen.has(name))) throw new Error(`Missing imported HTTP path: ${file}`);
  }
  return [...new Set(paths)].sort();
}
