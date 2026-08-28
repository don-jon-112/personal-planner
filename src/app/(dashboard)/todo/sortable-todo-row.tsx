"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableRow, TableCell } from "@/components/ui/table";
import { GripVertical, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SortableTodoRowProps {
  item: any;
  handleEdit: (todo: any) => void;
  deleteTodo: (id: string) => void;
  isDragDisabled?: boolean;
}

export function SortableTodoRow({ item, handleEdit, deleteTodo, isDragDisabled }: SortableTodoRowProps) {
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

  const formattedDeadline = item.deadline
    ? new Date(item.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    : '';

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn("hover:bg-muted/20 group bg-card cursor-pointer", isDragging && "opacity-50 shadow-md")}
      onClick={() => handleEdit(item)}
    >
      <TableCell 
        className="font-medium flex items-center gap-2 max-w-[120px] sm:max-w-[200px] md:max-w-[400px] lg:max-w-none truncate" 
        title={item.task}
      >
        {!isDragDisabled && (
          <button
            className="text-muted-foreground opacity-50 hover:opacity-100 cursor-grab active:cursor-grabbing p-1 -ml-2 rounded hover:bg-muted flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <span className="truncate">{item.task}</span>
      </TableCell>
      <TableCell>
        <span className={cn(
          "px-2 py-1 rounded text-xs font-semibold whitespace-nowrap",
          item.priority === "High" ? "bg-destructive/10 text-destructive dark:text-red-400" :
          item.priority === "Medium" ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" :
          "bg-green-500/10 text-green-600 dark:text-green-400"
        )}>
          {item.priority}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap">{formattedDeadline}</TableCell>
      <TableCell>
        <span className={cn(
          "px-2 py-1 rounded text-xs font-semibold whitespace-nowrap",
          item.status === "Todo" ? "bg-slate-500/10 text-slate-600 dark:text-slate-400" :
          item.status === "Doing" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
          item.status === "Done" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
          "bg-red-500/10 text-red-600 dark:text-red-400"
        )}>
          {item.status}
        </span>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-accent-foreground h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(item)}>Edit</DropdownMenuItem>
            <DropdownMenuItem 
              className="text-destructive"
              onClick={() => {
                if(confirm("Delete this task?")) {
                  deleteTodo(item.id);
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
