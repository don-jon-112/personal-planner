"use client";

import { useState } from "react";
import { useProject } from "@/components/project-context";
import { ProjectDialog } from "@/components/project-dialog";
import { Project, PROJECT_STATUSES } from "@/types/project";
import { useCollection } from "@/hooks/use-firestore";
import { useConfirm, useAlertModal } from "@/components/confirm-dialog-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  FolderPlus, 
  MoreVertical, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  CheckSquare, 
  Bug, 
  ArrowRight,
  Sparkles,
  Layers
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function ProjectsPage() {
  const { projects, activeProjectId, setActiveProjectId, deleteProject } = useProject();
  const { data: allTasks } = useCollection<any>("timelineTasks");
  const { data: allBugs } = useCollection<any>("bugReports");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);

  const confirm = useConfirm();
  const alertModal = useAlertModal();

  const handleEdit = (project: Project) => {
    setProjectToEdit(project);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setProjectToEdit(null);
    setDialogOpen(true);
  };

  const handleDelete = async (project: Project) => {
    if (projects.length <= 1) {
      alertModal({
        title: "Action Prohibited",
        description: "You cannot delete the only existing project in the workspace.",
      });
      return;
    }

    const ok = await confirm({
      title: "Delete Project",
      description: `Are you sure you want to delete "${project.name}"? Tasks associated specifically with this project won't be displayed.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "destructive",
    });

    if (ok) {
      try {
        await deleteProject(project.id);
      } catch (err: any) {
        alertModal({
          title: "Error",
          description: err.message || "Failed to delete project.",
        });
      }
    }
  };

  // Helper stats per project
  const getProjectStats = (projectId: string, isDefault?: boolean) => {
    const isMatching = (itemProjectId?: string) => {
      if (itemProjectId) return itemProjectId === projectId;
      return !!isDefault || projectId === projects[0]?.id;
    };

    const tasks = (allTasks || []).filter((t: any) => isMatching(t.projectId));
    const bugs = (allBugs || []).filter((b: any) => isMatching(b.projectId));

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(
      (t: any) => t.status === "DONE" || t.status === "Done" || t.status === "Completed"
    ).length;
    const inProgressTasks = tasks.filter(
      (t: any) =>
        t.status === "ON PROGRESS" ||
        t.status === "IN REVIEW" ||
        t.status === "ON REVIEW" ||
        t.status === "In Progress" ||
        t.status === "In Review"
    ).length;
    const activeBugs = bugs.filter(
      (b: any) => b.status !== "Closed" && b.status !== "Resolved" && b.status !== "Done"
    ).length;

    const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return { totalTasks, completedTasks, inProgressTasks, activeBugs, percent };
  };

  const activeCount = projects.filter((p) => p.status === "ACTIVE" || !p.status).length;
  const completedCount = projects.filter((p) => p.status === "COMPLETED").length;
  const totalTasksCount = allTasks?.length || 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">All Projects</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
              {projects.length}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your project workspaces, track roadmap progress, and switch between project contexts.
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2 shrink-0">
          <FolderPlus className="w-4 h-4" />
          <span>New Project</span>
        </Button>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
          <p className="text-xs font-medium text-muted-foreground">Total Projects</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold">{projects.length}</span>
            <Layers className="w-4 h-4 text-muted-foreground/60 ml-auto" />
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
          <p className="text-xs font-medium text-muted-foreground">Active Projects</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeCount}</span>
            <Clock className="w-4 h-4 text-emerald-500/60 ml-auto" />
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
          <p className="text-xs font-medium text-muted-foreground">Completed</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">{completedCount}</span>
            <CheckCircle2 className="w-4 h-4 text-purple-500/60 ml-auto" />
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card shadow-2xs">
          <p className="text-xs font-medium text-muted-foreground">Total Cross-Project Tasks</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-primary">{totalTasksCount}</span>
            <CheckSquare className="w-4 h-4 text-primary/60 ml-auto" />
          </div>
        </div>
      </div>

      {/* Project Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {projects.map((project) => {
          const stats = getProjectStats(project.id, project.isDefault);
          const isCurrentActive = project.id === activeProjectId;
          const statusObj = PROJECT_STATUSES.find((s) => s.value === project.status) || PROJECT_STATUSES[0];

          return (
            <Card
              key={project.id}
              className={cn(
                "relative overflow-hidden transition-all duration-200 border bg-card flex flex-col justify-between hover:shadow-md",
                isCurrentActive
                  ? "border-primary/50 shadow-sm ring-1 ring-primary/30"
                  : "border-border hover:border-border/80"
              )}
            >
              {/* Top accent color bar */}
              <div
                className="h-1.5 w-full"
                style={{ backgroundColor: project.color || "#3b82f6" }}
              />

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-xs"
                      style={{ backgroundColor: project.color || "#3b82f6" }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {project.key && (
                          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {project.key}
                          </span>
                        )}
                        <CardTitle className="text-base font-bold truncate">
                          {project.name}
                        </CardTitle>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", statusObj.color)}>
                      {statusObj.label}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => setActiveProjectId(project.id)} className="cursor-pointer">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Set as Active
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(project)} className="cursor-pointer">
                          <Edit className="w-3.5 h-3.5 mr-2" /> Edit Project
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(project)}
                          className="text-destructive focus:text-destructive cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {project.description && (
                  <CardDescription className="text-xs line-clamp-2 mt-1.5 text-muted-foreground">
                    {project.description}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="space-y-4 pb-4 flex-1">
                {/* Dates */}
                {(project.startDate || project.endDate) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5 opacity-70" />
                    <span>
                      {project.startDate || "Start"} → {project.endDate || "Target"}
                    </span>
                  </div>
                )}

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-semibold text-foreground">{stats.percent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${stats.percent}%`,
                        backgroundColor: project.color || "#3b82f6",
                      }}
                    />
                  </div>
                </div>

                {/* Micro Stats */}
                <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-lg bg-accent/40 text-center text-xs">
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Tasks</span>
                    <span className="font-semibold">{stats.totalTasks}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">In Progress</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {stats.inProgressTasks}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Active Bugs</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      {stats.activeBugs}
                    </span>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="pt-2 border-t border-border/50 flex items-center justify-between gap-2 bg-muted/20">
                {isCurrentActive ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Currently Active</span>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveProjectId(project.id)}
                    className="text-xs h-8 hover:bg-primary/10 hover:text-primary"
                  >
                    Select Project
                  </Button>
                )}

                <div className="flex items-center gap-1 ml-auto">
                  <Link
                    href="/timeline"
                    onClick={() => setActiveProjectId(project.id)}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs h-8 gap-1")}
                  >
                    <span>Timeline</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectToEdit={projectToEdit}
      />
    </div>
  );
}
