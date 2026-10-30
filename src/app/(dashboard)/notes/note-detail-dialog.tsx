"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { htmlToCleanPlainText } from "@/lib/html-utils";

export function NoteDetailDialog({
  note,
  open,
  onOpenChange,
}: {
  note: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!note) return null;

  const handleCopyAll = async () => {
    const cleanText = htmlToCleanPlainText(note.content || "");
    if (!cleanText) return;
    try {
      await navigator.clipboard.writeText(cleanText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleContainerCopy = (e: React.ClipboardEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    // Build DOM container for selected range to get innerHTML
    const container = document.createElement("div");
    for (let i = 0; i < selection.rangeCount; i++) {
      container.appendChild(selection.getRangeAt(i).cloneContents());
    }

    const cleanText = htmlToCleanPlainText(container.innerHTML);
    if (cleanText) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", cleanText);
      e.clipboardData.setData("text/html", container.innerHTML);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-start justify-between pr-8 gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <DialogTitle className="text-2xl font-bold break-words">{note.title}</DialogTitle>
            <div className="flex gap-2 text-sm text-muted-foreground">
              {note.category && (
                <span className="bg-muted px-2 py-0.5 rounded-md text-xs font-semibold">
                  {note.category}
                </span>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyAll}
            className="shrink-0 gap-1.5 text-xs h-8 border-primary/30 text-primary hover:bg-primary/10 shadow-2xs"
            title="Salin isi catatan tanpa jarak baris berlebih"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Catatan</span>
              </>
            )}
          </Button>
        </DialogHeader>
        
        <div className="mt-4" onCopy={handleContainerCopy}>
          <div 
            className="prose prose-sm sm:prose-base dark:prose-invert max-w-none wysiwyg-content break-words"
            dangerouslySetInnerHTML={{ __html: note.content || "" }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
