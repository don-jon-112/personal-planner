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
  RefreshCw
} from "lucide-react";
import { enableNetwork, disableNetwork, getDocs, collection } from "firebase/firestore";
import { db } from "@/firebase/config";
import { useQueryClient } from "@tanstack/react-query";
import { DataTablePagination } from "@/components/ui/pagination";

function SecretValueCell({ value, isMasked }: { value?: string; isMasked: boolean }) {
  const [copied, setCopied] = useState(false);
  const displayVal = value || "-";

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-1 group/cell max-w-[200px]">
      <span className="font-mono text-xs truncate">
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
          className="opacity-0 group-hover/cell:opacity-100 focus:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity rounded"
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
  const [isGlobalMasked, setIsGlobalMasked] = useState(true);

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
      
      // 1. Fetch projects to find matching secret share token
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
        // 2. Fetch secret keys for this project
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
  }, [searchQuery, pageSize]);

  const processedSecrets = useMemo(() => {
    let list = [...secrets];

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

    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return list;
  }, [secrets, searchQuery]);

  const paginatedSecrets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedSecrets.slice(start, start + pageSize);
  }, [processedSecrets, currentPage, pageSize]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Loading Secret Vault...</p>
      </div>
    );
  }

  if (!token || !activeProject) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border rounded-2xl p-6 text-center shadow-lg space-y-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold">Access Denied or Expired</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The secret key link is invalid, expired, or has been disabled by the project administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Banner */}
      <header className="border-b bg-card px-4 py-3 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold flex items-center gap-2">
                {activeProject.name}
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Read-Only View
                </span>
              </h1>
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

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto p-4 sm:p-6 flex-1 space-y-4">
        {/* Search & Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by key or value..."
              className="pl-8 bg-muted/40 border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

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

        {/* Secret Keys Table */}
        <div className="border border-border/60 rounded-lg overflow-hidden bg-card shadow-sm">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[50px] font-semibold text-xs pl-3">No</TableHead>
                <TableHead className="font-semibold text-xs">Key</TableHead>
                <TableHead className="font-semibold text-xs">Value (SIT - ASCOM)</TableHead>
                <TableHead className="font-semibold text-xs">Value (UAT - ASCOM)</TableHead>
                <TableHead className="font-semibold text-xs">Value (PROD - ASCOM)</TableHead>
                <TableHead className="font-semibold text-xs">Value (PROD)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedSecrets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <p className="text-base font-medium">Data Secret Key Belum Tersedia</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Belum ada data Secret Key yang ditambahkan untuk project ini.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSecrets.map((secret, idx) => (
                  <TableRow key={secret.id} className="hover:bg-muted/30">
                    <TableCell className="font-semibold text-xs py-2.5 text-muted-foreground pl-3">
                      {(currentPage - 1) * pageSize + idx + 1}
                    </TableCell>
                    <TableCell className="font-mono font-medium text-xs py-2.5 text-foreground">
                      {secret.keyName || secret.key || "-"}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <SecretValueCell value={secret.valueSit} isMasked={isGlobalMasked} />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <SecretValueCell value={secret.valueUat} isMasked={isGlobalMasked} />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <SecretValueCell value={secret.valueProdAscom} isMasked={isGlobalMasked} />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <SecretValueCell value={secret.valueProd} isMasked={isGlobalMasked} />
                    </TableCell>
                  </TableRow>
                ))
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
