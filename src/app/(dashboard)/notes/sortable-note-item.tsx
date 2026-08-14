import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Pin, Star, MoreHorizontal, GripHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SortableNoteItem({
  note,
  onView,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleFavorite,
}: {
  note: any;
  onView: (note: any) => void;
  onEdit: (note: any) => void;
  onDelete: (note: any) => void;
  onTogglePin: (note: any) => void;
  onToggleFavorite: (note: any) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex flex-col p-5 h-[220px] bg-card border rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden",
        isDragging ? "border-primary opacity-80" : "border-border/50"
      )}
      onClick={() => onView(note)}
    >
      <div className="absolute top-4 right-4 flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
        <div 
          className="cursor-grab hover:text-foreground text-muted-foreground transition-colors mr-1"
          {...attributes}
          {...listeners}
        >
          <GripHorizontal className="w-4 h-4" />
        </div>
        <button onClick={() => onTogglePin(note)} className="text-muted-foreground hover:text-primary transition-colors">
          <Pin className={cn("w-4 h-4", note.isPinned && "fill-primary text-primary")} />
        </button>
        <button onClick={() => onToggleFavorite(note)} className="text-muted-foreground hover:text-yellow-500 transition-colors">
          <Star className={cn("w-4 h-4", note.isFavorite && "fill-yellow-500 text-yellow-500")} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className="text-muted-foreground hover:text-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(note)}>Edit</DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => {
                if (confirm("Delete this note?")) {
                  onDelete(note);
                }
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h3 className="font-semibold text-lg text-secondary-foreground mb-2 pr-24 truncate">
        {note.title}
      </h3>

      <div className="relative flex-1 mb-4 overflow-hidden">
        <div
          className="prose prose-sm dark:prose-invert max-w-none p-0 text-sm text-muted-foreground wysiwyg-content break-words"
          dangerouslySetInnerHTML={{ __html: note.content || "" }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
      </div>

      <div className="flex flex-wrap gap-2 mt-auto">
        {note.tags?.map((tag: string) => (
          <span key={tag} className="px-2 py-1 bg-muted/50 text-muted-foreground rounded text-xs">
            #{tag}
          </span>
        ))}
      </div>
    </div>
  );
}
