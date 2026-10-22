"use client";

import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Download, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Key,
  FileCode
} from "lucide-react";
import { useAddDocument, useUpdateDocument } from "@/hooks/use-firestore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAlertModal } from "@/components/confirm-dialog-provider";
import { useProject } from "@/components/project-context";
import { useAuth } from "@/components/auth-context";
import { serverTimestamp } from "firebase/firestore";
import { appendAssignmentLogToRedis } from "@/lib/cache-client";

interface ParsedSecret {
  keyName: string;
  keyOriginal: string;
  valueSit: string;
  valueUat: string;
  valueProdAscom: string;
  valueProd: string;
  existsInProd: boolean;
  hasExplicitExistInProd: boolean;
  isValid: boolean;
  isExistingMatch: boolean;
}

export function SecretImportDialog({
  open,
  onOpenChange,
  existingSecrets = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSecrets?: any[];
}) {
  const alertModal = useAlertModal();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { activeProjectId, activeProject } = useProject();
  const { currentUser, session } = useAuth();

  const { mutateAsync: addSecret } = useAddDocument("secretKeys");
  const { mutateAsync: updateSecret } = useUpdateDocument("secretKeys");
  const { mutateAsync: addAssignmentLog } = useAddDocument("assignmentLogs");

  const [parsedData, setParsedData] = useState<ParsedSecret[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Template Download Handler (.xlsx Excel)
  const handleDownloadExcelTemplate = () => {
    const headers = [
      "Key Transform",
      "Key Original",
      "Exist in PROD",
      "Value (SIT)",
      "Value (UAT)",
      "Value (PROD - ASCOM)",
      "Value (PROD)",
    ];
    const sampleRows = [
      ["API_GATEWAY_URL", "api.gateway.url", "TRUE", "https://sit.api.example.com", "https://uat.api.example.com", "https://prod-ascom.api.example.com", "https://prod.api.example.com"],
      ["DATABASE_PASSWORD", "db.password", "TRUE", "sit_pass_123", "uat_pass_456", "prod_ascom_pass_789", "prod_pass_999"],
      ["JWT_SECRET_KEY", "jwt.secret", "FALSE", "secret_sit_key_abc", "secret_uat_key_def", "secret_prod_ascom_key_ghi", "secret_prod_key_jkl"],
    ];

    const data = [headers, ...sampleRows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 28 }, // Key Transform
      { wch: 28 }, // Key Original
      { wch: 16 }, // Exist in PROD
      { wch: 36 }, // Value (SIT)
      { wch: 36 }, // Value (UAT)
      { wch: 36 }, // Value (PROD - ASCOM)
      { wch: 36 }, // Value (PROD)
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Secret Keys Template");
    XLSX.writeFile(wb, "secret_keys_template.xlsx");
  };

  // Template Download Handler (.csv CSV)
  const handleDownloadCsvTemplate = () => {
    const headers = [
      "Key Transform",
      "Key Original",
      "Exist in PROD",
      "Value (SIT)",
      "Value (UAT)",
      "Value (PROD - ASCOM)",
      "Value (PROD)",
    ];
    const sampleRows = [
      ["API_GATEWAY_URL", "api.gateway.url", "TRUE", "https://sit.api.example.com", "https://uat.api.example.com", "https://prod-ascom.api.example.com", "https://prod.api.example.com"],
      ["DATABASE_PASSWORD", "db.password", "TRUE", "sit_pass_123", "uat_pass_456", "prod_ascom_pass_789", "prod_pass_999"],
      ["JWT_SECRET_KEY", "jwt.secret", "FALSE", "secret_sit_key_abc", "secret_uat_key_def", "secret_prod_ascom_key_ghi", "secret_prod_key_jkl"],
    ];

    const csvLines = [
      headers.join(","),
      ...sampleRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ];

    const csvContent = csvLines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "secret_keys_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Flexible Parser supporting Excel (.xlsx, .xls) and CSV
  const parseSpreadsheetData = (rows: any[][]): ParsedSecret[] => {
    if (!rows || rows.length <= 1) return [];

    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
      const rowStr = rows[i].map((c) => String(c || "")).join(" ").toLowerCase();
      if (rowStr.includes("key") || rowStr.includes("transform") || rowStr.includes("sit") || rowStr.includes("prod")) {
        headerRowIdx = i;
        break;
      }
    }

    const headers = rows[headerRowIdx].map((h) => String(h || "").trim().toLowerCase());
    
    // Column index mapping with fallback heuristics
    const findColIdx = (terms: string[]) => {
      return headers.findIndex((h) => terms.some((t) => h.includes(t.toLowerCase())));
    };

    // Key Transform: first check explicit transform keywords
    let keyIdx = findColIdx(["key transform", "key_transform", "transform key", "keytransform", "transform"]);
    if (keyIdx === -1) {
      keyIdx = headers.findIndex((h) => (h === "key" || h.includes("key") || h.includes("name")) && !h.includes("original"));
    }
    if (keyIdx === -1) {
      keyIdx = 0;
    }

    // Key Original
    const keyOrigIdx = findColIdx(["key original", "key_original", "original key", "original", "keyoriginal"]);

    const existInProdIdx = findColIdx(["exist in prod", "exists in prod", "in prod", "is exist in prod", "exist prod"]);
    const sitIdx = findColIdx(["value (sit", "value sit", "sit"]);
    const uatIdx = findColIdx(["value (uat", "value uat", "uat"]);
    const prodAscomIdx = findColIdx(["prod - ascom", "prod_ascom", "prod-ascom", "prod ascom"]);
    
    // Prod index: exclude prod-ascom if exact match is needed
    let prodIdx = headers.findIndex((h) => h === "value (prod)" || h === "prod" || h === "value prod");
    if (prodIdx === -1) {
      prodIdx = headers.findIndex((h) => h.includes("prod") && !h.includes("ascom"));
    }

    const parsed: ParsedSecret[] = [];

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || row.every((cell) => !cell || String(cell).trim() === "")) {
        continue;
      }

      const keyName = keyIdx !== -1 ? String(row[keyIdx] ?? "").trim() : String(row[0] ?? "").trim();
      const keyOriginal = keyOrigIdx !== -1 ? String(row[keyOrigIdx] ?? "").trim() : "";
      const valueSit = sitIdx !== -1 ? String(row[sitIdx] ?? "").trim() : "";
      const valueUat = uatIdx !== -1 ? String(row[uatIdx] ?? "").trim() : "";
      const valueProdAscom = prodAscomIdx !== -1 ? String(row[prodAscomIdx] ?? "").trim() : "";
      const valueProd = prodIdx !== -1 ? String(row[prodIdx] ?? "").trim() : "";

      const prodBoolStr = existInProdIdx !== -1 ? String(row[existInProdIdx] ?? "").trim().toLowerCase() : "";
      const hasExplicitExistInProd = existInProdIdx !== -1 && prodBoolStr !== "";
      const existsInProd = ["true", "1", "yes", "ya", "y"].includes(prodBoolStr);

      const isValid = keyName.length > 0;
      const isExistingMatch = Boolean(
        existingSecrets.some((s) => {
          const sKey = (s.keyName || s.key || "").trim().toLowerCase();
          return sKey === keyName.toLowerCase();
        })
      );

      parsed.push({
        keyName,
        keyOriginal,
        valueSit,
        valueUat,
        valueProdAscom,
        valueProd,
        existsInProd,
        hasExplicitExistInProd,
        isValid,
        isExistingMatch,
      });
    }

    return parsed;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: "binary", cellDates: true });
        const firstSheetName = wb.SheetNames[0];
        const worksheet = wb.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        const results = parseSpreadsheetData(rows);

        if (results.length === 0) {
          setErrorMsg("No valid secret key data found in file. Please use the template format.");
          setParsedData([]);
        } else {
          setParsedData(results);
        }
      } catch (err: any) {
        console.error("Error reading file:", err);
        setErrorMsg("Failed to read file. Please upload a valid CSV or Excel file.");
        setParsedData([]);
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleProcessImport = async () => {
    const validData = parsedData.filter((item) => item.isValid);
    if (validData.length === 0) return;

    setIsImporting(true);
    try {
      let createdCount = 0;
      let updatedCount = 0;

      for (let i = 0; i < validData.length; i++) {
        const item = validData[i];
        const targetKey = item.keyName.trim();

        // Match on Key Transform (case-insensitive)
        const existing = existingSecrets.find((s) => {
          const sKey = (s.keyName || s.key || "").trim().toLowerCase();
          return sKey === targetKey.toLowerCase();
        });

        if (existing) {
          // Rule: Replace matching key, but if imported cell is empty, preserve existing value
          const updatedPayload: any = {
            keyName: targetKey,
            keyOriginal: item.keyOriginal !== "" ? item.keyOriginal : (existing.keyOriginal || ""),
            valueSit: item.valueSit !== "" ? item.valueSit : (existing.valueSit || ""),
            valueUat: item.valueUat !== "" ? item.valueUat : (existing.valueUat || ""),
            valueProdAscom: item.valueProdAscom !== "" ? item.valueProdAscom : (existing.valueProdAscom || ""),
            valueProd: item.valueProd !== "" ? item.valueProd : (existing.valueProd || ""),
            existsInProd: item.hasExplicitExistInProd
              ? item.existsInProd
              : Boolean(existing.existsInProd ?? existing.isExistInProd ?? false),
          };

          await updateSecret({
            id: existing.id,
            data: updatedPayload,
          });
          updatedCount++;
        } else {
          // New secret key
          await addSecret({
            keyName: targetKey,
            keyOriginal: item.keyOriginal || "",
            valueSit: item.valueSit || "",
            valueUat: item.valueUat || "",
            valueProdAscom: item.valueProdAscom || "",
            valueProd: item.valueProd || "",
            existsInProd: Boolean(item.existsInProd),
            projectId: activeProjectId || null,
            order: existingSecrets.length * 1000 + i * 10,
          });
          createdCount++;
        }
      }

      // Record Audit Log for bulk import
      try {
        const currentUserName = currentUser?.name || session?.name || currentUser?.username || session?.username || "User";
        const currentUserId = currentUser?.id || session?.userId || "unknown";
        const currentUsername = currentUser?.username || session?.username || "-";
        const projId = activeProjectId || "_global_";
        const projName = activeProject?.name || "Global / Shared";

        const logPayload = {
          category: "secret" as const,
          action: "IMPORT",
          secretAction: "IMPORT",
          secretKey: `${createdCount + updatedCount} Secret Keys`,
          projectId: projId,
          projectName: projName,
          userId: currentUserId,
          username: currentUsername,
          userName: currentUserName,
          importedCount: createdCount + updatedCount,
          details: `Import massal spreadsheet "${fileName || "file"}": ${createdCount + updatedCount} key (${createdCount} baru, ${updatedCount} diperbarui)`,
          changes: [
            { field: "fileName", label: "File Sumber", newValue: fileName || "Spreadsheet" },
            { field: "totalProcessed", label: "Total Diproses", newValue: String(validData.length) },
            { field: "createdCount", label: "Ditambahkan", newValue: String(createdCount) },
            { field: "updatedCount", label: "Diperbarui", newValue: String(updatedCount) },
          ],
          claimedAt: serverTimestamp(),
          timestamp: new Date().toISOString(),
        };

        const newLogDoc = await addAssignmentLog(logPayload);
        appendAssignmentLogToRedis({
          ...logPayload,
          id: (newLogDoc as any)?.id || `log-${Date.now()}`,
        }).catch(console.warn);
      } catch (logErr) {
        console.error("Failed to record import audit log:", logErr);
      }

      onOpenChange(false);
      setParsedData([]);
      setFileName("");

      await alertModal({
        title: "Import Success",
        description: `Successfully processed ${validData.length} Secret Keys (${createdCount} added, ${updatedCount} updated)!`,
        variant: "success",
      });
    } catch (err: any) {
      console.error("Import error:", err);
      alertModal({
        title: "Import Error",
        description: "An error occurred while importing secret keys.",
        variant: "error",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const resetFile = () => {
    setParsedData([]);
    setFileName("");
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const validCount = parsedData.filter((i) => i.isValid).length;
  const invalidCount = parsedData.length - validCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] w-[calc(100vw-2rem)] max-w-full max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Upload className="w-5 h-5 text-primary" /> Import Secret Keys (CSV & Excel)
          </DialogTitle>
          <DialogDescription>
            Upload bulk secret keys via CSV or Excel file. Download the sample template to ensure header compatibility.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 overflow-y-auto pr-1">
          {/* Step 1: Download Templates */}
          <div className="p-4 bg-muted/30 border border-border/70 rounded-xl space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Step 1: Download Sample Template
              </span>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadExcelTemplate}
                  className="h-8 text-xs gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Download Excel (.xlsx)
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadCsvTemplate}
                  className="h-8 text-xs gap-1.5 border-blue-500/40 text-blue-700 dark:text-blue-400 hover:bg-blue-500/10"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  Download CSV (.csv)
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Required Header Columns: <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">Key Transform</code>, <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">Key Original</code> (optional), <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">Value (SIT)</code>, <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">Value (UAT)</code>, <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">Value (PROD - ASCOM)</code>, <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">Value (PROD)</code>
            </p>
          </div>

          {/* Step 2: Upload File */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-primary" />
              Step 2: Choose File (.csv, .xlsx, .xls)
            </span>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv, .xlsx, .xls"
              className="hidden"
            />

            {!fileName ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-6 text-center cursor-pointer transition-colors bg-muted/10 hover:bg-muted/30"
              >
                <Upload className="w-8 h-8 mx-auto text-muted-foreground/60 mb-2" />
                <p className="text-xs font-medium">Click or drag CSV / Excel file here to upload</p>
                <p className="text-[11px] text-muted-foreground mt-1">Supports .csv, .xlsx, and .xls files</p>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-muted/40 border rounded-xl">
                <div className="flex items-center gap-2 truncate">
                  <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs font-medium truncate">{fileName}</span>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={resetFile} className="h-7 text-xs text-muted-foreground hover:text-destructive">
                  Change File
                </Button>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Parsed Preview Table */}
          {parsedData.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Parsed Preview ({validCount} Valid {invalidCount > 0 && `, ${invalidCount} Invalid`})
                </span>
                <span className="text-muted-foreground text-[11px]">Total: {parsedData.length} rows</span>
              </div>

              <div className="border rounded-lg max-h-56 overflow-y-auto bg-card">
                <Table>
                  <TableHeader className="bg-muted/40 sticky top-0">
                    <TableRow>
                      <TableHead className="w-[30px]"></TableHead>
                      <TableHead className="text-xs font-semibold">Action</TableHead>
                      <TableHead className="text-xs font-semibold">Key Transform</TableHead>
                      <TableHead className="text-xs font-semibold">Key Original</TableHead>
                      <TableHead className="text-xs font-semibold">Exist in PROD</TableHead>
                      <TableHead className="text-xs font-semibold">SIT</TableHead>
                      <TableHead className="text-xs font-semibold">UAT</TableHead>
                      <TableHead className="text-xs font-semibold">PROD - ASCOM</TableHead>
                      <TableHead className="text-xs font-semibold">PROD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.map((item, idx) => (
                      <TableRow key={idx} className={cn(!item.isValid && "bg-destructive/10")}>
                        <TableCell className="py-1.5">
                          {item.isValid ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <span title="Missing Key Transform">
                              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-1.5">
                          {item.isValid && (
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                              item.isExistingMatch 
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" 
                                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                            )}>
                              {item.isExistingMatch ? "Replace" : "New"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs py-1.5 font-medium">
                          {item.keyName || <span className="text-destructive text-[10px] italic">Missing Key Transform</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs py-1.5 text-muted-foreground">
                          {item.keyOriginal || "-"}
                        </TableCell>
                        <TableCell className="text-xs py-1.5">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-semibold",
                            item.existsInProd ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                          )}>
                            {item.existsInProd ? "✓ Yes" : "No"}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs py-1.5 text-muted-foreground truncate max-w-[120px]">
                          {item.valueSit || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs py-1.5 text-muted-foreground truncate max-w-[120px]">
                          {item.valueUat || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs py-1.5 text-muted-foreground truncate max-w-[120px]">
                          {item.valueProdAscom || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs py-1.5 text-muted-foreground truncate max-w-[120px]">
                          {item.valueProd || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleProcessImport}
            disabled={validCount === 0 || isImporting}
            className="gap-1.5"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import {validCount} Secret Keys
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
