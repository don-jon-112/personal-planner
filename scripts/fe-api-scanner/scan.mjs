#!/usr/bin/env node
/**
 * FE API scanner.
 *
 * Statically scans a (Next.js monorepo) frontend repository with the TypeScript
 * compiler API and lists every call that hits a backend endpoint, together with the
 * FE pages (routes) that end up using it.
 *
 * Usage: node scripts/fe-api-scanner/scan.mjs --repo <path> [--out <file>] [--meta <json>]
 *
 * How page mapping works: every top-level symbol (function / const / class) of every
 * source file is a node. An edge exists when one symbol references an imported or local
 * symbol. Each page file (src/pages/**, src/app/**\/page.*) is a root; the endpoints
 * reachable from a root are the endpoints that page uses.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

// ---------------------------------------------------------------- CLI
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const REPO = path.resolve(getArg("repo", ""));
const OUT = path.resolve(getArg("out", "src/data/fe-api-map.json"));
const META = getArg("meta", null) ? JSON.parse(getArg("meta")) : {};
const EXCLUDE_APPS = new Set((getArg("exclude-apps", "") || "").split(",").map((x) => x.trim()).filter(Boolean));
const EXPLAIN = getArg("explain", null); // debugging: print how pages reach the endpoint whose key contains this text
let explainShown = 0;
const INCLUDE_DEAD = args.includes("--include-dead"); // keep endpoints no page/route/middleware reaches (debugging)
const ANNOTATIONS_FILE = getArg("annotations", null);
if (!getArg("repo")) {
  console.error("Missing --repo <path>");
  process.exit(1);
}

// ---------------------------------------------------------------- config
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", "public", "__tests__", "__mocks__"]);
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head"]);
// Members of the http clients that send a request: HTTP method, index of the url argument, optional index of a baseURL argument
const CLIENT_MEMBERS = {
  get: { method: "GET", url: 0 },
  post: { method: "POST", url: 0 },
  put: { method: "PUT", url: 0 },
  patch: { method: "PATCH", url: 0 },
  delete: { method: "DELETE", url: 0 },
  head: { method: "HEAD", url: 0 },
  // custom members of ui/services/api.ts (APIInstance), read from the source
  postData: { method: "POST", url: 1, base: 0 }, // postData(base_url, url, data, config)
  postFormData: { method: "POST", url: 0 }, // postFormData(url, formData, config)
  putData: { method: "PUT", url: 0 },
  deleteData: { method: "DELETE", url: 0 }, // deleteData(url, payload)
};
const WRAPPER_FN = /^makeApi\w*(WithEndpoint|Request)$/;
const API_RECEIVER = /^(api|axios|\w*api\w*)$/i;
const NOT_API_RECEIVER = /^(redis\w*|map|cache\w*|params|searchparams|headers|cookies?|storage|\w*store)$/i;

const norm = (p) => p.split(path.sep).join("/");
const rel = (p) => norm(path.relative(REPO, p));

// ---------------------------------------------------------------- file discovery
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (EXTS.includes(path.extname(entry.name)) && !/\.(d|test|spec|stories)\.\w+$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
}

const roots = [];
const appsDir = path.join(REPO, "apps");
if (fs.existsSync(appsDir)) {
  for (const app of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (app.isDirectory() && !EXCLUDE_APPS.has(app.name) && fs.existsSync(path.join(appsDir, app.name, "src"))) {
      roots.push({ dir: path.join(appsDir, app.name, "src"), app: app.name });
    }
  }
}
const sharedDir = path.join(REPO, "packages", "shared", "ui");
if (fs.existsSync(sharedDir)) roots.push({ dir: sharedDir, app: "shared-ui" });
if (roots.length === 0) roots.push({ dir: REPO, app: path.basename(REPO) });

const annotations = ANNOTATIONS_FILE && fs.existsSync(ANNOTATIONS_FILE) ? JSON.parse(fs.readFileSync(ANNOTATIONS_FILE, "utf8")) : { notApi: [] };

const files = []; // { abs, app, appSrc }
for (const r of roots) {
  const list = [];
  walk(r.dir, list);
  for (const abs of list) files.push({ abs, app: r.app, appSrc: r.app === "shared-ui" ? null : r.dir });
}

const fileByAbs = new Map(files.map((f) => [f.abs, f]));

function resolveModule(spec, fromFile) {
  let base = null;
  if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile.abs), spec);
  else if (spec.startsWith("@/") && fromFile.appSrc) base = path.join(fromFile.appSrc, spec.slice(2));
  else if (spec.startsWith("@/")) base = null;
  else if (spec.startsWith("ui/")) base = path.join(sharedDir, spec.slice(3));
  if (!base) return null;
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, "index" + e))];
  for (const c of candidates) if (fileByAbs.has(c)) return c;
  return null;
}

// ---------------------------------------------------------------- per-file analysis
const infos = new Map(); // abs -> info

function textOf(sf, node) {
  return node.getText(sf).replace(/\s+/g, " ");
}

function analyse(file) {
  const src = fs.readFileSync(file.abs, "utf8");
  const sf = ts.createSourceFile(file.abs, src, ts.ScriptTarget.Latest, true);
  const info = {
    file,
    sf,
    imports: new Map(), // local -> { module(abs|null), imported }
    exports: new Map(), // exported name -> { local } | { from(abs|null), orig }
    stars: [], // abs modules re-exported by `export *`
    symbols: new Map(), // top-level symbol -> { node, refs:Set, nsRefs:[{ns,prop}], dynamicImports:[abs], calls:[] }
    consts: new Map(), // name -> string-ish initializer node (file-wide)
    constCounts: new Map(),
  };

  const ensureSymbol = (name) => {
    if (!info.symbols.has(name)) info.symbols.set(name, { nodes: [], refs: new Set(), nsRefs: [], memberRefs: [], dynamicImports: [], calls: [], suspects: [], members: null, isClass: false, newVars: new Map() });
    return info.symbols.get(name);
  };
  const addSymbol = (name, node) => ensureSymbol(name).nodes.push(node);
  // class: constructor + property initializers stay on the class symbol; every method is its own symbol, so
  // `new Cls().method()` / `this.method()` link to that method only (not to the whole class).
  const registerClass = (name, cls) => {
    const sym = ensureSymbol(name);
    sym.isClass = true;
    sym.members = new Map();
    for (const h of cls.heritageClauses || []) sym.nodes.push(h);
    for (const m of cls.members) {
      const key = m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) ? m.name.text : null;
      const fnInit = ts.isPropertyDeclaration(m) && m.initializer && (ts.isArrowFunction(unwrap(m.initializer)) || ts.isFunctionExpression(unwrap(m.initializer)));
      if (key && (ts.isMethodDeclaration(m) || ts.isGetAccessor(m) || ts.isSetAccessor(m) || fnInit)) {
        const virtual = `${name}.${key}`;
        addSymbol(virtual, m);
        sym.members.set(key, { sym: virtual });
      } else {
        sym.nodes.push(m); // constructor, field initializers
      }
    }
  };
  // `const svc = { a, b: fn, c() {} }` / `export default { ... }`: keep the members apart so that
  // `svc.a(...)` only links to `a` instead of to everything in the object.
  const registerObject = (name, obj) => {
    const sym = ensureSymbol(name);
    sym.members = new Map();
    for (const prop of obj.properties) {
      if (ts.isShorthandPropertyAssignment(prop)) {
        sym.members.set(prop.name.text, { ref: prop.name.text });
        continue;
      }
      const key = (ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : null;
      if (!key) {
        sym.nodes.push(prop); // spread / computed key: treat as part of the object itself
        continue;
      }
      const val = ts.isPropertyAssignment(prop) ? unwrap(prop.initializer) : null;
      if (val && ts.isIdentifier(val)) {
        sym.members.set(key, { ref: val.text });
        continue;
      }
      const virtual = `${name}.${key}`;
      addSymbol(virtual, prop);
      sym.members.set(key, { sym: virtual });
    }
  };
  const hasMod = (node, kind) => Boolean(node.modifiers?.some((m) => m.kind === kind));

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const mod = resolveModule(st.moduleSpecifier.text, file);
      const clause = st.importClause;
      if (!clause) continue;
      if (clause.name) info.imports.set(clause.name.text, { module: mod, imported: "default", spec: st.moduleSpecifier.text });
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) info.imports.set(nb.name.text, { module: mod, imported: "*", spec: st.moduleSpecifier.text });
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) info.imports.set(el.name.text, { module: mod, imported: (el.propertyName || el.name).text, spec: st.moduleSpecifier.text });
    } else if (ts.isExportDeclaration(st)) {
      const mod = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? resolveModule(st.moduleSpecifier.text, file) : undefined;
      if (!st.exportClause) {
        if (mod) info.stars.push(mod);
      } else if (ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          const exported = el.name.text;
          const orig = (el.propertyName || el.name).text;
          if (st.moduleSpecifier) info.exports.set(exported, { from: mod, orig });
          else info.exports.set(exported, { local: orig });
        }
      }
    } else if (ts.isExportAssignment(st)) {
      const ex = unwrap(st.expression);
      if (ts.isIdentifier(ex)) {
        info.exports.set("default", { local: ex.text });
      } else if (ts.isObjectLiteralExpression(ex)) {
        registerObject("default", ex);
        info.exports.set("default", { local: "default" });
      } else {
        addSymbol("default", st);
        info.exports.set("default", { local: "default" });
      }
    } else if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) {
      const isDefault = hasMod(st, ts.SyntaxKind.DefaultKeyword);
      const name = st.name?.text || (isDefault ? "default" : "<anon>");
      if (ts.isClassDeclaration(st) && st.name) registerClass(name, st);
      else addSymbol(name, st);
      if (hasMod(st, ts.SyntaxKind.ExportKeyword)) info.exports.set(isDefault ? "default" : name, { local: name });
    } else if (ts.isVariableStatement(st)) {
      const exported = hasMod(st, ts.SyntaxKind.ExportKeyword);
      for (const decl of st.declarationList.declarations) {
        const names = [];
        const collect = (b) => {
          if (ts.isIdentifier(b)) names.push(b.text);
          else for (const el of b.elements) if (!ts.isOmittedExpression(el)) collect(el.name);
        };
        collect(decl.name);
        const init = decl.initializer ? unwrap(decl.initializer) : null;
        for (const n of names) {
          if (names.length === 1 && init && ts.isObjectLiteralExpression(init)) registerObject(n, init);
          else addSymbol(n, decl);
          if (exported) info.exports.set(n, { local: n });
        }
      }
    } else {
      addSymbol("<module>", st);
    }
  }

  // file-wide const strings (for resolving `const URL = '/x'`)
  const visitConsts = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) || ts.isTemplateExpression(init) || ts.isBinaryExpression(init)) {
        const n = node.name.text;
        info.constCounts.set(n, (info.constCounts.get(n) || 0) + 1);
        info.consts.set(n, init);
      }
    }
    ts.forEachChild(node, visitConsts);
  };
  visitConsts(sf);

  // references + endpoint calls per symbol. Runs in a second phase (info.scan), once EVERY file has been
  // parsed, so imports, constants and clients defined in other files can be looked up.
  info.scan = () => {
  for (const [symName, sym] of info.symbols) {
    for (const root of sym.nodes) {
      const visit = (node) => {
        if (node.kind === ts.SyntaxKind.ThisKeyword && node.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) {
          sym.memberRefs.push({ name: "this", prop: node.parent.name.text });
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
          const ini = unwrap(node.initializer);
          if (ts.isNewExpression(ini) && ts.isIdentifier(ini.expression)) sym.newVars.set(node.name.text, ini.expression.text);
        }
        if (ts.isIdentifier(node)) {
          const p = node.parent;
          const isMemberName = p && ts.isPropertyAccessExpression(p) && p.name === node;
          // identifiers that are names / types, not references to a value of that name
          const isPropKey =
            p &&
            ((p.name === node &&
              (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isEnumMember(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p) || ts.isJsxAttribute(p))) ||
              (ts.isBindingElement(p) && p.propertyName === node) ||
              (ts.isLabeledStatement(p) && p.label === node) ||
              inTypePosition(node));
          const shadowed = !isMemberName && !isPropKey && info.imports.has(node.text) && findLocalDecl(node)?.topLevel === false; // a local variable named like the import
          if (!isMemberName && !isPropKey && !shadowed) {
            const imp = info.imports.get(node.text);
            if (imp?.imported === "*" && p && ts.isPropertyAccessExpression(p) && p.expression === node) {
              sym.nsRefs.push({ ns: node.text, prop: p.name.text });
            } else if (p && ts.isPropertyAccessExpression(p) && p.expression === node) {
              sym.memberRefs.push({ name: node.text, prop: p.name.text });
            } else {
              sym.refs.add(node.text);
            }
          }
        }
        if (ts.isCallExpression(node)) {
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
            const m = resolveModule(node.arguments[0].text, file);
            if (m) sym.dynamicImports.push(m);
          } else if (ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
            const m = resolveModule(node.arguments[0].text, file);
            if (m) sym.dynamicImports.push(m);
          }
          const found = detectApiCall(node, info);
          if (found.length) for (const call of found) sym.calls.push({ ...call, symbol: symName, condition: enclosingCondition(node, info) });
          else {
            const reason = suspectReason(node, info);
            if (reason) sym.suspects.push({ ...reason, symbol: symName });
          }
        } else if (ts.isNewExpression(node)) {
          const found = detectApiCall(node, info);
          if (found.length) for (const call of found) sym.calls.push({ ...call, symbol: symName, condition: enclosingCondition(node, info) });
          else {
            const reason = suspectReason(node, info);
            if (reason) sym.suspects.push({ ...reason, symbol: symName });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(root);
    }
  }
  };
  return info;
}

const unwrap = (n) => {
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression?.(n) || ts.isNonNullExpression(n))) n = n.expression;
  return n;
};

// ---------------------------------------------------------------- endpoint detection
function propText(sf, obj, key) {
  for (const p of obj.properties) {
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === key) return { node: p.name };
    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === key) return { node: p.initializer };
  }
  return null;
}

/** Conditions of the nearest enclosing `case 'x':` / `if (x === 'y')`, e.g. "type = 'profile'". */
function enclosingCondition(node, info) {
  const sf = info.sf;
  const parts = [];
  const clip = (t) => (t.length > 90 ? t.slice(0, 87) + "..." : t);
  for (let n = node.parent; n && !ts.isFunctionLike(n) && parts.length < 3; n = n.parent) {
    // `if (x === 'y') { call }` / else branch (conditions that only test the HTTP method are reported as the method instead)
    if (n.parent && ts.isIfStatement(n.parent) && !/[.]method\b/.test(textOf(sf, n.parent.expression))) {
      if (n.parent.thenStatement === n) parts.unshift(clip(textOf(sf, n.parent.expression)));
      else if (n.parent.elseStatement === n) parts.unshift(`not (${clip(textOf(sf, n.parent.expression))})`);
    }
    if (ts.isCaseClause(n)) {
      const sw = n.parent?.parent;
      if (sw && ts.isSwitchStatement(sw)) parts.unshift(`${textOf(sf, sw.expression)} = ${textOf(sf, n.expression)}`);
      else parts.unshift(`case ${textOf(sf, n.expression)}`);
    } else if (ts.isDefaultClause(n)) {
      const sw = n.parent?.parent;
      if (sw && ts.isSwitchStatement(sw)) parts.unshift(`${textOf(sf, sw.expression)} = (default)`);
    }
  }
  return parts.length ? parts.join(" & ") : null;
}

