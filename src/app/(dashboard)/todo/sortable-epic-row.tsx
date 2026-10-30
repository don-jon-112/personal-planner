"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableRow, TableCell } from "@/components/ui/table";
import { GripVertical, MoreHorizontal, Layers, CheckSquare, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { useTaskStatuses } from "@/hooks/use-task-statuses";

interface SortableEpicRowProps {
  epic: any;
  tasks?: any[];
  handleEdit: (epic: any) => void;
  deleteEpic: (id: string) => void;
  isDragDisabled?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function SortableEpicRow({
  epic,
  tasks = [],
  handleEdit,
  deleteEpic,
  isDragDisabled,
  canEdit,
  canDelete,
}: SortableEpicRowProps) {
  const confirm = useConfirm();
  const { isCompletedStatus } = useTaskStatuses();
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
  const totalMd = Number(epicTasks.reduce((sum, t) => sum + (parseFloat(t.md) || 0), 0).toFixed(3));
  const doneTasks = epicTasks.filter((t) => isCompletedStatus(t.status)).length;
  const activeTasks = epicTasks.filter((t) => {
    const s = (t.status || "").trim().toUpperCase();
    return s !== "WON'T DO" && s !== "WONT DO";
  }).length;

  const isAllDone = totalTasks > 0 && (doneTasks === totalTasks || (activeTasks > 0 && doneTasks === activeTasks));
  const percentage = totalTasks === 0
    ? 0
    : activeTasks === 0
    ? 100
    : Math.round((doneTasks / activeTasks) * 100);

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
          <span className="inline-flex items-center gap-1.5 bg-secondary text-secondary-foreground text-xs font-semibold px-2.5 py-1 rounded-md">
            <CheckSquare className="w-3.5 h-3.5 text-primary" />
            {doneTasks} / {totalTasks} Tasks
          </span>
        </div>
      </TableCell>

      <TableCell className="min-w-[150px]">
        <div className="flex items-center gap-2.5">
          <div className="flex-1 bg-muted/80 rounded-full h-2 overflow-hidden border border-border/40">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                isAllDone
                  ? "bg-emerald-500"
                  : percentage > 0
                  ? "bg-primary"
                  : "bg-muted-foreground/20"
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className={cn(
            "text-xs font-bold font-mono min-w-[36px] text-right",
            isAllDone ? "text-emerald-600 dark:text-emerald-400 font-extrabold" : "text-foreground"
          )}>
            {percentage}%
          </span>
        </div>
      </TableCell>

      <TableCell>
        {isAllDone ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shadow-2xs">
            <CheckCircle2 className="w-3 h-3" />
            DONE
          </span>
        ) : totalTasks === 0 ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider bg-muted text-muted-foreground border border-border/40">
            NO TASKS
          </span>
        ) : doneTasks > 0 || epicTasks.some((t) => {
            const s = (t.status || "").trim().toUpperCase();
            return s === "ON PROGRESS" || s === "IN REVIEW" || s === "IN PROGRESS";
          }) ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
            ON PROGRESS
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-slate-500/15 text-slate-700 dark:text-slate-400 border border-slate-500/30">
            TODO
          </span>
        )}
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
            <DropdownMenuItem onClick={() => handleEdit(epic)}>
              {canEdit !== false ? "Edit Epic" : "View Epic Details"}
            </DropdownMenuItem>
            {canDelete !== false && (
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onClick={async () => {
                  const description = totalTasks > 0
                    ? `Epic "${epic.name}" has ${totalTasks} associated task(s). Deleting this epic will move those tasks to backlog (unassigned epic). Are you sure?`
                    : `Are you sure you want to delete epic "${epic.name}"?`;
                  
                  const ok = await confirm({
                    title: "Delete Epic?",
                    description,
                    confirmText: "Delete Epic",
                    cancelText: "Cancel",
                    variant: "destructive",
                  });
                  
                  if (ok) {
                    deleteEpic(epic.id);
                  }
                }}
              >
                Delete Epic
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
