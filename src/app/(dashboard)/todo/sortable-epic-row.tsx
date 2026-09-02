"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableRow, TableCell } from "@/components/ui/table";
import { GripVertical, MoreHorizontal, Layers, CheckSquare, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/confirm-dialog-provider";

interface SortableEpicRowProps {
  epic: any;
  tasks?: any[];
  handleEdit: (epic: any) => void;
  deleteEpic: (id: string) => void;
  isDragDisabled?: boolean;
}

export function SortableEpicRow({
  epic,
  tasks = [],
  handleEdit,
  deleteEpic,
  isDragDisabled,
}: SortableEpicRowProps) {
  const confirm = useConfirm();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: epic.id, disabled: isDragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: "relative" as const,
  };

  const epicTasks = tasks.filter((t) => t.epicId === epic.id);
  const totalTasks = epicTasks.length;
  const totalMd = epicTasks.reduce((sum, t) => sum + (Number(t.md) || 0), 0);
  const doneTasks = epicTasks.filter((t) => t.status === "DONE").length;

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        "hover:bg-muted/30 group bg-card cursor-pointer transition-colors",
        isDragging && "opacity-50 shadow-md bg-muted/40"
      )}
      onClick={() => handleEdit(epic)}
    >
      <TableCell className="w-[40px] pl-3 pr-0" onClick={(e) => e.stopPropagation()}>
        {!isDragDisabled && (
          <button
            className="text-muted-foreground/60 opacity-40 group-hover:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted transition-opacity"
            {...attributes}
            {...listeners}
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
      </TableCell>

      <TableCell className="font-medium">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-primary/10 text-primary">
            <Layers className="w-4 h-4" />
          </div>
          <p className="text-sm font-semibold text-foreground">{epic.name}</p>
        </div>
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground text-xs font-semibold px-2.5 py-1 rounded-md">
            <CheckSquare className="w-3.5 h-3.5" />
            {doneTasks} / {totalTasks} Tasks Done
          </span>
        </div>
      </TableCell>

      <TableCell>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground bg-muted/60 px-2.5 py-1 rounded-md">
          <Clock className="w-3.5 h-3.5 opacity-70" />
          {totalMd} Total MD
        </span>
      </TableCell>

      <TableCell className="w-[50px] text-right pr-4" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-accent-foreground h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(epic)}>Edit Epic</DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onClick={async () => {
                const description = totalTasks > 0
                  ? `Epic "${epic.name}" memiliki ${totalTasks} task terkait. Menghapus epic ini akan menjadikan task-task tersebut sebagai backlog (tanpa epic). Apakah Anda yakin?`
                  : `Apakah Anda yakin ingin menghapus epic "${epic.name}"?`;
                
                const ok = await confirm({
                  title: "Hapus Epic?",
                  description,
                  confirmText: "Hapus Epic",
                  cancelText: "Batal",
                  variant: "destructive",
                });
                
                if (ok) {
                  deleteEpic(epic.id);
                }
              }}
            >
              Delete Epic
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