// ---- HTTP method of a forwarded request (`method: req.method`), from the guards around the call
const METHOD_NAMES = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const normMethodText = (t) => t.replace(/[?!]/g, "").replace(/\s+/g, "");

function strLit(n) {
  n = unwrap(n);
  return n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text.toUpperCase() : null;
}

/** Methods for which `cond` is true, or null when `cond` is not a test of `mtext`. */
function methodsWhenTrue(cond, mtext, sf) {
  const c = unwrap(cond);
  if (ts.isBinaryExpression(c)) {
    const op = c.operatorToken.kind;
    if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken) {
      const l = normMethodText(textOf(sf, c.left)) === mtext ? strLit(c.right) : normMethodText(textOf(sf, c.right)) === mtext ? strLit(c.left) : null;
      return l && METHOD_NAMES.has(l) ? new Set([l]) : null;
    }
    if (op === ts.SyntaxKind.BarBarToken) {
      const a = methodsWhenTrue(c.left, mtext, sf);
      const b = methodsWhenTrue(c.right, mtext, sf);
      return a && b ? new Set([...a, ...b]) : null;
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      const a = methodsWhenTrue(c.left, mtext, sf);
      const b = methodsWhenTrue(c.right, mtext, sf);
      if (a && b) return new Set([...a].filter((x) => b.has(x)));
      return a || b;
    }
  }
  // ["GET", "POST"].includes(req.method)
  if (ts.isCallExpression(c) && ts.isPropertyAccessExpression(c.expression) && c.expression.name.text === "includes" && c.arguments[0] && normMethodText(textOf(sf, c.arguments[0])) === mtext) {
    const arr = unwrap(c.expression.expression);
    if (ts.isArrayLiteralExpression(arr)) {
      const v = arr.elements.map(strLit);
      if (v.every((x) => x && METHOD_NAMES.has(x))) return new Set(v);
    }
  }
  return null;
}

