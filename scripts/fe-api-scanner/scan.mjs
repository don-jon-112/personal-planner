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

  const addSymbol = (name, node) => {
    if (!info.symbols.has(name)) info.symbols.set(name, { node: null, nodes: [], refs: new Set(), nsRefs: [], dynamicImports: [], calls: [] });
    info.symbols.get(name).nodes.push(node);
  };
  const hasMod = (node, kind) => Boolean(node.modifiers?.some((m) => m.kind === kind));

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const mod = resolveModule(st.moduleSpecifier.text, file);
      const clause = st.importClause;
      if (!clause) continue;
      if (clause.name) info.imports.set(clause.name.text, { module: mod, imported: "default" });
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) info.imports.set(nb.name.text, { module: mod, imported: "*" });
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) info.imports.set(el.name.text, { module: mod, imported: (el.propertyName || el.name).text });
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
      addSymbol("default", st);
      info.exports.set("default", { local: "default" });
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
        for (const n of names) {
          addSymbol(n, decl);
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
          if (call) sym.calls.push({ ...call, symbol: symName });
        }
        ts.forEachChild(node, visit);
      };
      visit(root);
    }
  }
  return info;
}

// ---------------------------------------------------------------- endpoint detection
function detectApiCall(node, info) {
  const sf = info.sf;
  const callee = node.expression;
  const a0 = node.arguments[0];
  if (!a0) return null;
  let client = null;
  let method = null;

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
    if (!recvName || NOT_API_RECEIVER.test(recvName) || !API_RECEIVER.test(recvName)) return null;
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
  if (ts.isConditionalExpression(node)) return { value: `{${textOf(sf, node)}}`, resolved: false };
  return { value: `{${textOf(sf, node).slice(0, 40)}}`, resolved: false };
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
  if (e?.from) return resolveExport(e.from, e.orig, depth + 1, seen);
  if (name !== "default") for (const star of info.stars) {
    const r = resolveExport(star, name, depth + 1, seen);
    if (r) return r;
  }
  return null;
}

function buildEdges(info, symName) {
  const sym = info.symbols.get(symName);
  const out = new Set();
  const abs = info.file.abs;
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
  const qi = p.indexOf("?");
  if (qi >= 0) {
    query = p.slice(qi + 1);
    p = p.slice(0, qi);
  }
  // "{env:NEXT_PUBLIC_BASE_URL}/x" or "{baseURL}x" -> "/x"; keep absolute hosts
  p = p.replace(BASE_PLACEHOLDER, "/");
  if (!/^https?:\/\//.test(p) && !p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/{2,}/g, (m, off) => (off > 0 && p[off - 1] === ":" ? m : "/"));
  // a path whose first segment is still a placeholder cannot be attributed to a service
  const dynamic = /^\/\{/.test(p);
  return { path: sanitizeParams(p), query, dynamic };
}

function classify(p, dynamic) {
  if (/^https?:\/\//.test(p)) return { target: "external", service: new URL(p.replace(/\{[^}]*\}/g, "x")).host };
  if (dynamic) return { target: "dynamic", service: "(dynamic)" };
  if (p === "/api" || p.startsWith("/api/")) return { target: "next-bff", service: "next-bff" };
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
      ep.calls.push({ app: info.file.app, file: rel(info.file.abs), line: c.line, symbol: symName === "<module>" ? null : symName, client: c.client });
      const node = `${info.file.abs}#${symName}`;
      if (!callSites.has(node)) callSites.set(node, []);
      callSites.get(node).push(key);
    }
  }
}

// ---- reachability from each page
const usedBySet = new Map(); // key -> Map(app|route -> entry)
let pageCount = 0;
for (const f of files) {
  const pi = pageInfo(f);
  if (!pi) continue;
  const info = infos.get(f.abs);
  if (!info) continue;
  pageCount++;
  const start = [...info.symbols.keys()].map((s) => `${f.abs}#${s}`);
  const seen = new Set(start);
  const queue = [...start];
  while (queue.length) {
    const n = queue.pop();
    for (const k of callSites.get(n) || []) {
      if (!usedBySet.has(k)) usedBySet.set(k, new Set());
      usedBySet.get(k).add(`${f.app}:${pi.route}`);
    }
    for (const nx of graph.get(n) || []) if (!seen.has(nx)) { seen.add(nx); queue.push(nx); }
  }
}

const list = [...endpoints.values()].map((ep) => {
  // "<app>:<route>" strings keep the file small (hundreds of pages use the auth endpoints)
  const usedBy = [...(usedBySet.get(ep.key) || [])].sort();
  ep.calls.sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line));
  return { ...ep, usedBy, apps: [...new Set(usedBy.map((u) => u.slice(0, u.indexOf(":"))))].sort() };
}).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

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
