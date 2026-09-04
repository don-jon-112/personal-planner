"use client";

import React, { useState } from "react";
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
  Image as ImageIcon,
  FileText,
  Printer,
  Download,
  Loader2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { Project } from "@/types/project";
import { format } from "date-fns";

interface TimelineExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timelineRef: React.RefObject<HTMLDivElement | null>;
  activeProject: Project | null;
  totalTasks: number;
  totalEpics: number;
}

export function TimelineExportDialog({
  open,
  onOpenChange,
  timelineRef,
  activeProject,
  totalTasks,
  totalEpics,
}: TimelineExportDialogProps) {
  const [formatType, setFormatType] = useState<"png" | "pdf_fit" | "pdf_a4">("png");
  const [quality, setQuality] = useState<"high" | "ultra">("high");
  const [includeHeader, setIncludeHeader] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const projectName = activeProject?.name || "Project";
  const projectKey = activeProject?.key || "PRJ";
  const projectColor = activeProject?.color || "#3b82f6";
  const sanitizedFileName = `${projectName.toLowerCase().replace(/[^a-z0-9]/g, "_")}_timeline_${format(new Date(), "yyyyMMdd")}`;

  const handleExport = async () => {
    if (!timelineRef.current) return;
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const node = timelineRef.current;
      const pixelRatio = quality === "ultra" ? 3 : 2;

      // Capture full width and height of timeline
      const width = node.scrollWidth;
      const height = node.scrollHeight;

      // Render crisp PNG from DOM
      const dataUrl = await toPng(node, {
        width,
        height,
        pixelRatio,
        backgroundColor: "#ffffff",
        style: {
          transform: "none",
          margin: "0",
        },
      });

      if (formatType === "png") {
        // Direct PNG Download
        const link = document.createElement("a");
        link.download = `${sanitizedFileName}.png`;
        link.href = dataUrl;
        link.click();
      } else if (formatType === "pdf_fit") {
        // Fitted PDF (Zero truncation, full timeline on 1 high-res page with executive header)
        const headerHeight = includeHeader ? 110 : 0;
        const padding = 40;
        const pdfWidth = width + padding * 2;
        const pdfHeight = height + headerHeight + padding * 2;

        const pdf = new jsPDF({
          orientation: pdfWidth > pdfHeight ? "landscape" : "portrait",
          unit: "px",
          format: [pdfWidth, pdfHeight],
        });

        if (includeHeader) {
          // Draw professional header background
          pdf.setFillColor(248, 250, 252);
          pdf.rect(0, 0, pdfWidth, 100, "F");

          // Project Color Accent Bar
          const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result
              ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
              : [59, 130, 246];
          };
          const [r, g, b] = hexToRgb(projectColor);
          pdf.setFillColor(r, g, b);
          pdf.rect(padding, 25, 6, 50, "F");

          // Project Title
          pdf.setFontSize(24);
          pdf.setTextColor(15, 23, 42);
          pdf.text(projectName, padding + 16, 45);

          // Project Meta (Key, Epics, Tasks, Export Date)
          pdf.setFontSize(11);
          pdf.setTextColor(100, 116, 139);
          pdf.text(
            `Key: [${projectKey}]  •  ${totalEpics} Epics  •  ${totalTasks} Tasks  •  Status: ${activeProject?.status || "ACTIVE"}  •  Exported on ${format(new Date(), "dd MMMM yyyy, HH:mm")}`,
            padding + 16,
            65
          );

          // Divider
          pdf.setDrawColor(226, 232, 240);
          pdf.setLineWidth(1);
          pdf.line(padding, 85, pdfWidth - padding, 85);
        }

        // Embed Timeline Canvas
        const imageY = includeHeader ? 110 : padding;
        pdf.addImage(dataUrl, "PNG", padding, imageY, width, height);
        pdf.save(`${sanitizedFileName}.pdf`);
      } else if (formatType === "pdf_a4") {
        // Standard Landscape A4 Document (Scales to fit print dimensions: 842 x 595 px)
        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "mm",
          format: "a4",
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const contentWidth = pageWidth - margin * 2;

        let startY = margin;
        if (includeHeader) {
          pdf.setFontSize(16);
          pdf.setTextColor(15, 23, 42);
          pdf.text(projectName, margin, startY + 6);

          pdf.setFontSize(9);
          pdf.setTextColor(100, 116, 139);
          pdf.text(
            `Timeline Roadmap  •  ${totalEpics} Epics  •  ${totalTasks} Tasks  •  ${format(new Date(), "dd MMM yyyy")}`,
            margin,
            startY + 12
          );

          pdf.setDrawColor(226, 232, 240);
          pdf.line(margin, startY + 16, pageWidth - margin, startY + 16);
          startY += 20;
        }

        // Calculate aspect ratio fit for A4
        const availableHeight = pageHeight - startY - margin;
        const scale = Math.min(contentWidth / width, availableHeight / height);
        const renderWidth = width * scale;
        const renderHeight = height * scale;

        pdf.addImage(dataUrl, "PNG", margin, startY, renderWidth, renderHeight);
        pdf.save(`${sanitizedFileName}_a4.pdf`);
      }

      setExportSuccess(true);
      setTimeout(() => {
        setExportSuccess(false);
        onOpenChange(false);
      }, 1200);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="w-5 h-5 text-primary" /> Export Timeline Roadmap
          </DialogTitle>
          <DialogDescription>
            Download a high-resolution snapshot of {projectName}'s Gantt schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format Selector Cards */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Select Export Format
            </Label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setFormatType("png")}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  formatType === "png"
                    ? "border-primary bg-primary/10 ring-1 ring-primary text-primary"
                    : "border-border bg-card hover:bg-muted/50 text-foreground"
                }`}
              >
                <ImageIcon className="w-5 h-5 mb-2" />
                <div>
                  <p className="font-semibold text-xs">High-Res PNG</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Image for slides & chat</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormatType("pdf_fit")}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  formatType === "pdf_fit"
                    ? "border-primary bg-primary/10 ring-1 ring-primary text-primary"
                    : "border-border bg-card hover:bg-muted/50 text-foreground"
                }`}
              >
                <FileText className="w-5 h-5 mb-2" />
                <div>
                  <p className="font-semibold text-xs">Full PDF</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Fit all without cutoffs</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormatType("pdf_a4")}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  formatType === "pdf_a4"
                    ? "border-primary bg-primary/10 ring-1 ring-primary text-primary"
                    : "border-border bg-card hover:bg-muted/50 text-foreground"
                }`}
              >
                <Printer className="w-5 h-5 mb-2" />
                <div>
                  <p className="font-semibold text-xs">Print A4 PDF</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Standard paper scale</p>
                </div>
              </button>
            </div>
          </div>

          {/* Quality Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Resolution Quality
            </Label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setQuality("high")}
                className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer transition-colors ${
                  quality === "high"
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border bg-card hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                <span>High (2x Scale)</span>
                <span className="text-[10px] opacity-70">Recommended</span>
              </button>
              <button
                type="button"
                onClick={() => setQuality("ultra")}
                className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer transition-colors ${
                  quality === "ultra"
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border bg-card hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                <span>Ultra (3x Scale)</span>
                <span className="text-[10px] opacity-70">Crisp for 4K</span>
              </button>
            </div>
          </div>

          {/* Include Header Option */}
          {formatType !== "png" && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
              <div>
                <p className="text-xs font-semibold text-foreground">Include Project Header Banner</p>
                <p className="text-[11px] text-muted-foreground">
                  Shows project name, key, epics count, and export date at the top.
                </p>
              </div>
              <input
                type="checkbox"
                checked={includeHeader}
                onChange={(e) => setIncludeHeader(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
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
            disabled={isExporting}
            className="gap-2 min-w-[130px]"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Rendering...</span>
              </>
            ) : exportSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Downloaded!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download {formatType === "png" ? "PNG" : "PDF"}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