/** Methods that remain possible when `cond` is false (i.e. what a guard `if (cond) return` lets through). */
function methodsWhenFalse(cond, mtext, sf) {
  const c = unwrap(cond);
  if (ts.isPrefixUnaryExpression(c) && c.operator === ts.SyntaxKind.ExclamationToken) return methodsWhenTrue(c.operand, mtext, sf);
  if (ts.isBinaryExpression(c)) {
    const op = c.operatorToken.kind;
    if (op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken) {
      const l = normMethodText(textOf(sf, c.left)) === mtext ? strLit(c.right) : normMethodText(textOf(sf, c.right)) === mtext ? strLit(c.left) : null;
      return l && METHOD_NAMES.has(l) ? new Set([l]) : null;
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      const a = methodsWhenFalse(c.left, mtext, sf);
      const b = methodsWhenFalse(c.right, mtext, sf);
      return a && b ? new Set([...a, ...b]) : null;
    }
    if (op === ts.SyntaxKind.BarBarToken) {
      const a = methodsWhenFalse(c.left, mtext, sf);
      const b = methodsWhenFalse(c.right, mtext, sf);
      if (a && b) return new Set([...a].filter((x) => b.has(x)));
      return a || b;
    }
  }
  return null;
}

function exitsEarly(st) {
  if (!st) return false;
  if (ts.isReturnStatement(st) || ts.isThrowStatement(st)) return true;
  if (ts.isBlock(st)) return st.statements.some((x) => ts.isReturnStatement(x) || ts.isThrowStatement(x));
  return false;
}

/** Possible methods of `callNode` according to enclosing `if` / `switch` and earlier early-return guards. */
function guardMethods(callNode, mtext, sf) {
  const restrictions = [];
  for (let n = callNode; n && n.parent; n = n.parent) {
    const p = n.parent;
    if (ts.isIfStatement(p)) {
      if (p.thenStatement === n) {
        const r = methodsWhenTrue(p.expression, mtext, sf);
        if (r) restrictions.push(r);
      } else if (p.elseStatement === n) {
        const r = methodsWhenFalse(p.expression, mtext, sf);
        if (r) restrictions.push(r);
      }
    } else if (ts.isCaseClause(p) && p.parent?.parent && ts.isSwitchStatement(p.parent.parent) && normMethodText(textOf(sf, p.parent.parent.expression)) === mtext) {
      const l = strLit(p.expression);
      if (l) restrictions.push(new Set([l]));
    }
    const stmts = ts.isBlock(p) || ts.isSourceFile(p) || ts.isCaseClause(p) || ts.isDefaultClause(p) ? p.statements : null;
    if (stmts) {
      for (const st of stmts) {
        if (st === n) break;
        if (ts.isIfStatement(st) && !st.elseStatement && exitsEarly(st.thenStatement)) {
          const r = methodsWhenFalse(st.expression, mtext, sf);
          if (r) restrictions.push(r);
        }
      }
    }
    if (ts.isFunctionLike(p)) break;
  }
  if (!restrictions.length) return null;
  let out = restrictions[0];
  for (const r of restrictions.slice(1)) {
    const inter = new Set([...out].filter((x) => r.has(x)));
    if (inter.size) out = inter;
  }
  return [...out];
}

/** An identifier is an HTTP client by name (api, axios...) or because of what it was imported from, so
 *  aliases such as `import APIInstance from "ui/services/api"` and `import CMS from "./apiCMS"` count too. */
const CLIENT_MODULE = /(^|[/])(axios|api|api[A-Z][\w-]*|[\w-]*[Aa]pi|api-[\w-]+)(\/index)?([.]\w+)?$/;
function isHttpClient(name, isPlainIdentifier, info) {
  if (API_RECEIVER.test(name)) return true;
  if (!isPlainIdentifier) return false;
  const imp = info.imports.get(name);
  return Boolean(imp?.spec && CLIENT_MODULE.test(imp.spec));
}

/** Calls that look like network access but were not recognised: reported in the audit, never silently ignored. */
function suspectReason(node, info) {
  const sf = info.sf;
  const callee = node.expression;
  const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const mk = (reason) => ({ line: pos.line + 1, reason, text: textOf(sf, node).slice(0, 140) });
  if (ts.isNewExpression(node)) {
    const n = ts.isIdentifier(callee) ? callee.text : "";
    return /^(XMLHttpRequest|EventSource|WebSocket)$/.test(n) ? mk(`new ${n}`) : null;
  }
  if (ts.isIdentifier(callee)) {
    if (/^(ky|got|superagent|\$http|ajax)$/.test(callee.text)) return mk(`direct ${callee.text}() call`);
    const impSpec = info.imports.get(callee.text)?.spec;
    if ((callee.text === "axios" || (impSpec && CLIENT_MODULE.test(impSpec))) && node.arguments[0] && ts.isObjectLiteralExpression(unwrap(node.arguments[0]))) return mk(`${callee.text}({...}) config call`);
    if (/^(useSWR|useSWRImmutable|useQuery|useMutation|useInfiniteQuery)$/.test(callee.text)) {
      const a = node.arguments[0] && resolveString(node.arguments[0], info, 0).value;
      return a && a.startsWith("/") ? mk(`${callee.text} keyed by a url`) : null;
    }
    return null;
  }
  if (ts.isPropertyAccessExpression(callee)) {
    const name = callee.name.text;
    const recv = textOf(sf, callee.expression);
    if (name === "sendBeacon") return mk("navigator.sendBeacon");
    {
      const rn0 = ts.isIdentifier(callee.expression) ? callee.expression.text : "";
      const strictClient = /^(api|axios|APIInstance|apiWithRefreshToken|apiHybris|apiProxy|CMS)$/.test(rn0) || Boolean(info.imports.get(rn0)?.spec && CLIENT_MODULE.test(info.imports.get(rn0).spec));
      if (rn0 && strictClient && !CLIENT_MEMBERS[name] && !/^(create|getPoolStats|isAxiosError|isCancel|all|spread|use|eject|then|catch|finally|toString)$/.test(name)) {
        return mk(`unrecognised member .${name}() called on http client ${rn0}`);
      }
    }
    if (recv === "$" && /^(ajax|get|post|getJSON)$/.test(name)) return mk("jQuery ajax");
    if (HTTP_METHODS.has(name) || name === "request") {
      const a0 = node.arguments[0];
      if (!a0) return null;
      const rn = ts.isIdentifier(callee.expression) ? callee.expression.text : ts.isPropertyAccessExpression(callee.expression) ? callee.expression.name.text : "";
      if (NOT_API_RECEIVER.test(rn)) return null;
      if (name === "request" && ts.isObjectLiteralExpression(unwrap(a0))) return mk(`.request({...}) on ${recv.slice(0, 40)}`);
      const v = resolveString(a0, info, 0).value;
      if (v.includes("/") || /^https?:/.test(v)) return mk(`.${name}("${v.slice(0, 60)}") on unrecognised receiver ${recv.slice(0, 40)}`);
    }
  }
  return null;
}

