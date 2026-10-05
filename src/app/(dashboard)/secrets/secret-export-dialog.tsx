"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Download,
  FileSpreadsheet,
  FileCode,
  FileText,
  CheckCircle2,
  Lock,
  Layers,
} from "lucide-react";
import { Project } from "@/types/project";
import { format } from "date-fns";

interface SecretExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secrets: any[];
  activeProject: Project | null;
}

export function SecretExportDialog({
  open,
  onOpenChange,
  secrets,
  activeProject,
}: SecretExportDialogProps) {
  const [exportFormat, setExportFormat] = useState<"env" | "xlsx" | "json" | "csv">("env");
  const [selectedEnv, setSelectedEnv] = useState<"sit" | "uat" | "prodAscom" | "prod" | "all">("sit");
  const [includeProdStatus, setIncludeProdStatus] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const projectName = activeProject?.name || "Project";
  const sanitizedProject = projectName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const dateStr = format(new Date(), "yyyyMMdd_HHmm");

  const handleExport = () => {
    if (!secrets || secrets.length === 0) return;
    setIsExporting(true);
    setIsSuccess(false);

    try {
      if (exportFormat === "env") {
        // Generate .env file
        const lines: string[] = [
          `# ${projectName} - Environment Variables`,
          `# Target Environment: ${selectedEnv.toUpperCase()}`,
          `# Exported on: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`,
          `# Total Keys: ${secrets.length}`,
          "",
        ];

        secrets.forEach((s) => {
          let val = "";
          if (selectedEnv === "sit") val = s.valueSit || "";
          else if (selectedEnv === "uat") val = s.valueUat || "";
          else if (selectedEnv === "prodAscom") val = s.valueProdAscom || "";
          else if (selectedEnv === "prod") val = s.valueProd || "";
          else {
            val = s.valueProd || s.valueUat || s.valueSit || "";
          }

          const keyName = (s.keyName || s.key || "").trim();
          if (keyName) {
            // Quote value if it contains spaces or quotes
            const formattedVal = val.includes(" ") || val.includes('"') || val.includes("\n")
              ? `"${val.replace(/"/g, '\\"')}"`
              : val;
            lines.push(`${keyName}=${formattedVal}`);
          }
        });

        const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${sanitizedProject}_${selectedEnv}_${dateStr}.env`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else if (exportFormat === "json") {
        // Generate JSON format
        let exportData: any;
        if (selectedEnv === "all") {
          exportData = {
            project: projectName,
            exportedAt: new Date().toISOString(),
            totalSecrets: secrets.length,
            secrets: secrets.map((s) => ({
              key: s.keyName || s.key,
              existsInProd: Boolean(s.existsInProd ?? s.isExistInProd),
              valueSit: s.valueSit || "",
              valueUat: s.valueUat || "",
              valueProdAscom: s.valueProdAscom || "",
              valueProd: s.valueProd || "",
            })),
          };
        } else {
          const envMap: Record<string, string> = {};
          secrets.forEach((s) => {
            const k = (s.keyName || s.key || "").trim();
            if (k) {
              let val = "";
              if (selectedEnv === "sit") val = s.valueSit || "";
              else if (selectedEnv === "uat") val = s.valueUat || "";
              else if (selectedEnv === "prodAscom") val = s.valueProdAscom || "";
              else if (selectedEnv === "prod") val = s.valueProd || "";
              envMap[k] = val;
            }
          });
          exportData = envMap;
        }

        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${sanitizedProject}_secrets_${selectedEnv}_${dateStr}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else if (exportFormat === "xlsx") {
        // Generate Excel file (.xlsx)
        const headers = [
          "Key",
          "Exist in PROD",
          "Value (SIT - ASCOM)",
          "Value (UAT - ASCOM)",
          "Value (PROD - ASCOM)",
          "Value (PROD)",
        ];

        const rows = secrets.map((s) => [
          s.keyName || s.key || "",
          Boolean(s.existsInProd ?? s.isExistInProd) ? "TRUE" : "FALSE",
          s.valueSit || "",
          s.valueUat || "",
          s.valueProdAscom || "",
          s.valueProd || "",
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws["!cols"] = [
          { wch: 32 },
          { wch: 16 },
          { wch: 36 },
          { wch: 36 },
          { wch: 36 },
          { wch: 36 },
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Secret Keys");
        XLSX.writeFile(wb, `${sanitizedProject}_secrets_${dateStr}.xlsx`);
      } else if (exportFormat === "csv") {
        // Generate CSV
        const headers = [
          "Key",
          "Exist in PROD",
          "Value (SIT - ASCOM)",
          "Value (UAT - ASCOM)",
          "Value (PROD - ASCOM)",
          "Value (PROD)",
        ];

        const rows = secrets.map((s) => [
          s.keyName || s.key || "",
          Boolean(s.existsInProd ?? s.isExistInProd) ? "TRUE" : "FALSE",
          s.valueSit || "",
          s.valueUat || "",
          s.valueProdAscom || "",
          s.valueProd || "",
        ]);

        const csvLines = [
          headers.join(","),
          ...rows.map((row) =>
            row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
          ),
        ];

        const csvContent = csvLines.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${sanitizedProject}_secrets_${dateStr}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onOpenChange(false);
      }, 1200);
    } catch (err) {
      console.error("Failed to export secrets:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] w-[calc(100vw-2rem)] max-w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Export Secret Keys
          </DialogTitle>
          <DialogDescription>
            Download {secrets.length} secret keys for <strong>{projectName}</strong> in your preferred format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Export Format Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Export Format
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setExportFormat("env")}
                className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all cursor-pointer ${
                  exportFormat === "env"
                    ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <FileCode className="w-5 h-5 mb-1 text-primary" />
                <span className="text-xs">.ENV File</span>
                <span className="text-[10px] text-muted-foreground">Key=Value</span>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat("xlsx")}
                className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all cursor-pointer ${
                  exportFormat === "xlsx"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <FileSpreadsheet className="w-5 h-5 mb-1 text-emerald-600" />
                <span className="text-xs">Excel (.xlsx)</span>
                <span className="text-[10px] text-muted-foreground">Full matrix</span>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat("json")}
                className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all cursor-pointer ${
                  exportFormat === "json"
                    ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <FileText className="w-5 h-5 mb-1 text-amber-600" />
                <span className="text-xs">JSON</span>
                <span className="text-[10px] text-muted-foreground">Structured</span>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat("csv")}
                className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all cursor-pointer ${
                  exportFormat === "csv"
                    ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold shadow-xs"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <FileSpreadsheet className="w-5 h-5 mb-1 text-blue-600" />
                <span className="text-xs">CSV</span>
                <span className="text-[10px] text-muted-foreground">Comma-sep</span>
              </button>
            </div>
          </div>

          {/* Environment selection if .env or json */}
          {(exportFormat === "env" || exportFormat === "json") && (
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Target Environment</span>
                <span className="text-[11px] font-normal lowercase text-muted-foreground">
                  (select which values to populate)
                </span>
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEnv("sit")}
                  className={`px-3 py-2 rounded-md border text-xs font-medium text-center transition-all ${
                    selectedEnv === "sit"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-border hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  SIT (ASCOM)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEnv("uat")}
                  className={`px-3 py-2 rounded-md border text-xs font-medium text-center transition-all ${
                    selectedEnv === "uat"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-border hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  UAT (ASCOM)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEnv("prodAscom")}
                  className={`px-3 py-2 rounded-md border text-xs font-medium text-center transition-all ${
                    selectedEnv === "prodAscom"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-border hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  PROD (ASCOM)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEnv("prod")}
                  className={`px-3 py-2 rounded-md border text-xs font-medium text-center transition-all ${
                    selectedEnv === "prod"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-border hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  PROD
                </button>
              </div>
              {exportFormat === "json" && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedEnv("all")}
                    className={`w-full py-1.5 rounded-md border text-xs font-medium text-center transition-all ${
                      selectedEnv === "all"
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                        : "border-border hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    Include All Environments (Complete Snapshot)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Export Summary Box */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border/80 text-xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Total Secrets to Export:</span>
              <strong className="text-foreground">{secrets.length} keys</strong>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Target Project:</span>
              <strong className="text-foreground">{projectName}</strong>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Target Format:</span>
              <strong className="text-foreground uppercase">{exportFormat}</strong>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={isExporting || secrets.length === 0}
            className="gap-1.5"
          >
            {isSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Exported!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download {exportFormat.toUpperCase()}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
