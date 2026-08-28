"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { BugCard } from "./bug-card";

interface KanbanColumnProps {
  id: string;
  title: string;
  colorBadgeClass: string;
  bugs: any[];
  handleEdit: (bug: any) => void;
  deleteBug: (id: string) => void;
}

export function KanbanColumn({
  id,
  title,
  colorBadgeClass,
  bugs,
  handleEdit,
  deleteBug,
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  return (
    <div className="flex flex-col bg-muted/30 border border-border/60 rounded-xl p-3 min-h-[500px] w-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/40 px-1">
        <div className="flex items-center gap-2">
          <span className={cn("w-2.5 h-2.5 rounded-full", colorBadgeClass)} />
          <h3 className="font-bold text-sm text-foreground">{title}</h3>
        </div>
        <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {bugs.length}
        </span>
      </div>

      {/* Droppable Container */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-3 transition-colors rounded-lg p-1",
          isOver && "bg-primary/5 ring-2 ring-primary/30"
        )}
      >
        {bugs.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-xs text-muted-foreground/60 border border-dashed border-border/50 rounded-lg">
            No bugs here
          </div>
        ) : (
          bugs.map((bug) => (
            <BugCard
              key={bug.id}
              bug={bug}
              handleEdit={handleEdit}
              deleteBug={deleteBug}
            />
          ))
        )}
      </div>
    </div>
  );
}