/** Returns the calls found at `node`: usually one, several when the url has alternatives
 *  (`isDev ? "/api/x" : "x"`). `api.get(url)` inside a helper whose `url` is its own parameter only
 *  forwards what its callers pass: the real URLs are recorded at those call sites, so it is marked
 *  `passthrough` and not listed as an endpoint. */
function detectApiCall(node, info) {
  const call = detectApiCallRaw(node, info);
  if (!call) return [];
  if (call.isParam && /^\{\w+\}$/.test(call.raw)) return [{ ...call, passthrough: true }];
  const hosts = hostsFor(node, call, info);
  let variants = [call];
  if (call.urlNode) {
    const alts = resolveAll(call.urlNode, info, 0);
    if (alts.length > 1) variants = alts.map((a) => ({ ...call, raw: a.value, resolved: a.resolved, isParam: false }));
  }
  // `method: req.method`: the real method(s) follow from the guards around the call
  if (call.method === "ANY" && call.methodExpr) {
    const mtext = normMethodText(textOf(info.sf, unwrap(call.methodExpr)));
    const ms = guardMethods(node, mtext, info.sf);
    if (ms?.length) variants = variants.flatMap((v) => ms.map((m) => ({ ...v, method: m, methodSource: "guard" })));
    else variants = variants.map((v) => ({ ...v, methodSource: "forwarded" }));
  }
  return variants.map((v) => ({ ...v, hosts }));
}

// ---- which server a call goes to: the client's default baseURL, or a per-call `baseURL` override
const baseCache = new Map();

/** Names of the environment variables (or literals) an expression is made of, e.g. `isDev ? A : process.env.B`. */
function envNamesOf(node, info, depth = 0) {
  const n = unwrap(node);
  if (!n || depth > 6) return [];
  const sf = info.sf;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text ? [n.text] : [];
  if (ts.isPropertyAccessExpression(n)) {
    const t = textOf(sf, n).replace(/\?\./g, ".");
    if (t.startsWith("process.env.")) return [t.slice(12)];
    return [t];
  }
  if (ts.isElementAccessExpression(n)) return [textOf(sf, n)];
  if (ts.isConditionalExpression(n)) return [...envNamesOf(n.whenTrue, info, depth + 1), ...envNamesOf(n.whenFalse, info, depth + 1)];
  if (ts.isBinaryExpression(n)) return [...envNamesOf(n.left, info, depth + 1), ...envNamesOf(n.right, info, depth + 1)];
  if (ts.isTemplateExpression(n)) return n.templateSpans.flatMap((sp) => envNamesOf(sp.expression, info, depth + 1));
  if (ts.isIdentifier(n)) {
    const init = lookupInit(info, n, depth);
    return init ? envNamesOf(init.node, init.info, depth + 1) : [n.text];
  }
  return [];
}

/** Initializer of a variable: local scope, then top-level of this file, then an imported module. */
function lookupInit(info, idNode, depth = 0) {
  const local = findLocalDecl(idNode);
  if (local) return local.init ? { node: local.init, info } : null;
  const top = info.symbols.get(idNode.text);
  const decl = top?.nodes?.find((x) => ts.isVariableDeclaration(x) && x.initializer);
  if (decl) return { node: decl.initializer, info };
  const imp = info.imports.get(idNode.text);
  if (imp?.module && imp.imported !== "*" && depth < 6) {
    const r = resolveExport(imp.module, imp.imported);
    if (r) {
      const i = r.lastIndexOf("#");
      const other = infos.get(r.slice(0, i));
      const d = other?.symbols.get(r.slice(i + 1))?.nodes?.find((x) => ts.isVariableDeclaration(x) && x.initializer);
      if (d) return { node: d.initializer, info: other };
    }
  }
  return null;
}

/** Default baseURL of the module that creates a client (`axios.create({ baseURL })`). */
function moduleBase(abs) {
  if (baseCache.has(abs)) return baseCache.get(abs);
  let labels = [];
  const inf = infos.get(abs);
  if (inf) {
    const visit = (node) => {
      if (labels.length) return;
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "baseURL") labels = envNamesOf(node.initializer, inf);
      else ts.forEachChild(node, visit);
    };
    visit(inf.sf);
  }
  baseCache.set(abs, labels);
  return labels;
}

let proxyModule;
function defaultHosts(call, info) {
  if (/^(makeRequest|request|serverGet|serverPost|serverPut|serverPatch|serverDelete)$/.test(call.client)) {
    if (proxyModule === undefined) proxyModule = [...infos.values()].find((i) => i.symbols.has("APIProxy"))?.file.abs || null;
    return proxyModule ? moduleBase(proxyModule) : [];
  }
  if (call.client === "fetch" || call.client === "EventSource") return [];
  const imp = call.recv ? info.imports.get(call.recv) : null;
  if (imp?.module) {
    const r = imp.imported === "*" ? null : resolveExport(imp.module, imp.imported);
    return moduleBase(r ? r.slice(0, r.lastIndexOf("#")) : imp.module);
  }
  if (call.recv && info.symbols.has(call.recv)) return moduleBase(info.file.abs); // client created in the same file
  return [];
}

function hostsFor(node, call, info) {
  const sf = info.sf;
  const objs = [];
  let unknownArg = false;
  const collect = (n) => {
    n = unwrap(n);
    if (!n) return;
    if (ts.isObjectLiteralExpression(n)) objs.push(n);
    else if (ts.isConditionalExpression(n)) {
      collect(n.whenTrue);
      collect(n.whenFalse);
    } else if (ts.isIdentifier(n)) {
      const d = findLocalDecl(n);
      if (d?.init) collect(d.init);
      else if (d?.isParam && /^(config|customConfig|options|opts|cfg)$/i.test(n.text)) unknownArg = true; // config passed in by the caller
    }
  };
  for (const a of node.arguments || []) collect(a);
  const labels = new Set();
  let withOverride = 0;
  for (const o of objs) {
    const b = propText(sf, o, "baseURL");
    if (b) {
      withOverride++;
      for (const l of envNamesOf(b.node, info)) labels.add(l);
    }
  }
  if (call.baseNode) for (const l of envNamesOf(call.baseNode, info)) labels.add(l); // postData(base_url, ...)
  const needDefault = withOverride === 0 || unknownArg || objs.some((o) => !propText(sf, o, "baseURL"));
  if (needDefault) for (const l of defaultHosts(call, info)) labels.add(l);
  return [...labels];
}

