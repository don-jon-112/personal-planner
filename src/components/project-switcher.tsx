"use client";

import { useState } from "react";
import { useProject } from "@/components/project-context";
import { ProjectDialog } from "@/components/project-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, FolderPlus, Layers, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ProjectSwitcherProps {
  variant?: "sidebar" | "header";
  className?: string;
}

export function ProjectSwitcher({ variant = "sidebar", className }: ProjectSwitcherProps) {
  const { projects, activeProject, activeProjectId, setActiveProjectId, isLoading } = useProject();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        {variant === "sidebar" ? (
          <DropdownMenuTrigger
            className={cn(
              "w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg border border-sidebar-accent/60 bg-sidebar-accent/30 hover:bg-sidebar-accent/60 text-sidebar-foreground transition-all duration-150 text-left group shadow-xs cursor-pointer",
              className
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className="w-3.5 h-3.5 rounded-md flex-shrink-0 shadow-xs border border-white/20"
                style={{ backgroundColor: activeProject?.color || "#3b82f6" }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {activeProject?.key && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-sidebar-foreground/10 text-sidebar-foreground/80">
                      {activeProject.key}
                    </span>
                  )}
                  <p className="text-sm font-semibold truncate leading-tight">
                    {isLoading ? "Loading..." : activeProject?.name || "Select Project"}
                  </p>
                </div>
                <p className="text-[11px] text-sidebar-foreground/60 truncate mt-0.5">
                  {projects.length} {projects.length === 1 ? "Project" : "Projects"}
                </p>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-sidebar-foreground/50 group-hover:text-sidebar-foreground transition-colors flex-shrink-0" />
          </DropdownMenuTrigger>
        ) : (
          <DropdownMenuTrigger
            className={cn(
              "h-8 gap-2 px-2.5 text-xs font-semibold bg-background/80 hover:bg-accent border border-border rounded-lg shadow-2xs max-w-[200px] sm:max-w-[240px] inline-flex items-center cursor-pointer transition-colors",
              className
            )}
          >
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: activeProject?.color || "#3b82f6" }}
            />
            <span className="truncate">
              {activeProject?.name || "Select Project"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto flex-shrink-0" />
          </DropdownMenuTrigger>
        )}

        <DropdownMenuContent
          align={variant === "sidebar" ? "start" : "center"}
          className="w-64 p-1.5 shadow-xl border-border"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5 flex items-center justify-between">
            <span>Projects ({projects.length})</span>
            <Link
              href="/projects"
              className="text-[10px] normal-case text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <Layers className="w-3 h-3" /> View All
            </Link>
          </div>
          <DropdownMenuSeparator />

          <div className="max-h-60 overflow-y-auto space-y-0.5 py-1">
            {projects.map((proj) => {
              const isSelected = proj.id === activeProjectId;
              return (
                <DropdownMenuItem
                  key={proj.id}
                  onClick={() => setActiveProjectId(proj.id)}
                  className={cn(
                    "flex items-center justify-between gap-2 px-2.5 py-2 cursor-pointer rounded-md text-xs font-medium transition-colors",
                    isSelected ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: proj.color || "#3b82f6" }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {proj.key && (
                          <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-muted text-muted-foreground font-mono">
                            {proj.key}
                          </span>
                        )}
                        <span className="truncate">{proj.name}</span>
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                </DropdownMenuItem>
              );
            })}
          </div>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-2.5 py-2 text-xs cursor-pointer text-primary hover:bg-primary/10 font-semibold rounded-md"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Create New Project</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
