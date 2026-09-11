"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Search, 
  Key, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  Lock, 
  ShieldAlert, 
  Loader2,
  RefreshCw,
  AlertTriangle,
  Columns
} from "lucide-react";
import { enableNetwork, disableNetwork, getDocs, collection } from "firebase/firestore";
import { db } from "@/firebase/config";
import { useQueryClient } from "@tanstack/react-query";
import { DataTablePagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

function SecretValueCell({ 
  value, 
  isGlobalMasked, 
  hasMismatch = false 
}: { 
  value?: string; 
  isGlobalMasked: boolean; 
  hasMismatch?: boolean;
}) {
  const [isSelfRevealed, setIsSelfRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const displayVal = value || "-";

  useEffect(() => {
    setIsSelfRevealed(false);
  }, [isGlobalMasked]);

  const isMasked = isGlobalMasked ? !isSelfRevealed : false;

  const toggleReveal = () => {
    if (!value) return;
    setIsSelfRevealed((prev) => !prev);
  };

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      "flex items-center justify-between gap-1 group/cell max-w-[200px] px-1.5 py-1 rounded transition-colors",
      hasMismatch && "bg-amber-500/10 border border-amber-500/30"
    )}>
      <span
        onClick={toggleReveal}
        title={
          value
            ? isMasked
              ? "Click to reveal value"
              : "Click to hide value"
            : undefined
        }
        className={cn(
          "font-mono text-xs truncate select-all",
          value && "cursor-pointer hover:text-primary transition-colors font-medium",
          isMasked && value && "hover:bg-muted/60 px-1 rounded"
        )}
      >
        {displayVal === "-" ? (
          <span className="text-muted-foreground/60 italic">-</span>
        ) : isMasked ? (
          "••••••••"
        ) : (
          displayVal
        )}
      </span>

      {value && (
        <button
          type="button"
          onClick={handleCopy}
          title="Copy value"
          className="opacity-0 group-hover/cell:opacity-100 focus:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity rounded shrink-0"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

function GuestSecretsContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token");
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeProject, setActiveProject] = useState<any>(null);
  const [secrets, setSecrets] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "IN_PROD" | "NOT_IN_PROD" | "PROD_DIFF">("ALL");
  const [isGlobalMasked, setIsGlobalMasked] = useState(true);

  // PROD ASCOM visibility toggle (default hidden as requested, with localStorage persistence)
  const [showProdAscom, setShowProdAscom] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("secrets_show_prod_ascom");
      if (saved !== null) {
        setShowProdAscom(saved === "true");
      }
    }
  }, []);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadData = async (showLoadingState = true) => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    if (showLoadingState) setIsLoading(true);
    setIsRefreshing(true);

    try {
      await enableNetwork(db).catch(() => {});
      
      const projectsSnap = await getDocs(collection(db, "projects"));
      let matchedProj: any = null;

      projectsSnap.forEach((doc) => {
        const data = doc.data();
        if (
          data.shareSettings?.secretsShareToken === token &&
          data.shareSettings?.isSecretsEnabled !== false
        ) {
          matchedProj = { id: doc.id, ...data };
        }
      });

      setActiveProject(matchedProj);

      if (matchedProj) {
        const secretsSnap = await getDocs(collection(db, "secretKeys"));
        const list: any[] = [];
        secretsSnap.forEach((d) => {
          const sec = d.data();
          if (sec.projectId === matchedProj.id) {
            list.push({ id: d.id, ...sec });
          }
        });
        setSecrets(list);
      }
    } catch (e) {
      console.error("Error loading shared secret keys:", e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      if (typeof window !== "undefined" && localStorage.getItem("syncMode") !== "online") {
        await disableNetwork(db).catch(() => {});
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  const counts = useMemo(() => {
    let inProd = 0;
    let notInProd = 0;
    let prodDiff = 0;

    secrets.forEach((s: any) => {
      const isExist = Boolean(s.existsInProd ?? s.isExistInProd ?? false);
      if (isExist) inProd++;
      else notInProd++;

      const pA = (s.valueProdAscom || "").trim();
      const p = (s.valueProd || "").trim();
      if ((pA !== "" || p !== "") && pA !== p) {
        prodDiff++;
      }
    });

    return { all: secrets.length, inProd, notInProd, prodDiff };
  }, [secrets]);

  const processedSecrets = useMemo(() => {
    let list = [...secrets];

    const checkProdMismatch = (s: any) => {
      const prodAscom = (s.valueProdAscom || "").trim();
      const prod = (s.valueProd || "").trim();
      return (prodAscom !== "" || prod !== "") && prodAscom !== prod;
    };

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) => {
        const key = (s.keyName || s.key || "").toLowerCase();
        const sit = (s.valueSit || "").toLowerCase();
        const uat = (s.valueUat || "").toLowerCase();
        const prodAscom = (s.valueProdAscom || "").toLowerCase();
        const prod = (s.valueProd || "").toLowerCase();
        return key.includes(q) || sit.includes(q) || uat.includes(q) || prodAscom.includes(q) || prod.includes(q);
      });
    }

    if (statusFilter !== "ALL") {
      list = list.filter((s) => {
        const isExistInProd = Boolean(s.existsInProd ?? s.isExistInProd ?? false);
        if (statusFilter === "IN_PROD") return isExistInProd === true;
        if (statusFilter === "NOT_IN_PROD") return isExistInProd === false;
        if (statusFilter === "PROD_DIFF") return checkProdMismatch(s);
        return true;
      });
    }

    list.sort((a, b) => {
      if (showProdAscom) {
        const diffA = checkProdMismatch(a);
        const diffB = checkProdMismatch(b);

        if (diffA !== diffB) {
          return diffA ? -1 : 1;
        }
      }

      const keyA = (a.keyName || a.key || "").toLowerCase();
      const keyB = (b.keyName || b.key || "").toLowerCase();
      return keyA.localeCompare(keyB);
    });

    return list;
  }, [secrets, searchQuery, statusFilter, showProdAscom]);

  const paginatedSecrets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedSecrets.slice(start, start + pageSize);
  }, [processedSecrets, currentPage, pageSize]);

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full p-6 bg-card border border-border rounded-xl shadow-lg text-center space-y-4">
          <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Invalid Secret Share Link</h2>
          <p className="text-sm text-muted-foreground">
            No share token provided. Please verify the URL link you received.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
        <p className="text-sm text-muted-foreground font-medium">Loading Secret Key Vault...</p>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full p-6 bg-card border border-border rounded-xl shadow-lg text-center space-y-4">
          <div className="w-12 h-12 bg-amber-500/10 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Access Revoked or Link Expired</h2>
          <p className="text-sm text-muted-foreground">
            This Secret Key share link is inactive or invalid. Please request a new share link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card px-4 sm:px-6 py-4 sticky top-0 z-30 shadow-xs">
        <div className="w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground">{activeProject.name}</h1>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Guest Read-Only
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">Shared Lower Environment Secret Vault</p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadData(false)}
            disabled={isRefreshing}
            className="text-xs h-8 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="w-full flex-1 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 w-full sm:w-auto flex-1">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by key or value..."
                className="pl-8 bg-muted/40 border-border h-9 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/60 text-xs shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-all select-none cursor-pointer",
                  statusFilter === "ALL"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All ({counts.all})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("IN_PROD")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-all select-none cursor-pointer flex items-center gap-1.5",
                  statusFilter === "IN_PROD"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                In PROD ({counts.inProd})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("NOT_IN_PROD")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-all select-none cursor-pointer flex items-center gap-1.5",
                  statusFilter === "NOT_IN_PROD"
                    ? "bg-muted-foreground/15 text-foreground border border-border font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                Not in PROD ({counts.notInProd})
              </button>

              {showProdAscom && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("PROD_DIFF")}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-all select-none cursor-pointer flex items-center gap-1.5",
                    statusFilter === "PROD_DIFF"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  PROD Diff ({counts.prodDiff})
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const nextState = !showProdAscom;
                setShowProdAscom(nextState);
                if (typeof window !== "undefined") {
                  localStorage.setItem("secrets_show_prod_ascom", String(nextState));
                }
                if (!nextState && statusFilter === "PROD_DIFF") {
                  setStatusFilter("ALL");
                }
              }}
              className={cn(
                "text-xs h-8 gap-1.5 shrink-0 transition-colors",
                showProdAscom
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={showProdAscom ? "Hide PROD ASCOM column & PROD Diff" : "Show PROD ASCOM column & PROD Diff"}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{showProdAscom ? "Hide PROD ASCOM" : "Show PROD ASCOM"}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsGlobalMasked(!isGlobalMasked)}
              className="text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              {isGlobalMasked ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>Show Values</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Mask Values</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Secret Keys Table */}
        <div className="border border-border/60 rounded-lg overflow-hidden bg-card shadow-sm">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[50px] font-semibold text-xs pl-3">No</TableHead>
                <TableHead className="font-semibold text-xs">Key</TableHead>
                <TableHead className="font-semibold text-xs">Exist in PROD</TableHead>
                <TableHead className="font-semibold text-xs">Value (SIT - ASCOM)</TableHead>
                <TableHead className="font-semibold text-xs">Value (UAT - ASCOM)</TableHead>
                {showProdAscom && (
                  <TableHead className="font-semibold text-xs">Value (PROD - ASCOM)</TableHead>
                )}
                <TableHead className="font-semibold text-xs">Value (PROD)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedSecrets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showProdAscom ? 7 : 6} className="text-center py-12 text-muted-foreground">
                    <p className="text-base font-medium">Data Secret Key Belum Tersedia</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Belum ada data Secret Key yang ditambahkan untuk project ini.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSecrets.map((secret, idx) => {
                  const prodAscom = (secret.valueProdAscom || "").trim();
                  const prod = (secret.valueProd || "").trim();
                  const isProdMismatch = (prodAscom !== "" || prod !== "") && prodAscom !== prod;
                  const isExistInProd = Boolean(secret.existsInProd ?? secret.isExistInProd ?? false);

                  return (
                    <TableRow key={secret.id} className="hover:bg-muted/30">
                      <TableCell className="font-semibold text-xs py-2.5 text-muted-foreground pl-3">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </TableCell>
                      <TableCell className="font-mono font-medium text-xs py-2.5 text-foreground">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{secret.keyName || secret.key || "-"}</span>
                          {showProdAscom && isProdMismatch && (
                            <span
                              title="Warning: Value (PROD - ASCOM) and Value (PROD) are different!"
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                            >
                              <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                              PROD Diff
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold select-none",
                            isExistInProd
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                              : "bg-muted text-muted-foreground border border-border"
                          )}
                        >
                          {isExistInProd ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              ✓ In PROD
                            </>
                          ) : (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                              Not in PROD
                            </>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <SecretValueCell value={secret.valueSit} isGlobalMasked={isGlobalMasked} />
                      </TableCell>
                      <TableCell className="py-2.5">
                        <SecretValueCell value={secret.valueUat} isGlobalMasked={isGlobalMasked} />
                      </TableCell>
                      {showProdAscom && (
                        <TableCell className="py-2.5">
                          <SecretValueCell value={secret.valueProdAscom} isGlobalMasked={isGlobalMasked} hasMismatch={isProdMismatch} />
                        </TableCell>
                      )}
                      <TableCell className="py-2.5">
                        <SecretValueCell value={secret.valueProd} isGlobalMasked={isGlobalMasked} hasMismatch={showProdAscom && isProdMismatch} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <DataTablePagination
            currentPage={currentPage}
            pageSize={pageSize}
            totalItems={processedSecrets.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            itemName="secrets"
          />
        </div>
      </main>
    </div>
  );
}

export default function GuestSecretsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <GuestSecretsContent />
    </Suspense>
  );
}
