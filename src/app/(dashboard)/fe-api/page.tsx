"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Panel, PanelContent } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Network, Search, Download, Lock, ChevronRight, ChevronDown, GitCommit } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

interface EndpointCall {
  app: string;
  file: string;
  line: number;
  symbol: string | null;
  client: string;
}
// "<app>:<route>", e.g. "digiroom-cms:/news-tips/[slug]"
type EndpointUsage = string;
function parseUsage(u: EndpointUsage) {
  const i = u.indexOf(":");
  const route = u.slice(i + 1);
  const kind = route.startsWith("/api/") ? "api-route" : route === "/_app" || route === "/_document" ? "global" : "page";
  return { app: u.slice(0, i), route, kind };
}
interface FeEndpoint {
  key: string;
  method: string;
  path: string;
  target: "backend" | "next-bff" | "external" | "dynamic";
  service: string;
  version?: string | null;
  query: string[];
  calls: EndpointCall[];
  usedBy: EndpointUsage[];
  apps: string[];
}
interface FeApiMap {
  generatedAt: string;
  repo: { name: string; branch?: string; commit?: string; commitAuthor?: string; commitDate?: string; commitMessage?: string };
  stats: { filesScanned: number; pages: number; endpoints: number };
  changes?: { previousCommit: string | null; previousScannedAt: string; added: string[]; removed: string[] } | null;
  endpoints: FeEndpoint[];
}

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  POST: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  PUT: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  PATCH: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  DELETE: "bg-red-500/15 text-red-700 dark:text-red-400",
};
const PAGE_SIZE = 100;

