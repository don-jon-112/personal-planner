"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableRow, TableCell } from "@/components/ui/table";
import { GripVertical, MoreHorizontal, Calendar, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OverlapResult } from "@/lib/overlap-utils";
import { useConfirm } from "@/components/confirm-dialog-provider";

interface SortableTodoRowProps {
  item: any;
  epics?: any[];
  pics?: any[];
  overlapInfo?: OverlapResult;
  handleEdit: (task: any) => void;
  deleteTask: (id: string) => void;
  isDragDisabled?: boolean;
}

function getPicColor(name: string, pics: any[] = []) {
  const pic = pics.find(p => p.name === name);
  if (pic && pic.color) return pic.color;

  if (!name || name === "TBD") return "#64748b";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

export function SortableTodoRow({
  item,
  epics = [],
  pics = [],
  overlapInfo,
  handleEdit,
  deleteTask,
  isDragDisabled,
}: SortableTodoRowProps) {
  const confirm = useConfirm();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isDragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: "relative" as const,
  };

  const epic = epics.find((e) => e.id === item.epicId);
  const epicName = epic?.name || item.epicName || "No Epic";

  const formattedStartDate =
    item.startDate && item.startDate !== "TBD"
      ? new Date(item.startDate).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : item.startDate || "TBD";

  const picColor = getPicColor(item.pic, pics);
  const hasOverlap = Boolean(overlapInfo?.hasOverlap);

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        "hover:bg-muted/30 group bg-card cursor-pointer transition-colors",
        isDragging && "opacity-50 shadow-md bg-muted/40"
      )}
      onClick={() => handleEdit(item)}
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

      <TableCell className="font-medium max-w-[200px] sm:max-w-[280px] md:max-w-[360px] truncate" title={item.name}>
        <div className="flex items-center gap-1.5 min-w-0">
          {hasOverlap && (
            <TooltipProvider delay={100}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/40 hover:bg-amber-500/25 transition-colors shrink-0 cursor-help shadow-2xs select-none animate-pulse"
                      onClick={(e) => e.stopPropagation()}
                    />
                  }
                >
                  <span>!!</span>
                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                </TooltipTrigger>
                <TooltipContent side="right" align="start" className="z-[9999] p-3 max-w-[320px] bg-popover/95 backdrop-blur-sm border-amber-500/40 shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Jadwal Overlap ({item.pic})</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      PIC <strong>{item.pic}</strong> memiliki {overlapInfo?.overlappingTasks.length} task lain di rentang tanggal yang sama:
                    </p>
                    <div className="space-y-1 pt-1 border-t border-border/50 max-h-36 overflow-y-auto">
                      {overlapInfo?.overlappingTasks.map((ot) => (
                        <div key={ot.id} className="bg-muted/50 p-1.5 rounded text-[11px] border border-border/40">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-foreground truncate">{ot.name}</span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-primary/10 text-primary font-bold">{ot.epicName}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{ot.startDate} s/d {ot.endDateStr} ({ot.md} MD) • {ot.status}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="text-sm text-foreground font-semibold truncate">{item.name}</span>
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        {epic ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border/50" title={epic.name}>
            {epic.name}
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            Backlog
          </span>
        )}
      </TableCell>

      <TableCell>
        {item.pic ? (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-white shadow-sm"
            style={{ backgroundColor: picColor }}
          >
            {item.pic}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground italic">Unassigned</span>
        )}
      </TableCell>

      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 opacity-70" />
          {formattedStartDate}
        </span>
      </TableCell>

      <TableCell className="whitespace-nowrap text-xs font-medium">
        <span className="inline-flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded">
          <Clock className="w-3 h-3 opacity-70" />
          {item.md || 1} MD
        </span>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider",
            item.status === "DONE"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : item.status === "IN REVIEW" || item.status === "ON REVIEW"
              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
              : item.status === "ON PROGRESS"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
          )}
        >
          {item.status || "TODO"}
        </span>
      </TableCell>

      <TableCell className="w-[50px] text-right pr-4" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-all">
            <MoreHorizontal className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(item)}>Edit Task</DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: "Hapus Task?",
                  description: `Apakah Anda yakin ingin menghapus task "${item.name}"?`,
                  confirmText: "Hapus Task",
                  cancelText: "Batal",
                  variant: "destructive",
                });
                if (ok) {
                  deleteTask(item.id);
                }
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