function detectApiCallRaw(node, info) {
  let recvForHost = null;
  let urlArg = null; // the url argument when it is not the first one
  let baseArg = null;
  const sf = info.sf;
  const callee = node.expression;
  const a0 = node.arguments[0];
  if (!a0) return null;
  let client = null;
  let method = null;

  // server-sent events: new EventSource(url)
  if (ts.isNewExpression(node)) {
    if (!(ts.isIdentifier(callee) && callee.text === "EventSource")) return null;
    const r = resolveString(a0, info, 0);
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { client: "EventSource", method: "GET", raw: r.value, resolved: r.resolved, isParam: r.isParam, urlNode: a0, line: pos.line + 1 };
  }

  // APIProxy / axios style: x.makeRequest({ method, url, ... }) and x.request({ ... })
  if (ts.isPropertyAccessExpression(callee) && /^(makeRequest|request)$/.test(callee.name.text) && ts.isObjectLiteralExpression(unwrap(a0))) {
    const obj = unwrap(a0);
    const urlProp = propText(sf, obj, "url");
    if (!urlProp) return null;
    const m = propText(sf, obj, "method");
    let method = "ANY"; // method comes from the incoming request (req.method) or is not literal
    if (m && (ts.isStringLiteral(m.node) || ts.isNoSubstitutionTemplateLiteral(m.node))) method = m.node.text.toUpperCase();
    const r = resolveString(urlProp.node, info, 0);
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { client: callee.name.text, method, methodExpr: method === "ANY" && m ? m.node : null, raw: r.value, resolved: r.resolved, isParam: r.isParam, urlNode: urlProp.node, line: pos.line + 1 };
  }
  // serverGet(ctx, url, config)
  if (ts.isIdentifier(callee) && /^server(Get|Post|Put|Patch|Delete)$/.test(callee.text) && node.arguments[1]) {
    const r = resolveString(node.arguments[1], info, 0);
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { client: callee.text, method: callee.text.slice(6).toUpperCase(), raw: r.value, resolved: r.resolved, isParam: r.isParam, urlNode: node.arguments[1], line: pos.line + 1 };
  }

  if (ts.isIdentifier(callee) && WRAPPER_FN.test(callee.text)) {
    client = callee.text;
    const a1 = node.arguments[1];
    if (a1 && (ts.isStringLiteral(a1) || ts.isNoSubstitutionTemplateLiteral(a1))) method = a1.text.toUpperCase();
  } else if ((ts.isIdentifier(callee) && callee.text === "fetch") || (ts.isPropertyAccessExpression(callee) && callee.name.text === "fetch" && /^(window|globalThis|self)$/.test(textOf(sf, callee.expression)))) {
    client = "fetch";
    method = "GET";
    const opts = node.arguments[1];
    if (opts && ts.isObjectLiteralExpression(opts)) {
      for (const p of opts.properties) {
        if (ts.isPropertyAssignment(p) && p.name.getText(sf) === "method" && ts.isStringLiteral(p.initializer)) method = p.initializer.text.toUpperCase();
      }
    }
  } else if (ts.isPropertyAccessExpression(callee) && CLIENT_MEMBERS[callee.name.text]) {
    const recv = callee.expression;
    const recvName = ts.isIdentifier(recv) ? recv.text : ts.isPropertyAccessExpression(recv) ? recv.name.text : null;
    if (!recvName || NOT_API_RECEIVER.test(recvName) || !isHttpClient(recvName, ts.isIdentifier(recv), info)) return null;
    client = recvName;
    recvForHost = recvName;
    const spec = CLIENT_MEMBERS[callee.name.text];
    method = spec.method;
    urlArg = node.arguments[spec.url];
    baseArg = spec.base !== undefined ? node.arguments[spec.base] : null;
    if (!urlArg) return null;
  } else {
    return null;
  }

  const urlNodeFinal = urlArg || a0;
  const r = resolveString(urlNodeFinal, info, 0);
  // the receiver was already vetted as an http client above, so even `api.get(url)` with an
  // unknown url is recorded (as a dynamic endpoint) instead of being silently dropped
  const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return { client, recv: recvForHost, method: method || "UNKNOWN", raw: r.value, resolved: r.resolved, isParam: r.isParam, urlNode: urlNodeFinal, baseNode: baseArg, line: pos.line + 1 };
}

/** Like resolveString, but a conditional (`a ? "x" : "y"`) yields every alternative (max 8). */
function resolveAll(node, info, depth) {
  const n = unwrap(node);
  if (depth > 6 || !n) return [resolveString(node, info, depth)];
  const uniq = (list) => {
    const seen = new Set();
    return list.filter((x) => !seen.has(x.value) && seen.add(x.value)).slice(0, 8);
  };
  const cross = (lefts, rights, glue) => uniq(lefts.flatMap((l) => rights.map((r) => ({ value: glue(l.value, r.value), resolved: l.resolved && r.resolved }))));
  if (ts.isConditionalExpression(n)) return uniq([...resolveAll(n.whenTrue, info, depth + 1), ...resolveAll(n.whenFalse, info, depth + 1)]);
  if (ts.isTemplateExpression(n)) {
    let combos = [{ value: n.head.text, resolved: true }];
    for (const span of n.templateSpans) {
      combos = cross(combos, resolveAll(span.expression, info, depth + 1), (a, b) => a + b + span.literal.text);
    }
    return combos;
  }
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return cross(resolveAll(n.left, info, depth + 1), resolveAll(n.right, info, depth + 1), (a, b) => a + b);
  }
  if (ts.isIdentifier(n)) {
    const local = findLocalDecl(n);
    if (local?.init) return resolveAll(local.init, info, depth + 1);
  }
  return [resolveString(n, info, depth)];
}

/** Find the declaration `name` refers to by walking up the enclosing scopes of `node`. */
/** True when the identifier is inside a type annotation / type argument (not executed code). */
function inTypePosition(node) {
  for (let a = node.parent; a && !ts.isStatement(a) && !ts.isFunctionLike(a); a = a.parent) {
    if (ts.isTypeNode(a) && !(ts.isExpressionWithTypeArguments(a) && ts.isHeritageClause(a.parent) && a.parent.token === ts.SyntaxKind.ExtendsKeyword && !ts.isInterfaceDeclaration(a.parent.parent))) return true;
  }
  return false;
}

function bindingNames(b, out = []) {
  if (!b) return out;
  if (ts.isIdentifier(b)) out.push(b.text);
  else if (ts.isObjectBindingPattern(b) || ts.isArrayBindingPattern(b)) for (const el of b.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
  return out;
}

/** Nearest declaration of `node.text` in an enclosing scope: variables, parameters (also destructured),
 *  for/for-of variables, catch variables, inner function/class declarations.
 *  `topLevel` is true when it is a declaration of the file itself (not shadowing an import). */
function findLocalDecl(node) {
  const name = node.text;
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) {
      for (const prm of n.parameters || []) {
        // a parameter is a runtime value even with a default: callers may pass something else
        if (bindingNames(prm.name).includes(name)) return { init: null, isParam: true, topLevel: false };
      }
    }
    if ((ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n)) && n.initializer && ts.isVariableDeclarationList(n.initializer)) {
      for (const d of n.initializer.declarations) if (bindingNames(d.name).includes(name)) return { init: ts.isIdentifier(d.name) ? d.initializer || null : null, topLevel: false };
    }
    if (ts.isCatchClause(n) && n.variableDeclaration && bindingNames(n.variableDeclaration.name).includes(name)) return { init: null, topLevel: false };
    const stmts = ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) || ts.isCaseClause(n) || ts.isDefaultClause(n) ? n.statements : null;
    if (stmts) {
      const topLevel = ts.isSourceFile(n);
      for (const st of stmts) {
        if (st.pos > node.pos) break;
        if (ts.isVariableStatement(st)) {
          for (const d of st.declarationList.declarations) {
            if (bindingNames(d.name).includes(name)) return { init: ts.isIdentifier(d.name) ? d.initializer || null : null, topLevel };
          }
        } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name?.text === name) {
          return { init: null, topLevel };
        }
      }
    }
  }
  return null;
}

