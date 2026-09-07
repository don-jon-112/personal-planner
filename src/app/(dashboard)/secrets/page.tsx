"use client";

import React, { useState, useMemo, useEffect } from "react";
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
  Plus, 
  Key, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  Edit3, 
  Trash2, 
  Share2, 
  Upload,
  AlertTriangle
} from "lucide-react";

import { useCollection, useDeleteDocument, useUpdateDocument } from "@/hooks/use-firestore";
import { useProject } from "@/components/project-context";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { DataTablePagination } from "@/components/ui/pagination";
import { SecretDialog } from "./secret-dialog";
import { SecretShareDialog } from "./secret-share-dialog";
import { SecretImportDialog } from "./secret-import-dialog";
import { cn } from "@/lib/utils";

// Cell helper for masked value with click-to-reveal & copy button
function SecretValueCell({ 
  value, 
  isGlobalMasked, 
  hasMismatch = false,
}: { 
  value?: string; 
  isGlobalMasked: boolean; 
  hasMismatch?: boolean;
}) {
  const [isSelfRevealed, setIsSelfRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const displayVal = value || "-";

  // Reset self-reveal when global mask mode changes
  useEffect(() => {
    setIsSelfRevealed(false);
  }, [isGlobalMasked]);

  const isMasked = isGlobalMasked ? !isSelfRevealed : false;

  const toggleReveal = () => {
    if (!value) return;
    setIsSelfRevealed((prev) => !prev);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
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

// Secret Table Row component (Sorted by Key ASC, non-draggable)
function SecretRow({
  secret,
  index,
  isMasked,
  onEdit,
  onDelete,
  onToggleExistInProd,
}: {
  secret: any;
  index: number;
  isMasked: boolean;
  onEdit: (secret: any) => void;
  onDelete: (secret: any) => void;
  onToggleExistInProd: (secret: any) => void;
}) {
  const prodAscom = (secret.valueProdAscom || "").trim();
  const prod = (secret.valueProd || "").trim();
  const isProdMismatch = (prodAscom !== "" || prod !== "") && prodAscom !== prod;
  const isExistInProd = Boolean(secret.existsInProd ?? secret.isExistInProd ?? false);

  return (
    <TableRow className="hover:bg-muted/30 group">
      <TableCell className="font-semibold text-xs py-2.5 text-muted-foreground pl-3 w-[50px]">
        {index + 1}
      </TableCell>
      <TableCell className="font-mono font-medium text-xs py-2.5 text-foreground">
        <div className="flex items-center gap-2 flex-wrap">
          <span>{secret.keyName || secret.key || "-"}</span>
          {isProdMismatch && (
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
        <button
          type="button"
          onClick={() => onToggleExistInProd(secret)}
          title="Click to toggle PROD existence status"
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all shadow-xs cursor-pointer select-none",
            isExistInProd
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
              : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
          )}
        >
          {isExistInProd ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ✓ In PROD
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
              Not in PROD
            </>
          )}
        </button>
      </TableCell>
      <TableCell className="py-2.5">
        <SecretValueCell value={secret.valueSit} isGlobalMasked={isMasked} />
      </TableCell>
      <TableCell className="py-2.5">
        <SecretValueCell value={secret.valueUat} isGlobalMasked={isMasked} />
      </TableCell>
      <TableCell className="py-2.5">
        <SecretValueCell value={secret.valueProdAscom} isGlobalMasked={isMasked} hasMismatch={isProdMismatch} />
      </TableCell>
      <TableCell className="py-2.5">
        <SecretValueCell value={secret.valueProd} isGlobalMasked={isMasked} hasMismatch={isProdMismatch} />
      </TableCell>
      <TableCell className="w-[80px] text-right py-2.5 pr-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(secret)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Edit secret"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(secret)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            title="Delete secret"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function SecretsPage() {
  const { activeProject, isItemInActiveProject } = useProject();
  const confirm = useConfirm();

  const { data: rawSecrets = [], isLoading } = useCollection<any>("secretKeys");
  const { mutate: deleteSecret } = useDeleteDocument("secretKeys");
  const { mutate: updateSecret } = useUpdateDocument("secretKeys");

  const activeSecrets = useMemo(() => {
    return rawSecrets.filter((s: any) => isItemInActiveProject(s.projectId));
  }, [rawSecrets, isItemInActiveProject]);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "IN_PROD" | "NOT_IN_PROD" | "PROD_DIFF">("ALL");
  const [isGlobalMasked, setIsGlobalMasked] = useState(true);

  // Dialog states
  const [editingSecret, setEditingSecret] = useState<any>(null);
  const [isSecretDialogOpen, setIsSecretDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  // Counts for filter pills
  const counts = useMemo(() => {
    let inProd = 0;
    let notInProd = 0;
    let prodDiff = 0;

    activeSecrets.forEach((s: any) => {
      const isExist = Boolean(s.existsInProd ?? s.isExistInProd ?? false);
      if (isExist) inProd++;
      else notInProd++;

      const pA = (s.valueProdAscom || "").trim();
      const p = (s.valueProd || "").trim();
      if ((pA !== "" || p !== "") && pA !== p) {
        prodDiff++;
      }
    });

    return { all: activeSecrets.length, inProd, notInProd, prodDiff };
  }, [activeSecrets]);

  // Processed (searched, filtered, and sorted alphabetically by Key ASC)
  const processedSecrets = useMemo(() => {
    let list = [...activeSecrets];

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

    // Sort: PROD Diff entries at the top first, then alphabetically by Key ASC
    list.sort((a, b) => {
      const diffA = checkProdMismatch(a);
      const diffB = checkProdMismatch(b);

      if (diffA !== diffB) {
        return diffA ? -1 : 1;
      }

      const keyA = (a.keyName || a.key || "").toLowerCase();
      const keyB = (b.keyName || b.key || "").toLowerCase();
      return keyA.localeCompare(keyB);
    });

    return list;
  }, [activeSecrets, searchQuery, statusFilter]);

  // Paginated Secrets
  const paginatedSecrets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedSecrets.slice(start, start + pageSize);
  }, [processedSecrets, currentPage, pageSize]);

  const handleCreate = () => {
    setEditingSecret(null);
    setIsSecretDialogOpen(true);
  };

  const handleEdit = (secret: any) => {
    setEditingSecret(secret);
    setIsSecretDialogOpen(true);
  };

  const handleToggleExistInProd = (secret: any) => {
    const currentVal = Boolean(secret.existsInProd ?? secret.isExistInProd ?? false);
    updateSecret({
      id: secret.id,
      data: { existsInProd: !currentVal },
    });
  };

  const handleDelete = async (secret: any) => {
    const ok = await confirm({
      title: "Delete Secret Key?",
      description: `Are you sure you want to delete "${secret.keyName || secret.key}"? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "destructive",
    });

    if (ok) {
      deleteSecret(secret.id);
    }
  };

  return (
    <Panel className="h-full border-t-4 border-t-primary flex flex-col">
      {/* Header */}
      <PanelHeader className="flex flex-col sm:flex-row items-start justify-between border-b-0 pb-1 gap-4">
        <div className="w-full sm:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground flex items-center gap-2 flex-wrap">
            <Key className="w-6 h-6 text-primary" /> Secret Key Vault
            {activeProject && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5 ml-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeProject.color || "#3b82f6" }} />
                {activeProject.name}
              </span>
            )}
          </PanelTitle>
          <PanelDescription className="mt-1">
            Manage lower environment secrets, credentials, and API keys for {activeProject?.name || "this project"}.
          </PanelDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsImportDialogOpen(true)}
            className="shadow-xs text-xs h-9"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Import Data
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setIsShareDialogOpen(true)}
            className="shadow-xs text-xs h-9"
          >
            <Share2 className="w-4 h-4 mr-1.5" />
            Share Link
          </Button>

          <Button onClick={handleCreate} className="shadow-sm text-xs h-9">
            <Plus className="w-4 h-4 mr-1.5" />
            New Secret Key
          </Button>
        </div>
      </PanelHeader>

      {/* Dialogs */}
      <SecretDialog
        open={isSecretDialogOpen}
        onOpenChange={setIsSecretDialogOpen}
        secretToEdit={editingSecret}
      />
      <SecretShareDialog
        open={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
        hasSecrets={activeSecrets.length > 0}
      />
      <SecretImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
      />

      <PanelContent className="space-y-4 flex-1 overflow-auto">
        {/* Search & Action Bar */}
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

            {/* Status Filter Pills */}
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
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsGlobalMasked(!isGlobalMasked)}
            className="text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
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
                <TableHead className="font-semibold text-xs">Exist in PROD</TableHead>
                <TableHead className="font-semibold text-xs">Value (SIT - ASCOM)</TableHead>
                <TableHead className="font-semibold text-xs">Value (UAT - ASCOM)</TableHead>
                <TableHead className="font-semibold text-xs">Value (PROD - ASCOM)</TableHead>
                <TableHead className="font-semibold text-xs">Value (PROD)</TableHead>
                <TableHead className="w-[80px] text-right font-semibold text-xs pr-3">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    Loading secret keys...
                  </TableCell>
                </TableRow>
              ) : processedSecrets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <p className="text-base font-medium">No secret keys found.</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Click "New Secret Key" above to add your first secret.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSecrets.map((secret, idx) => (
                  <SecretRow
                    key={secret.id}
                    secret={secret}
                    index={(currentPage - 1) * pageSize + idx}
                    isMasked={isGlobalMasked}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleExistInProd={handleToggleExistInProd}
                  />
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
      </PanelContent>
    </Panel>
  );
}
