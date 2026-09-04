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
  Loader2
} from "lucide-react";
import { useCollection, useAddDocument } from "@/hooks/use-firestore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAlertModal } from "@/components/confirm-dialog-provider";

interface ParsedTask {
  name: string;
  epicName: string;
  pic: string;
  startDate: string;
  md: number;
  status: string;
}

const DEFAULT_PIC_COLORS = [
  "#1ABB9C", "#3498DB", "#9B59B6", "#E67E22", 
  "#E74C3C", "#2ECC71", "#F39C12", "#16A085", 
  "#3B82F6", "#8B5CF6", "#EC4899", "#10B981"
];

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const alertModal = useAlertModal();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: epics = [] } = useCollection<any>("timelineEpics");
  const { mutateAsync: addEpic } = useAddDocument("timelineEpics");
  const { data: existingPics = [] } = useCollection<any>("timelinePics");
  const { mutateAsync: addPic } = useAddDocument("timelinePics");
  const { mutateAsync: addTask } = useAddDocument("timelineTasks");

  const [parsedData, setParsedData] = useState<ParsedTask[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Template Download Handler (.xlsx Excel)
  const handleDownloadExcelTemplate = () => {
    const headers = ["Task Name", "Epic Name", "PIC", "Start Date", "MD", "Status"];
    const sampleRows = [
      ["Design Database Schema", "Backend Architecture", "Jonathan", "2026-09-01", 3, "DONE"],
      ["Setup Authentication API", "Backend Architecture", "Jonathan", "2026-09-04", 2, "IN REVIEW"],
      ["Develop Landing Page & Navigation", "Frontend UI", "Alice", "2026-09-01", 4, "ON PROGRESS"],
      ["Write User Guide & Backlog Docs", "", "TBD", "TBD", 2, "TODO"],
    ];

    const data = [headers, ...sampleRows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths for neat display in Excel
    ws["!cols"] = [
      { wch: 36 }, // Task Name
      { wch: 26 }, // Epic Name
      { wch: 16 }, // PIC
      { wch: 16 }, // Start Date
      { wch: 10 }, // MD
      { wch: 16 }, // Status
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tasks Template");
    XLSX.writeFile(wb, "planner_tasks_template.xlsx");
  };

  // Flexible Parser supporting Excel (.xlsx, .xls) and CSV
  const parseSpreadsheetData = (rows: any[][]): ParsedTask[] => {
    if (!rows || rows.length <= 1) return [];

    // Find header row (usually row 0, or skip sep= directive if present)
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
      const rowStr = rows[i].map((c) => String(c || "")).join(" ").toLowerCase();
      if (rowStr.includes("task") || rowStr.includes("name") || rowStr.includes("pic") || rowStr.includes("epic")) {
        headerRowIdx = i;
        break;
      }
    }

    const header = rows[headerRowIdx].map((h) => 
      String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "")
    );

    const nameIdx = header.findIndex((h) => (h.includes("task") || h.includes("name") || h.includes("title")) && !h.includes("epic"));
    const epicIdx = header.findIndex((h) => h.includes("epic"));
    const picIdx = header.findIndex((h) => 
      (h === "pic" || h.startsWith("pic") || h.includes("assignee") || h.includes("owner") || h.includes("person")) && !h.includes("epic")
    );
    const dateIdx = header.findIndex((h) => h.includes("date") || h.includes("start"));
    const mdIdx = header.findIndex((h) => (h === "md" || h.includes("manday") || h.includes("duration") || h.includes("day")) && !h.includes("date"));
    const statusIdx = header.findIndex((h) => h.includes("status") || h.includes("state"));

    const tasks: ParsedTask[] = [];

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const cols = rows[i];
      if (!cols || cols.length === 0 || !cols.some((c) => c !== "" && c !== null && c !== undefined)) continue;

      const rawName = nameIdx !== -1 ? cols[nameIdx] : cols[0];
      const name = String(rawName || "").trim();
      if (!name) continue; // Skip rows without task name

      const epicName = (epicIdx !== -1 && cols[epicIdx] !== undefined ? String(cols[epicIdx]) : "").trim();
      const pic = (picIdx !== -1 && cols[picIdx] !== undefined ? String(cols[picIdx]) : "TBD").trim() || "TBD";

      // Parse start date (could be Date object, string, or number)
      let startDate = "TBD";
      const rawDate = dateIdx !== -1 ? cols[dateIdx] : "";
      if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        const y = rawDate.getFullYear();
        const m = String(rawDate.getMonth() + 1).padStart(2, "0");
        const d = String(rawDate.getDate()).padStart(2, "0");
        startDate = `${y}-${m}-${d}`;
      } else if (typeof rawDate === "number" && rawDate > 20000 && rawDate < 60000) {
        // Excel serial date format
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const jsDate = new Date(excelEpoch.getTime() + rawDate * 86400000);
        if (!isNaN(jsDate.getTime())) {
          startDate = jsDate.toISOString().split("T")[0];
        }
      } else if (rawDate) {
        const strDate = String(rawDate).trim();
        if (strDate && strDate.toUpperCase() !== "TBD") {
          const parsed = Date.parse(strDate);
          if (!isNaN(parsed)) {
            const d = new Date(parsed);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            startDate = `${y}-${m}-${day}`;
          } else {
            startDate = strDate;
          }
        }
      }

      // Parse MD
      const rawMd = mdIdx !== -1 ? cols[mdIdx] : 1;
      let md = typeof rawMd === "number" ? Math.round(rawMd) : parseInt(String(rawMd || "1"), 10);
      if (isNaN(md) || md <= 0) md = 1;

      // Parse Status
      let rawStatus = (statusIdx !== -1 && cols[statusIdx] !== undefined ? String(cols[statusIdx]) : "TODO")
        .toUpperCase()
        .trim();
      let status = "TODO";
      if (rawStatus.includes("DONE") || rawStatus.includes("SELESAI")) {
        status = "DONE";
      } else if (rawStatus.includes("REVIEW")) {
        status = "IN REVIEW";
      } else if (rawStatus.includes("PROG") || rawStatus.includes("DOING") || rawStatus.includes("JALAN")) {
        status = "ON PROGRESS";
      } else if (rawStatus.includes("WONT") || rawStatus.includes("WON'T") || rawStatus.includes("CANCEL") || rawStatus.includes("BATAL")) {
        status = "WON'T DO";
      } else {
        status = "TODO";
      }

      tasks.push({
        name,
        epicName,
        pic,
        startDate,
        md,
        status,
      });
    }

    return tasks;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
          type: "array",
          cellDates: true,
        });

        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setErrorMsg("File spreadsheet tidak memiliki lembar kerja (sheet).");
          setParsedData([]);
          return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, {
          header: 1,
          defval: "",
        });

        const tasks = parseSpreadsheetData(rawRows);
        if (tasks.length === 0) {
          setErrorMsg("File kosong atau tidak ada baris data tugas yang valid.");
          setParsedData([]);
        } else {
          setParsedData(tasks);
        }
      } catch (err) {
        console.error(err);
        setErrorMsg("Gagal membaca file. Pastikan format file adalah .xlsx, .xls, atau .csv.");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Execution: Batch insert epics, pics, and tasks
  const handleExecuteImport = async () => {
    if (parsedData.length === 0) return;
    setIsImporting(true);
    setErrorMsg(null);

    try {
      // 1. Automatically create missing Epics
      const existingEpicMap = new Map<string, string>();
      epics.forEach((e: any) => {
        existingEpicMap.set(e.name.trim().toLowerCase(), e.id);
      });

      const uniqueEpicNames = Array.from(
        new Set(
          parsedData
            .map((t) => t.epicName.trim())
            .filter((name) => name !== "" && !existingEpicMap.has(name.toLowerCase()))
        )
      );

      for (let i = 0; i < uniqueEpicNames.length; i++) {
        const newEpicName = uniqueEpicNames[i];
        const res = await addEpic({ name: newEpicName, order: Date.now() + i * 10 });
        if (res && res.id) {
          existingEpicMap.set(newEpicName.toLowerCase(), res.id);
        }
      }

      // 2. Automatically create missing PICs
      const existingPicSet = new Set<string>();
      existingPics.forEach((p: any) => {
        if (p.name) existingPicSet.add(p.name.trim().toLowerCase());
      });

      const uniquePicNames = Array.from(
        new Set(
          parsedData
            .map((t) => t.pic.trim())
            .filter((name) => name !== "" && name.toUpperCase() !== "TBD" && !existingPicSet.has(name.toLowerCase()))
        )
      );

      for (let i = 0; i < uniquePicNames.length; i++) {
        const newPicName = uniquePicNames[i];
        const color = DEFAULT_PIC_COLORS[(existingPics.length + i) % DEFAULT_PIC_COLORS.length];
        await addPic({
          name: newPicName,
          color: color,
          showInAnalytics: true,
        });
        existingPicSet.add(newPicName.toLowerCase());
      }

      // 3. Insert tasks with correct epicId
      for (let i = 0; i < parsedData.length; i++) {
        const item = parsedData[i];
        let epicId = "";
        if (item.epicName.trim() !== "") {
          epicId = existingEpicMap.get(item.epicName.trim().toLowerCase()) || "";
        }

        await addTask({
          name: item.name,
          epicId: epicId,
          pic: item.pic || "TBD",
          startDate: item.startDate || "TBD",
          md: item.md || 1,
          status: item.status || "TODO",
          order: Date.now() + i * 10,
        });
      }

      const summaryParts = [`${parsedData.length} task`];
      if (uniqueEpicNames.length > 0) summaryParts.push(`${uniqueEpicNames.length} epic baru`);
      if (uniquePicNames.length > 0) summaryParts.push(`${uniquePicNames.length} PIC baru`);

      await alertModal({
        title: "Import Berhasil",
        description: `Berhasil mengimpor data (${summaryParts.join(", ")}) ke Todo Plan!`,
        variant: "success",
      });
      setParsedData([]);
      setFileName("");
      onOpenChange(false);
    } catch (err: any) {
      console.error("Import error:", err);
      setErrorMsg("Terjadi kesalahan saat mengimpor data ke database.");
    } finally {
      setIsImporting(false);
    }
  };

  const resetState = () => {
    setParsedData([]);
    setFileName("");
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetState();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileSpreadsheet className="w-5 h-5 text-primary" /> Import Tasks & Epics
          </DialogTitle>
          <DialogDescription>
            Unduh template Excel (.xlsx), isi daftar tugas Anda per kolom, lalu upload kembali untuk mengimpor secara massal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1 custom-scrollbar">
          {/* Step 1: Template download banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-muted/40 border rounded-xl gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">1. Unduh Template Excel</p>
                <p className="text-xs text-muted-foreground">Format Excel (.xlsx) dengan kolom Task, Epic, PIC, Start Date, MD, Status</p>
              </div>
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleDownloadExcelTemplate}
              className="w-full sm:w-auto shadow-xs text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download Template (.xlsx)
            </Button>
          </div>

          {/* Step 2: Upload Zone */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">2. Upload File Spreadsheet</p>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border/80 hover:border-primary/60 transition-colors rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-muted/20 hover:bg-muted/30"
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-muted-foreground/80 mb-2" />
              <p className="text-sm font-medium text-foreground">
                {fileName ? (
                  <span className="text-primary font-bold">{fileName}</span>
                ) : (
                  "Klik untuk memilih file Excel (.xlsx, .xls) atau CSV"
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Mendukung file .xlsx, .xls, dan .csv</p>
            </div>
          </div>

          {/* Error display */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 3: Parsed Data Preview */}
          {parsedData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Pratinjau Data ({parsedData.length} Task Terdeteksi)
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetState}
                  className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
                >
                  Ganti File
                </Button>
              </div>

              <div className="border border-border/60 rounded-lg overflow-hidden max-h-[220px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="text-xs py-2">Task Name</TableHead>
                      <TableHead className="text-xs py-2">Epic</TableHead>
                      <TableHead className="text-xs py-2">PIC</TableHead>
                      <TableHead className="text-xs py-2">Start Date</TableHead>
                      <TableHead className="text-xs py-2">MD</TableHead>
                      <TableHead className="text-xs py-2">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.map((task, idx) => (
                      <TableRow key={idx} className="text-xs">
                        <TableCell className="font-medium max-w-[160px] truncate" title={task.name}>
                          {task.name}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate" title={task.epicName || "Backlog"}>
                          {task.epicName ? (
                            <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full text-[10px]">
                              {task.epicName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic text-[10px]">Backlog</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{task.pic}</TableCell>
                        <TableCell className="whitespace-nowrap">{task.startDate}</TableCell>
                        <TableCell>{task.md}</TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold",
                              task.status === "DONE"
                                ? "bg-emerald-500/15 text-emerald-600"
                                : task.status === "IN REVIEW" || task.status === "ON REVIEW"
                                ? "bg-purple-500/15 text-purple-600"
                                : task.status === "ON PROGRESS"
                                ? "bg-blue-500/15 text-blue-600"
                                : "bg-slate-500/15 text-slate-600"
                            )}
                          >
                            {task.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleExecuteImport}
            disabled={parsedData.length === 0 || isImporting}
            className="shadow-xs"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Mengimpor...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-1.5" />
                Impor {parsedData.length > 0 ? `${parsedData.length} Task` : "Data"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
