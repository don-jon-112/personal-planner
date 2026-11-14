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
if (!getArg("repo")) {
  console.error("Missing --repo <path>");
  process.exit(1);
}

// ---------------------------------------------------------------- config
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", "public", "__tests__", "__mocks__"]);
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head"]);
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
    if (app.isDirectory() && fs.existsSync(path.join(appsDir, app.name, "src"))) {
      roots.push({ dir: path.join(appsDir, app.name, "src"), app: app.name });
    }
  }
}
const sharedDir = path.join(REPO, "packages", "shared", "ui");
if (fs.existsSync(sharedDir)) roots.push({ dir: sharedDir, app: "shared-ui" });
if (roots.length === 0) roots.push({ dir: REPO, app: path.basename(REPO) });

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
    if (!info.symbols.has(name)) info.symbols.set(name, { nodes: [], refs: new Set(), nsRefs: [], memberRefs: [], dynamicImports: [], calls: [], members: null });
    return info.symbols.get(name);
  };
  const addSymbol = (name, node) => ensureSymbol(name).nodes.push(node);
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
      addSymbol(name, st);
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

  // references + endpoint calls per symbol
  for (const [symName, sym] of info.symbols) {
    for (const root of sym.nodes) {
      const visit = (node) => {
        if (ts.isIdentifier(node)) {
          const p = node.parent;
          const isMemberName = p && ts.isPropertyAccessExpression(p) && p.name === node;
          const isPropKey = p && (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) && p.name === node;
          if (!isMemberName && !isPropKey) {
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
          const call = detectApiCall(node, info);
          if (call) sym.calls.push({ ...call, symbol: symName, condition: enclosingCondition(node, info) });
        }
        ts.forEachChild(node, visit);
      };
      visit(root);
    }
  }
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
  for (let n = node.parent; n && !ts.isFunctionLike(n) && parts.length < 2; n = n.parent) {
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

/** An identifier is an HTTP client by name (api, axios...) or because of what it was imported from, so
 *  aliases such as `import APIInstance from "ui/services/api"` and `import CMS from "./apiCMS"` count too. */
const CLIENT_MODULE = /(^|[/])(axios|api|api[A-Z][\w-]*|[\w-]*[Aa]pi|api-[\w-]+)(\/index)?([.]\w+)?$/;
function isHttpClient(name, isPlainIdentifier, info) {
  if (API_RECEIVER.test(name)) return true;
  if (!isPlainIdentifier) return false;
  const imp = info.imports.get(name);
  return Boolean(imp?.spec && CLIENT_MODULE.test(imp.spec));
}

function detectApiCall(node, info) {
  const sf = info.sf;
  const callee = node.expression;
  const a0 = node.arguments[0];
  if (!a0) return null;
  let client = null;
  let method = null;

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
    return { client: callee.name.text, method, raw: r.value, resolved: r.resolved, line: pos.line + 1 };
  }
  // serverGet(ctx, url, config)
  if (ts.isIdentifier(callee) && /^server(Get|Post|Put|Patch|Delete)$/.test(callee.text) && node.arguments[1]) {
    const r = resolveString(node.arguments[1], info, 0);
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { client: callee.text, method: callee.text.slice(6).toUpperCase(), raw: r.value, resolved: r.resolved, line: pos.line + 1 };
  }

  if (ts.isIdentifier(callee) && WRAPPER_FN.test(callee.text)) {
    client = callee.text;
    const a1 = node.arguments[1];
    if (a1 && (ts.isStringLiteral(a1) || ts.isNoSubstitutionTemplateLiteral(a1))) method = a1.text.toUpperCase();
  } else if (ts.isIdentifier(callee) && callee.text === "fetch") {
    client = "fetch";
    method = "GET";
    const opts = node.arguments[1];
    if (opts && ts.isObjectLiteralExpression(opts)) {
      for (const p of opts.properties) {
        if (ts.isPropertyAssignment(p) && p.name.getText(sf) === "method" && ts.isStringLiteral(p.initializer)) method = p.initializer.text.toUpperCase();
      }
    }
  } else if (ts.isPropertyAccessExpression(callee) && HTTP_METHODS.has(callee.name.text)) {
    const recv = callee.expression;
    const recvName = ts.isIdentifier(recv) ? recv.text : ts.isPropertyAccessExpression(recv) ? recv.name.text : null;
    if (!recvName || NOT_API_RECEIVER.test(recvName) || !isHttpClient(recvName, ts.isIdentifier(recv), info)) return null;
    client = recvName;
    method = callee.name.text.toUpperCase();
  } else {
    return null;
  }

  const r = resolveString(a0, info, 0);
  // Ignore calls whose first argument is clearly not a URL (e.g. map.get(key)).
  const looksLikeUrl = r.value.includes("/") || r.value.startsWith("{env:");
  const trusted = client === "fetch" || WRAPPER_FN.test(client);
  if (!looksLikeUrl && !trusted) return null;
  const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return { client, method: method || "UNKNOWN", raw: r.value, resolved: r.resolved, line: pos.line + 1 };
}

/** Resolve a URL-ish expression to a template string. `${x}` becomes `{x}`. */
function resolveString(node, info, depth) {
  const sf = info.sf;
  if (depth > 6) return { value: `{${textOf(sf, node)}}`, resolved: false };
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { value: node.text, resolved: true };
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return resolveString(node.expression, info, depth + 1);
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
    // local const (only when the name is unambiguous in this file)
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
  if (sym.members) for (const m of sym.members.values()) for (const t of memberTargets(info, m)) out.add(t);
  // `obj.member` -> only that member when obj is an object literal we know, else the symbol itself
  for (const { name, prop } of sym.memberRefs) {
    for (const t of targetsOf(info, name)) {
      const i = t.lastIndexOf("#");
      const tinfo = infos.get(t.slice(0, i));
      const member = tinfo?.symbols.get(t.slice(i + 1))?.members?.get(prop);
      if (member) for (const mt of memberTargets(tinfo, member)) out.add(mt);
      else out.add(t);
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
  m = r.match(/^apps\/[^/]+\/src\/app\/(.*)page\.(tsx?|jsx?)$/);
  if (m) return { route: "/" + m[1].replace(/\/$/, ""), kind: "page" };
  m = r.match(/^apps\/[^/]+\/src\/app\/(.*)route\.(tsx?|jsx?)$/);
  if (m) return { route: "/" + m[1].replace(/\/$/, ""), kind: "api-route" };
  return null;
}

// ---- endpoint registry
const endpoints = new Map(); // key -> endpoint

const BASE_PLACEHOLDER = /^\{(?:env:)?[^}]*(base|api[_-]?url|host|origin|server|domain)[^}]*\}\/?/i;

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

const callSites = new Map(); // node -> [endpointKey]
for (const info of infos.values()) {
  for (const [symName, sym] of info.symbols) {
    for (const c of sym.calls) {
      if (!c.raw) continue;
      const { path: p, query, dynamic } = normalizePath(c.raw);
      const cls = classify(p, dynamic);
      const key = `${c.method} ${p}`;
      let ep = endpoints.get(key);
      if (!ep) {
        ep = { key, method: c.method, path: p, ...cls, query: [], calls: [], usedBy: [] };
        endpoints.set(key, ep);
      }
      if (query && !ep.query.includes(query)) ep.query.push(query);
      ep.calls.push({
        app: info.file.app,
        file: rel(info.file.abs),
        line: c.line,
        symbol: symName === "<module>" ? null : symName,
        client: c.client,
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
const routeDepth = new Map(); // "<normalized route>" -> Map(endpointKey -> min call depth from the route handler)
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
  const queue = [...start];
  const routeKey = pi.kind === "api-route" ? pi.route.replace(/\[\.{0,3}(\w+)\]/g, "{$1}") : null;
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
    for (const nx of graph.get(n) || []) if (!dist.has(nx)) { dist.set(nx, dist.get(n) + 1); queue.push(nx); }
  }
}

const list = [...endpoints.values()].map((ep) => {
  // "<app>:<route>" strings keep the file small (hundreds of pages use the auth endpoints)
  const usedBy = [...(usedBySet.get(ep.key) || [])].sort();
  ep.calls.sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line));
  return { ...ep, usedBy, apps: [...new Set(usedBy.map((u) => u.slice(0, u.indexOf(":"))))].sort() };
}).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

// For a Next.js /api route: which backend calls its handler makes (depth 0-2 = written in the
// handler or the helper it calls; deeper = shared infrastructure such as token refresh).
const byKey = new Map(list.map((e) => [e.key, e]));
for (const ep of list) {
  if (ep.target !== "next-bff") continue;
  const depths = routeDepth.get((ep.bffRoute || ep.path).replace(/\?.*$/, ""));
  if (!depths) continue;
  ep.backendCalls = [...depths.entries()]
    .filter(([k]) => byKey.get(k) && byKey.get(k).target !== "next-bff")
    .map(([k, depth]) => {
      const when = [...new Set(byKey.get(k).calls.map((c) => c.when).filter(Boolean))];
      return { key: k, depth, ...(when.length ? { when } : {}) };
    })
    .sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key));
}

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
  stats,
  endpoints: list,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.error(`Done: ${list.length} endpoints, ${pageCount} pages -> ${OUT}`);
console.error(JSON.stringify(stats, null, 2));