export default function FeApiPage() {
  const { canView } = usePermissions();
  const hasView = canView("fe-api");

  const [map, setMap] = useState<FeApiMap | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [service, setService] = useState("all");
  const [method, setMethod] = useState("all");
  const [app, setApp] = useState("all");
  const [target, setTarget] = useState("backend");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/fe-api-map", { cache: "no-store" });
      const json = await res.json();
      setMap(json.map);
    } catch {
      setMap(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const endpoints = map?.endpoints ?? [];
  const services = useMemo(() => [...new Set(endpoints.filter((e) => e.target === "backend").map((e) => e.service))].sort(), [endpoints]);
  const apps = useMemo(() => [...new Set(endpoints.flatMap((e) => e.apps))].sort(), [endpoints]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return endpoints.filter((e) => {
      if (target !== "all" && e.target !== target) return false;
      if (service !== "all" && e.service !== service) return false;
      if (method !== "all" && e.method !== method) return false;
      if (app !== "all" && !e.apps.includes(app)) return false;
      if (q.length >= 2) {
        const hay = `${e.key} ${e.usedBy.join(" ")} ${e.calls.map((c) => c.file).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [endpoints, search, service, method, app, target]);

  useEffect(() => setLimit(PAGE_SIZE), [search, service, method, app, target]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const downloadJson = () => {
    if (!map) return;
    const blob = new Blob([JSON.stringify({ ...map, endpoints: filtered }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fe-api-map.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hasView) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Panel className="max-w-md text-center p-8 border-destructive/30 bg-destructive/5">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold mb-1">Access Denied</h2>
          <p className="text-sm text-muted-foreground">You do not have permission to view the FE API Map.</p>
        </Panel>
      </div>
    );
  }

  const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";
  const changes = map?.changes;

  return (
    <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="w-6 h-6 text-primary" /> FE API Map
          </h1>
          <p className="text-sm text-muted-foreground">Backend endpoints called by the frontend, and the pages that use them. Data comes from a scan of the FE repo (<code>npm run fe-api:scan</code>).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadJson} disabled={!map}>
            <Download className="w-4 h-4 mr-1.5" /> JSON
          </Button>
        </div>
      </div>

      {!loading && !map && (
        <div className="text-sm rounded-md border bg-muted/40 px-3 py-2">
          No scan data yet. Pull the FE repo, then run <code>npm run fe-api:scan</code> and commit <code>src/data/fe-api-map.json</code>.
        </div>
      )}

      {map && (
        <Panel>
          <PanelContent className="p-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5">
              <GitCommit className="w-4 h-4 text-muted-foreground" />
              <b>{map.repo.branch}</b> @ <code>{map.repo.commit?.slice(0, 8)}</code>
              {map.repo.commitMessage && <span className="text-muted-foreground truncate max-w-[360px]">— {map.repo.commitMessage}</span>}
            </span>
            <span>Scanned: {new Date(map.generatedAt).toLocaleString()}</span>
            <span>{map.stats.endpoints} endpoints</span>
            <span>{map.stats.pages} pages</span>
            <span>{map.stats.filesScanned} files</span>
          </PanelContent>
        </Panel>
      )}

      {changes && (changes.added.length > 0 || changes.removed.length > 0) && (
        <Panel>
          <PanelContent className="p-4 text-sm space-y-1">
            <b>Changes since the previous scan</b>
            {changes.added.length > 0 && <div className="text-emerald-700 dark:text-emerald-400">+ {changes.added.length} added: {changes.added.slice(0, 8).join(", ")}{changes.added.length > 8 && " …"}</div>}
            {changes.removed.length > 0 && <div className="text-red-700 dark:text-red-400">− {changes.removed.length} removed: {changes.removed.slice(0, 8).join(", ")}{changes.removed.length > 8 && " …"}</div>}
          </PanelContent>
        </Panel>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8 w-64" placeholder="Search path, page, or file…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={selectCls} value={service} onChange={(e) => setService(e.target.value)}>
          <option value="all">All services</option>
          {services.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selectCls} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="all">All methods</option>
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className={selectCls} value={app} onChange={(e) => setApp(e.target.value)}>
          <option value="all">All FE apps</option>
          {apps.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className={selectCls} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="backend">Backend APIs</option>
          <option value="next-bff">Next.js BFF (/api)</option>
          <option value="external">External</option>
          <option value="dynamic">Dynamic / unresolved</option>
          <option value="all">Everything</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !map ? null : (
        <Panel>
          <PanelContent className="p-0">
            <div className="px-4 py-2 text-xs text-muted-foreground border-b">{filtered.length} endpoints</div>
            <ul className="divide-y">
              {filtered.slice(0, limit).map((e) => {
                const isOpen = open.has(e.key);
                return (
                  <li key={e.key}>
                    <button className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40" onClick={() => toggle(e.key)}>
                      {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                      <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded w-16 text-center shrink-0", METHOD_STYLE[e.method] || "bg-muted text-muted-foreground")}>{e.method}</span>
                      <code className="text-sm flex-1 break-all">{e.path}</code>
                      <span className="text-xs text-muted-foreground shrink-0">{e.usedBy.length} pages · {e.apps.length} apps</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pl-11 grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="font-semibold mb-1">Used by pages</div>
                          {e.usedBy.length === 0 ? (
                            <p className="text-muted-foreground">No page reaches this call (dead code, or called through a path the scanner cannot follow).</p>
                          ) : (
                            <ul className="space-y-0.5 max-h-64 overflow-auto">
                              {e.usedBy.map((raw) => {
                                const u = parseUsage(raw);
                                return (
                                  <li key={raw}>
                                    <span className="text-muted-foreground">{u.app}</span> <code>{u.route}</code>
                                    {u.kind !== "page" && <span className="ml-1 text-[10px] uppercase text-muted-foreground">{u.kind}</span>}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold mb-1">Call sites</div>
                          <ul className="space-y-0.5 max-h-64 overflow-auto">
                            {e.calls.map((c, i) => (
                              <li key={i} className="break-all">
                                <code>{c.file}:{c.line}</code>
                                {c.symbol && <span className="text-muted-foreground"> · {c.symbol}()</span>}
                              </li>
                            ))}
                          </ul>
                          {e.query.length > 0 && <p className="mt-2 text-muted-foreground">Query: <code>{e.query.join(" | ")}</code></p>}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {filtered.length > limit && (
              <div className="p-3 text-center border-t">
                <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>Show more ({filtered.length - limit} left)</Button>
              </div>
            )}
          </PanelContent>
        </Panel>
      )}
    </div>
  );
}
