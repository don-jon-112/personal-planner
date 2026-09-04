"use client";

import { 
  Panel, 
  PanelContent, 
  PanelHeader, 
  PanelTitle, 
  PanelDescription 
} from "@/components/ui/panel";
import { Bug, CheckSquare, Clock, CheckCircle2, ArrowRight, Layers } from "lucide-react";
import { useCollection } from "@/hooks/use-firestore";
import { formatDistanceToNow } from "date-fns";
import { useProject } from "@/components/project-context";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  const { activeProject, isItemInActiveProject } = useProject();
  const { data: allTasks } = useCollection<any>("timelineTasks");
  const { data: allEpics } = useCollection<any>("timelineEpics");
  const { data: allBugs } = useCollection<any>("bugReports");

  // Filter tasks, epics & bugs scoped to the active project
  const tasks = (allTasks || []).filter((t: any) => isItemInActiveProject(t.projectId));
  const epics = (allEpics || []).filter((e: any) => isItemInActiveProject(e.projectId));
  const bugs = (allBugs || []).filter((b: any) => isItemInActiveProject(b.projectId));

  const totalTasks = tasks.length;
  const inProgressTasks = tasks.filter(
    (t: any) =>
      t.status === "ON PROGRESS" ||
      t.status === "IN REVIEW" ||
      t.status === "ON REVIEW" ||
      t.status === "In Progress" ||
      t.status === "In Review" ||
      t.status === "Pending" ||
      t.status === "Doing"
  ).length;
  const completedTasks = tasks.filter(
    (t: any) => t.status === "DONE" || t.status === "Done" || t.status === "Completed"
  ).length;
  const activeBugs = bugs.filter(
    (b: any) => b.status !== "Closed" && b.status !== "Resolved" && b.status !== "Done"
  ).length;

  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const getTime = (doc: any) => {
    if (doc.createdAt?.toMillis) return doc.createdAt.toMillis();
    if (doc.createdAt?.seconds) return doc.createdAt.seconds * 1000;
    return Date.now();
  };

  const activities = [
    ...tasks.map((t: any) => ({ id: t.id, type: "task", title: `Task: ${t.name || t.task}`, time: getTime(t) })),
    ...epics.map((e: any) => ({ id: e.id, type: "epic", title: `Epic: ${e.name}`, time: getTime(e) })),
    ...bugs.map((b: any) => ({ id: b.id, type: "bug", title: `Bug: ${b.summary}`, time: getTime(b) })),
  ].sort((a, b) => b.time - a.time).slice(0, 6);

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Active Project Header Banner */}
      <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs font-bold shrink-0"
            style={{ backgroundColor: activeProject?.color || "#3b82f6" }}
          >
            {activeProject?.key || <Layers className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                {activeProject?.name || "Main Workspace"}
              </h2>
              {activeProject?.status && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {activeProject.status}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeProject?.description || "Project Workspace Overview & Analytics"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            href="/projects"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs h-8 gap-1.5")}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Switch Project</span>
          </Link>
          <Link
            href="/timeline"
            className={cn(buttonVariants({ size: "sm" }), "text-xs h-8 gap-1.5")}
          >
            <span>View Timeline</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Panel className="mb-0">
          <PanelContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <CheckSquare className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground truncate">Total Tasks</p>
              <h3 className="text-2xl font-bold text-secondary-foreground">{totalTasks}</h3>
            </div>
          </PanelContent>
        </Panel>

        <Panel className="mb-0">
          <PanelContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground truncate">In Progress / Review</p>
              <h3 className="text-2xl font-bold text-secondary-foreground">{inProgressTasks}</h3>
            </div>
          </PanelContent>
        </Panel>

        <Panel className="mb-0">
          <PanelContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground truncate">Completed ({progressPercent}%)</p>
              <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedTasks}</h3>
            </div>
          </PanelContent>
        </Panel>

        <Panel className="mb-0">
          <PanelContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
              <Bug className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground truncate">Active Bugs</p>
              <h3 className="text-2xl font-bold text-secondary-foreground">{activeBugs}</h3>
            </div>
          </PanelContent>
        </Panel>
      </div>

      {/* Recent Activity & Links */}
      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <PanelHeader>
            <PanelTitle>Recent Activity</PanelTitle>
            <PanelDescription>Latest updates in {activeProject?.name || "this project"}.</PanelDescription>
          </PanelHeader>
          <PanelContent>
            <div className="space-y-3.5">
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No recent activity found for this project.</p>
              ) : (
                activities.map((activity) => (
                  <div key={`${activity.type}-${activity.id}`} className="flex items-center gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      activity.type === 'task' ? 'bg-primary' : 
                      activity.type === 'epic' ? 'bg-indigo-500' : 'bg-destructive'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(activity.time, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </PanelContent>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Project Quick Navigation</PanelTitle>
            <PanelDescription>Jump straight to specific project modules.</PanelDescription>
          </PanelHeader>
          <PanelContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Link
                href="/todo"
                className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors flex items-center justify-between text-xs font-semibold group"
              >
                <span>Task Plan (Backlog)</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/timeline"
                className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors flex items-center justify-between text-xs font-semibold group"
              >
                <span>Timeline Gantt</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/weekly-report"
                className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors flex items-center justify-between text-xs font-semibold group"
              >
                <span>Weekly Report</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/bugs"
                className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors flex items-center justify-between text-xs font-semibold group"
              >
                <span>Bug & Report</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Personal Workspace:</span>
              <Link href="/notes" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                Open Global Notes &rarr;
              </Link>
            </div>
          </PanelContent>
        </Panel>
      </div>
    </div>
  );
}
