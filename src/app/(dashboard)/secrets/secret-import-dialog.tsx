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
import { useAddDocument } from "@/hooks/use-firestore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAlertModal } from "@/components/confirm-dialog-provider";
import { useProject } from "@/components/project-context";

interface ParsedSecret {
  keyName: string;
  valueSit: string;
  valueUat: string;
  valueProdAscom: string;
  valueProd: string;
  isValid: boolean;
}

export function SecretImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const alertModal = useAlertModal();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { activeProjectId } = useProject();

  const { mutateAsync: addSecret } = useAddDocument("secretKeys");

  const [parsedData, setParsedData] = useState<ParsedSecret[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Template Download Handler (.xlsx Excel)
  const handleDownloadExcelTemplate = () => {
    const headers = ["Key", "Value (SIT - ASCOM)", "Value (UAT - ASCOM)", "Value (PROD - ASCOM)", "Value (PROD)"];
    const sampleRows = [
      ["API_GATEWAY_URL", "https://sit-ascom.api.example.com", "https://uat-ascom.api.example.com", "https://prod-ascom.api.example.com", "https://prod.api.example.com"],
      ["DATABASE_PASSWORD", "sit_pass_123", "uat_pass_456", "prod_ascom_pass_789", "prod_pass_999"],
      ["JWT_SECRET_KEY", "secret_sit_key_abc", "secret_uat_key_def", "secret_prod_ascom_key_ghi", "secret_prod_key_jkl"],
    ];

    const data = [headers, ...sampleRows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 28 }, // Key
      { wch: 36 }, // Value (SIT - ASCOM)
      { wch: 36 }, // Value (UAT - ASCOM)
      { wch: 36 }, // Value (PROD - ASCOM)
      { wch: 36 }, // Value (PROD)
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Secret Keys Template");
    XLSX.writeFile(wb, "secret_keys_template.xlsx");
  };

  // Template Download Handler (.csv CSV)
  const handleDownloadCsvTemplate = () => {
    const headers = ["Key", "Value (SIT - ASCOM)", "Value (UAT - ASCOM)", "Value (PROD - ASCOM)", "Value (PROD)"];
    const sampleRows = [
      ["API_GATEWAY_URL", "https://sit-ascom.api.example.com", "https://uat-ascom.api.example.com", "https://prod-ascom.api.example.com", "https://prod.api.example.com"],
      ["DATABASE_PASSWORD", "sit_pass_123", "uat_pass_456", "prod_ascom_pass_789", "prod_pass_999"],
      ["JWT_SECRET_KEY", "secret_sit_key_abc", "secret_uat_key_def", "secret_prod_ascom_key_ghi", "secret_prod_key_jkl"],
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
      if (rowStr.includes("key") || rowStr.includes("sit") || rowStr.includes("prod")) {
        headerRowIdx = i;
        break;
      }
    }

    const headers = rows[headerRowIdx].map((h) => String(h || "").trim().toLowerCase());
    
    // Column index mapping with fallback heuristics
    const findColIdx = (terms: string[]) => {
      return headers.findIndex((h) => terms.some((t) => h.includes(t.toLowerCase())));
    };

    const keyIdx = findColIdx(["key", "name"]);
    const sitIdx = findColIdx(["sit", "value (sit", "value sit"]);
    const uatIdx = findColIdx(["uat", "value (uat", "value uat"]);
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

      const keyName = keyIdx !== -1 ? String(row[keyIdx] || "").trim() : String(row[0] || "").trim();
      const valueSit = sitIdx !== -1 ? String(row[sitIdx] || "").trim() : "";
      const valueUat = uatIdx !== -1 ? String(row[uatIdx] || "").trim() : "";
      const valueProdAscom = prodAscomIdx !== -1 ? String(row[prodAscomIdx] || "").trim() : "";
      const valueProd = prodIdx !== -1 ? String(row[prodIdx] || "").trim() : "";

      const isValid = keyName.length > 0;

      parsed.push({
        keyName,
        valueSit,
        valueUat,
        valueProdAscom,
        valueProd,
        isValid,
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
      let successCount = 0;

      for (let i = 0; i < validData.length; i++) {
        const item = validData[i];
        await addSecret({
          keyName: item.keyName,
          valueSit: item.valueSit,
          valueUat: item.valueUat,
          valueProdAscom: item.valueProdAscom,
          valueProd: item.valueProd,
          projectId: activeProjectId || null,
          order: i * 1000,
        });
        successCount++;
      }

      onOpenChange(false);
      setParsedData([]);
      setFileName("");

      await alertModal({
        title: "Import Success",
        description: `Successfully imported ${successCount} Secret Keys!`,
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
              Required Header Columns: <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">Key</code>, <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">Value (SIT - ASCOM)</code>, <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">Value (UAT - ASCOM)</code>, <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">Value (PROD - ASCOM)</code>, <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">Value (PROD)</code>
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
                      <TableHead className="text-xs font-semibold">Key</TableHead>
                      <TableHead className="text-xs font-semibold">SIT - ASCOM</TableHead>
                      <TableHead className="text-xs font-semibold">UAT - ASCOM</TableHead>
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
                            <span title="Missing Key">
                              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs py-1.5 font-medium">
                          {item.keyName || <span className="text-destructive text-[10px] italic">Missing Key</span>}
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