/** Resolve a URL-ish expression to a template string. `${x}` becomes `{x}`. */
function resolveString(node, info, depth) {
  const sf = info.sf;
  if (depth > 6) return { value: `{${textOf(sf, node)}}`, resolved: false };
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { value: node.text, resolved: true };
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return resolveString(node.expression, info, depth + 1);
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL" && node.arguments?.[0]) {
    return resolveString(node.arguments[0], info, depth + 1); // new URL("/api/x", base) -> "/api/x"
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    let resolved = true;
    for (const span of node.templateSpans) {
      const r = resolveString(span.expression, info, depth + 1);
      value += r.value + span.literal.text;
      resolved = resolved && r.resolved;
    }
    return { value, resolved };
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = resolveString(node.left, info, depth + 1);
    const r = resolveString(node.right, info, depth + 1);
    return { value: l.value + r.value, resolved: l.resolved && r.resolved };
  }
  if (ts.isIdentifier(node)) {
    // nearest declaration in an enclosing scope wins (a parameter without a default is a runtime value)
    const local = findLocalDecl(node);
    if (local) {
      if (local.init) return resolveString(local.init, info, depth + 1);
      return { value: `{${node.text}}`, resolved: false, isParam: Boolean(local.isParam) };
    }
    // file-wide const (only when the name is unambiguous in this file)
    if (info.consts.has(node.text) && info.constCounts.get(node.text) === 1) return resolveString(info.consts.get(node.text), info, depth + 1);
    const imp = info.imports.get(node.text);
    if (imp?.module && imp.imported !== "*") {
      const other = infos.get(imp.module);
      const target = other && findConst(other, imp.imported);
      if (target) return resolveString(target.node, target.info, depth + 1);
    }
    return { value: `{${node.text}}`, resolved: false };
  }
  if (ts.isPropertyAccessExpression(node)) {
    const t = textOf(sf, node);
    if (t.startsWith("process.env.")) return { value: `{env:${t.slice(12)}}`, resolved: true };
    return { value: `{${t}}`, resolved: false };
  }
  if (ts.isConditionalExpression(node)) {
    // `cond ? "?a=1" : ""` -> an optional suffix: keep the non-empty branch
    const t = resolveString(node.whenTrue, info, depth + 1);
    const f = resolveString(node.whenFalse, info, depth + 1);
    if (f.resolved && f.value === "" && t.resolved) return t;
    if (t.resolved && t.value === "" && f.resolved) return f;
    return { value: "{param}", resolved: false };
  }
  if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
    // `cond && "?a=1"` / `x || "default"` -> use the string side
    const r = resolveString(node.right, info, depth + 1);
    if (r.resolved) return r;
  }
  const t = textOf(sf, node);
  return { value: /^[\w.]+$/.test(t) ? `{${t}}` : "{param}", resolved: false };
}

function findConst(info, name) {
  const e = info.exports.get(name);
  if (e?.local && info.consts.has(e.local) && info.constCounts.get(e.local) === 1) return { info, node: info.consts.get(e.local) };
  if (e?.from) {
    const other = infos.get(e.from);
    return other ? findConst(other, e.orig) : null;
  }
  return null;
}

// ---------------------------------------------------------------- symbol graph
function resolveExport(absFile, name, depth = 0, seen = new Set()) {
  if (!absFile || depth > 8) return null;
  const key = absFile + "#" + name;
  if (seen.has(key)) return null;
  seen.add(key);
  const info = infos.get(absFile);
  if (!info) return null;
  const e = info.exports.get(name);
  if (e?.local && info.symbols.has(e.local)) return `${absFile}#${e.local}`;
  // `import { x } from "..."; export default x;` -> follow the import
  if (e?.local) {
    const imp = info.imports.get(e.local);
    if (imp?.module && imp.imported !== "*") return resolveExport(imp.module, imp.imported, depth + 1, seen);
  }
  if (e?.from) return resolveExport(e.from, e.orig, depth + 1, seen);
  if (name !== "default") for (const star of info.stars) {
    const r = resolveExport(star, name, depth + 1, seen);
    if (r) return r;
  }
  return null;
}

/** Graph nodes an identifier refers to inside `info` (local top-level symbol and/or import). */
function targetsOf(info, name) {
  const out = [];
  if (info.symbols.has(name)) out.push(`${info.file.abs}#${name}`);
  const imp = info.imports.get(name);
  if (imp?.module && imp.imported !== "*") {
    const r = resolveExport(imp.module, imp.imported);
    if (r) out.push(r);
  }
  return out;
}

function memberTargets(tinfo, member) {
  if (member.sym) return [`${tinfo.file.abs}#${member.sym}`];
  return member.ref ? targetsOf(tinfo, member.ref) : [];
}

function buildEdges(info, symName) {
  const sym = info.symbols.get(symName);
  const out = new Set();
  const abs = info.file.abs;
  // the object itself is referenced as a whole -> all of its members
  if (sym.members && !sym.isClass) for (const m of sym.members.values()) for (const t of memberTargets(info, m)) out.add(t);
  // `obj.member` -> only that member when obj is an object literal we know, else the symbol itself
  for (const { name: rawName, prop } of sym.memberRefs) {
    // `this.x` inside a class method / `const v = new Cls(); v.x`
    const owner = symName.includes(".") ? symName.split(".")[0] : symName;
    const name = rawName === "this" ? (info.symbols.get(owner)?.isClass ? owner : rawName) : sym.newVars.get(rawName) || rawName;
    for (const t of targetsOf(info, name)) {
      const i = t.lastIndexOf("#");
      const tinfo = infos.get(t.slice(0, i));
      const member = tinfo?.symbols.get(t.slice(i + 1))?.members?.get(prop);
      if (member) for (const mt of memberTargets(tinfo, member)) out.add(mt);
      else if (!tinfo?.symbols.get(t.slice(t.lastIndexOf("#") + 1))?.members) out.add(t); // unknown member of a known object: not a link
    }
  }
  for (const ref of sym.refs) {
    if (info.symbols.has(ref) && ref !== symName) out.add(`${abs}#${ref}`);
    const imp = info.imports.get(ref);
    if (imp?.module) {
      if (imp.imported === "*") {
        const o = infos.get(imp.module);
        if (o) for (const n of o.exports.keys()) { const r = resolveExport(imp.module, n); if (r) out.add(r); }
      } else {
        const r = resolveExport(imp.module, imp.imported);
        if (r) out.add(r);
      }
    }
  }
  for (const { ns, prop } of sym.nsRefs) {
    const imp = info.imports.get(ns);
    const r = imp?.module && resolveExport(imp.module, prop);
    if (r) out.add(r);
  }
  for (const m of sym.dynamicImports) {
    const o = infos.get(m);
    if (o) for (const n of o.symbols.keys()) out.add(`${m}#${n}`);
  }
  return out;
}

// ---------------------------------------------------------------- main
console.error(`Scanning ${files.length} files in ${REPO} ...`);
for (const f of files) {
  try {
    infos.set(f.abs, analyse(f));
  } catch (e) {
    console.error(`  ! failed to parse ${rel(f.abs)}: ${e.message}`);
  }
}

for (const info of infos.values()) {
  try {
    info.scan();
  } catch (e) {
    console.error(`  ! failed to scan ${rel(info.file.abs)}: ${e.message}`);
  }
}

const graph = new Map(); // node -> Set(node)
for (const info of infos.values()) for (const s of info.symbols.keys()) graph.set(`${info.file.abs}#${s}`, buildEdges(info, s));

