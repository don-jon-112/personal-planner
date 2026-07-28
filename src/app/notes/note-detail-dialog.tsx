"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function NoteDetailDialog({
  note,
  open,
  onOpenChange,
}: {
  note: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!note) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{note.title}</DialogTitle>
          <div className="flex gap-2 text-sm text-muted-foreground mt-2">
            {note.category && (
              <span className="bg-muted px-2 py-1 rounded-md">
                {note.category}
              </span>
            )}
          </div>
        </DialogHeader>
        
        <div className="mt-6 ql-snow">
          <div 
            className="ql-editor"
            dangerouslySetInnerHTML={{ __html: note.content || "" }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
