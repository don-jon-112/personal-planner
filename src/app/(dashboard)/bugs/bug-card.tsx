"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ExternalLink, MoreHorizontal, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BugCardProps {
  bug: any;
  handleEdit: (bug: any) => void;
  deleteBug: (id: string) => void;
}

export function BugCard({ bug, handleEdit, deleteBug }: BugCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: bug.id,
    data: { bug },
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "p-4 bg-card border border-border/70 rounded-lg shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing space-y-3 group",
        isDragging && "opacity-40 shadow-xl scale-105 border-primary"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-sm text-secondary-foreground line-clamp-2 leading-snug">
          {bug.summary}
        </h4>
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleEdit(bug)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  if (confirm("Delete this bug report?")) {
                    deleteBug(bug.id);
                  }
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {bug.details && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {bug.details}
        </p>
      )}

      {bug.jiraTicketNumber && (
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="pt-0.5">
          {(() => {
            const rawBase = process.env.NEXT_PUBLIC_JIRA_BASE_URL || "https://astraapps.astra.co.id/jira-software/browse/";
            const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
            const jiraUrl = `${base}${encodeURIComponent(bug.jiraTicketNumber)}`;
            return (
              <a
                href={jiraUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                <span>{bug.jiraTicketNumber}</span>
              </a>
            );
          })()}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span
          className={cn(
            "px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide",
            bug.priority === "High"
              ? "bg-destructive/10 text-destructive dark:text-red-400"
              : bug.priority === "Medium"
              ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
              : "bg-green-500/10 text-green-600 dark:text-green-400"
          )}
        >
          {bug.priority}
        </span>

        {bug.pic && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
            <User className="w-3 h-3" />
            <span className="truncate max-w-[100px]">{bug.pic}</span>
          </div>
        )}
      </div>
    </div>
  );
}