// ---- page roots
function pageInfo(f) {
  const r = rel(f.abs);
  let m = r.match(/^apps\/[^/]+\/src\/pages\/(.+)\.(tsx?|jsx?)$/);
  if (m) {
    let route = "/" + m[1].replace(/\/index$/, "").replace(/^index$/, "");
    const isApi = route.startsWith("/api/") || route === "/api";
    if (/^\/_(app|document)$/.test(route)) return { route, kind: "global" };
    return { route: route || "/", kind: isApi ? "api-route" : "page" };
  }
  m = r.match(/^apps\/[^/]+\/src\/(proxy|middleware|instrumentation)\.(tsx?|jsx?)$/);
  if (m) return { route: `/(${m[1]})`, kind: "middleware" };
  m = r.match(/^apps\/[^/]+\/src\/app\/(.*)page\.(tsx?|jsx?)$/);
  if (m) return { route: "/" + m[1].replace(/\/$/, ""), kind: "page" };
  m = r.match(/^apps\/[^/]+\/src\/app\/(.*)route\.(tsx?|jsx?)$/);
  if (m) return { route: "/" + m[1].replace(/\/$/, ""), kind: "api-route" };
  return null;
}

// ---- endpoint registry
const endpoints = new Map(); // key -> endpoint

// a leading environment variable ({env:X}) or a base/host-like name is the server address, not part of the path
const BASE_PLACEHOLDER = /^(\{env:[^}]*\}|\{[^}]*(base|api[_-]?url|host|origin|server|domain)[^}]*\})\/?/i;

function sanitizeParams(p) {
  return p.replace(/\{([^}]*)\}/g, (_, inner) => (/^[\w.]+$/.test(inner) ? `{${inner.split(".").pop()}}` : "{param}"));
}

function normalizePath(raw) {
  let p = raw.trim();
  let query = null;
  let qi = -1;
  for (let i = 0, depth = 0; i < p.length; i++) {
    if (p[i] === "{") depth++;
    else if (p[i] === "}") depth = Math.max(0, depth - 1);
    else if (p[i] === "?" && depth === 0) { qi = i; break; }
  }
  if (qi >= 0) {
    query = p.slice(qi + 1);
    p = p.slice(0, qi);
  }
  // "{env:NEXT_PUBLIC_BASE_URL}/x" or "{baseURL}x" -> "/x"; keep absolute hosts
  p = p.replace(BASE_PLACEHOLDER, "/");
  if (!/^https?:\/\//.test(p) && !p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/{2,}/g, (m, off) => (off > 0 && p[off - 1] === ":" ? m : "/"));
  // `/path{params}` : a placeholder glued to the end of a segment is a query string built at runtime
  const tail = p.match(/^(.*[^/{])\{[^}]*\}$/);
  if (tail) {
    p = tail[1];
    if (!query) query = "(dynamic)";
  }
  // a path whose first segment is still a placeholder cannot be attributed to a service
  const dynamic = /^\/\{/.test(p);
  return { path: sanitizeParams(p), query, dynamic };
}

// All Next.js API routes of the FE (pages/api/**, app/**/route.*), with params blanked: "/api/x/{}"
const blankParams = (r) => r.replace(/\[\.{0,3}\w+\]|\{[^}]*\}/g, "{}");
const apiRouteSet = new Set();
for (const f of files) {
  const pi = pageInfo(f);
  if (pi?.kind === "api-route") apiRouteSet.add(blankParams(pi.route));
}

function classify(p, dynamic) {
  if (/^https?:\/\//.test(p)) return { target: "external", service: new URL(p.replace(/\{[^}]*\}/g, "x")).host };
  if (dynamic) return { target: "dynamic", service: "(dynamic)" };
  if (p === "/api" || p.startsWith("/api/")) return { target: "next-bff", service: "next-bff", bffRoute: p };
  // an app served under a basePath, e.g. "/myaccount/api/loyalty/astrapoints" -> route "/api/loyalty/astrapoints"
  const bp = p.match(/^\/[^/]+(\/api\/.*)$/);
  if (bp && apiRouteSet.has(blankParams(bp[1]))) return { target: "next-bff", service: "next-bff", bffRoute: bp[1] };
  const seg = p.split("/").filter(Boolean);
  return { target: "backend", service: seg[0] || "(root)", version: /^v\d+$/.test(seg[1] || "") ? seg[1] : null };
}

let passthroughCalls = 0;
const verifiedNonApi = [];
const callSites = new Map(); // node -> [endpointKey]
for (const info of infos.values()) {
  for (const [symName, sym] of info.symbols) {
    for (const c of sym.calls) {
      if (!c.raw) continue;
      if (c.passthrough) { passthroughCalls++; continue; }
      const note = (annotations.notApi || []).find((a) => rel(info.file.abs).endsWith(a.file) && (!a.rawIncludes || c.raw.includes(a.rawIncludes)));
      if (note) {
        verifiedNonApi.push({ file: rel(info.file.abs), line: c.line, url: c.raw, reason: note.reason });
        continue;
      }
      const leadHost = BASE_PLACEHOLDER.test(c.raw) ? c.raw.match(/^\{(?:env:)?([^}]+)\}/)?.[1] : null;
      const { path: p, query, dynamic } = normalizePath(c.raw);
      const cls = classify(p, dynamic);
      const idKey = `${c.method} ${blankParams(p)}`; // /x/{slug} and /x/{slugName} are the same endpoint
      let ep = endpoints.get(idKey);
      if (!ep) {
        ep = { key: `${c.method} ${p}`, method: c.method, path: p, ...cls, hosts: [], query: [], calls: [], usedBy: [] };
        endpoints.set(idKey, ep);
      }
      const key = ep.key;
      // a host written inside the url (`${BASE}/x`) wins over the client default
      const hostsOfCall = leadHost ? [leadHost] : c.hosts?.length ? c.hosts : [];
      for (const h of hostsOfCall) if (!ep.hosts.includes(h)) ep.hosts.push(h);
      if (query && !ep.query.includes(query)) ep.query.push(query);
      ep.calls.push({
        app: info.file.app,
        file: rel(info.file.abs),
        line: c.line,
        symbol: symName === "<module>" ? null : symName,
        client: c.client,
        ...(hostsOfCall.length ? { hosts: hostsOfCall } : {}),
        ...(cls.target === "dynamic" ? { url: c.raw } : {}), // the unresolved url expression, to see what it is
        ...(c.methodSource ? { methodSource: c.methodSource } : {}),
        ...(c.condition ? { when: c.condition } : {}),
      });
      const node = `${info.file.abs}#${symName}`;
      if (!callSites.has(node)) callSites.set(node, []);
      callSites.get(node).push(key);
    }
  }
}

// ---- reachability from each page
const usedBySet = new Map(); // key -> Set("<app>:<route>")
const routeDepth = new Map(); // "<route, params blanked>" -> Map(endpointKey -> min call depth from the route handler)
let pageCount = 0;
for (const f of files) {
  const pi = pageInfo(f);
  if (!pi) continue;
  const info = infos.get(f.abs);
  if (!info) continue;
  pageCount++;
  const start = [...info.symbols.keys()].map((s) => `${f.abs}#${s}`);
  // `export default importedHandler;` has no symbol of its own: start from what it points at
  const defaultTarget = resolveExport(f.abs, "default");
  if (defaultTarget && !start.includes(defaultTarget)) start.push(defaultTarget);
  const dist = new Map(start.map((n) => [n, 0]));
  const parent = EXPLAIN ? new Map() : null;
  const queue = [...start];
  const routeKey = pi.kind === "api-route" ? blankParams(pi.route) : null;
  for (let qi = 0; qi < queue.length; qi++) {
    const n = queue[qi];
    for (const k of callSites.get(n) || []) {
      if (!usedBySet.has(k)) usedBySet.set(k, new Set());
      usedBySet.get(k).add(`${f.app}:${pi.route}`);
      if (routeKey) {
        if (!routeDepth.has(routeKey)) routeDepth.set(routeKey, new Map());
        const m = routeDepth.get(routeKey);
        m.set(k, Math.min(m.get(k) ?? Infinity, dist.get(n)));
      }
    }
    for (const nx of graph.get(n) || []) if (!dist.has(nx)) { dist.set(nx, dist.get(n) + 1); queue.push(nx); if (parent) parent.set(nx, n); }
  }
  if (parent && explainShown < 4) {
    for (const [node, keys] of callSites) {
      if (dist.has(node) && keys.some((k) => k.includes(EXPLAIN))) {
        const chain = [];
        for (let x = node; x; x = parent.get(x)) chain.unshift(rel(x.slice(0, x.lastIndexOf("#"))) + "#" + x.slice(x.lastIndexOf("#") + 1));
        console.error(["[explain] " + f.app + ":" + pi.route, ...chain.map((c, i) => (i ? " -> " : "    ") + c)].join(String.fromCharCode(10)));
        explainShown++;
        break;
      }
    }
  }
}

const list = [...endpoints.values()].map((ep) => {
  // "<app>:<route>" strings keep the file small (hundreds of pages use the auth endpoints)
  const usedBy = [...(usedBySet.get(ep.key) || [])].sort();
  ep.calls.sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line));
  return { ...ep, usedBy, apps: [...new Set(usedBy.map((u) => u.slice(0, u.indexOf(":"))))].sort() };
}).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

// ---- calls that forward `req.method` without any guard: the backend method equals the method of the
// request that reached the handler. For an /api route that is the method(s) the FE uses to call it; for
// server-side rendering of a page it is the page request (GET).
const splitMap = new Map(); // key of an `ANY` endpoint -> keys it was split into
{
  const normRoute = (r) => r.replace(/\?.*$/, "").replace(/\[\.{0,3}(\w+)\]/g, "{$1}");
  const bffMethods = new Map();
  for (const ep of list) {
    if (ep.target !== "next-bff" || ep.method === "ANY") continue;
    const r = normRoute(ep.bffRoute || ep.path);
    if (!bffMethods.has(r)) bffMethods.set(r, new Set());
    bffMethods.get(r).add(ep.method);
  }
  const byKey = new Map(list.map((e) => [e.key, e]));
  for (const ep of [...list]) {
    if (ep.method !== "ANY") continue;
    const per = new Map();
    for (const u of ep.usedBy) {
      const i = u.indexOf(":");
      const route = u.slice(i + 1);
      const ms = route.startsWith("/api/") ? [...(bffMethods.get(normRoute(route)) || [])] : /^\/\(/.test(route) ? [] : ["GET"];
      for (const m of ms.length ? ms : ["ANY"]) {
        if (!per.has(m)) per.set(m, []);
        per.get(m).push(u);
      }
    }
    if (!per.size || (per.size === 1 && per.has("ANY"))) continue; // nothing known: leave as ANY
    list.splice(list.indexOf(ep), 1);
    splitMap.set(ep.key, [...per.keys()].map((m) => `${m} ${ep.path}`));
    for (const [m, used] of per) {
      const key = `${m} ${ep.path}`;
      let target = byKey.get(key);
      if (!target) {
        target = { ...ep, key, method: m, calls: [], usedBy: [], methodSource: m === "ANY" ? undefined : "inferred" };
        byKey.set(key, target);
        list.push(target);
      }
      target.calls.push(...ep.calls.map((c) => ({ ...c, methodSource: c.methodSource || "inferred" })));
      target.usedBy = [...new Set([...target.usedBy, ...used])].sort();
      target.apps = [...new Set(target.usedBy.map((x) => x.slice(0, x.indexOf(":"))))].sort();
    }
  }
  list.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

// For a Next.js /api route: which backend calls its handler makes (depth 0-2 = written in the
// handler or the helper it calls; deeper = shared infrastructure such as token refresh).
const byKeyAll = new Map(list.map((e) => [e.key, e]));
for (const ep of list) {
  if (ep.target !== "next-bff") continue;
  const depths = routeDepth.get(blankParams((ep.bffRoute || ep.path).replace(/\?.*$/, "")));
  if (!depths) continue;
  const rows = new Map();
  for (const [k0, depth] of depths) {
    for (const k of splitMap.get(k0) || [k0]) {
      const be = byKeyAll.get(k);
      if (!be || be.target === "next-bff") continue;
      const when = [...new Set(be.calls.map((c) => c.when).filter(Boolean))];
      const prev = rows.get(k);
      if (!prev || depth < prev.depth) rows.set(k, { key: k, depth, ...(when.length ? { when } : {}), ...(be.hosts.length ? { hosts: be.hosts } : {}) });
    }
  }
  ep.backendCalls = [...rows.values()].sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key));
}

// ---- storefront scope: leave out what is not a backend API of a live FE flow
const audit = { deadOmitted: [], bffWithoutBackend: [], unreferencedRoutes: [], verifiedNonApi };
const normRoute2 = (r) => blankParams(r.replace(/\?.*$/, ""));
const calledRoutes = new Set(list.filter((e) => e.target === "next-bff" && e.usedBy.length).map((e) => normRoute2(e.bffRoute || e.path)));
const externalRoutes = new Set((annotations.externallyInvokedRoutes || []).map((r) => normRoute2(r.route)));
const isLiveUse = (u) => {
  const route = u.slice(u.indexOf(":") + 1);
  if (!route.startsWith("/api/")) return true; // a page / middleware
  const n = normRoute2(route);
  return calledRoutes.has(n) || externalRoutes.has(n); // an /api route nobody calls is dead code
};
const live = [];
for (const ep of list) {
  const liveUsedBy = ep.usedBy.filter(isLiveUse);
  if (!INCLUDE_DEAD && liveUsedBy.length === 0) {
    audit.deadOmitted.push({ key: ep.key, at: ep.calls.slice(0, 2).map((c) => `${c.file}:${c.line}${c.symbol ? " " + c.symbol : ""}`) });
    if (ep.usedBy.length) audit.unreferencedRoutes.push({ key: ep.key, routes: ep.usedBy });
    continue;
  }
  if (!INCLUDE_DEAD) {
    ep.usedBy = liveUsedBy;
    ep.apps = [...new Set(liveUsedBy.map((x) => x.slice(0, x.indexOf(":"))))].sort();
  }
  if (ep.target === "next-bff" && !(ep.backendCalls && ep.backendCalls.length)) {
    audit.bffWithoutBackend.push(ep.key);
    if (!INCLUDE_DEAD) continue;
  }
  live.push(ep);
}
list.length = 0;
list.push(...live);

// ---- audit: network-looking calls the scanner could not classify
const suspects = [];
for (const info of infos.values()) {
  for (const [symName, sym] of info.symbols) {
    for (const sp of sym.suspects) suspects.push({ file: rel(info.file.abs), line: sp.line, symbol: symName === "<module>" ? null : symName, reason: sp.reason, code: sp.text });
  }
}
suspects.sort((a, b) => (a.file + String(a.line).padStart(6, "0")).localeCompare(b.file + String(b.line).padStart(6, "0")));

const stats = {
  filesScanned: files.length,
  pages: pageCount,
  endpoints: list.length,
  endpointsWithoutPage: list.filter((e) => e.usedBy.length === 0).length,
  endpointsDynamic: list.filter((e) => e.target === "dynamic").length,
  byTarget: list.reduce((a, e) => ((a[e.target] = (a[e.target] || 0) + 1), a), {}),
  byService: list.filter((e) => e.target === "backend").reduce((a, e) => ((a[e.service] = (a[e.service] || 0) + 1), a), {}),
};

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repo: { name: path.basename(REPO), ...META },
  stats: { ...stats, auditSuspects: suspects.length, passthroughWrapperCalls: passthroughCalls, deadEndpointsOmitted: audit.deadOmitted.length },
  audit: { suspects, ...audit, excludedApps: [...EXCLUDE_APPS] },
  endpoints: list,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.error(`Done: ${list.length} endpoints, ${pageCount} pages -> ${OUT}`);
console.error(JSON.stringify(stats, null, 2));
