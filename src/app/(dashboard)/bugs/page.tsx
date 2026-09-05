"use client";

import { useState } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Search, MoreHorizontal, Plus, LayoutGrid, List, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import { useCollection, useDeleteDocument, useUpdateDocument } from "@/hooks/use-firestore";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { BugDialog } from "./bug-dialog";
import { KanbanColumn } from "./kanban-column";
import { BugCard } from "./bug-card";
import { useProject } from "@/components/project-context";

const COLUMNS = [
  { id: "Open", title: "Open", colorBadgeClass: "bg-red-500" },
  { id: "In Progress", title: "In Progress", colorBadgeClass: "bg-blue-500" },
  { id: "Resolved", title: "Resolved", colorBadgeClass: "bg-emerald-500" },
  { id: "Closed", title: "Closed", colorBadgeClass: "bg-slate-400" },
];

export default function BugsPage() {
  const confirm = useConfirm();
  const { activeProject, isItemInActiveProject } = useProject();
  const { data: rawBugs, isLoading } = useCollection<any>("bugReports");
  const { mutate: deleteBug } = useDeleteDocument("bugReports");
  const { mutate: updateBug } = useUpdateDocument("bugReports");

  const [editingBug, setEditingBug] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [activeBug, setActiveBug] = useState<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleEdit = (bug: any) => {
    setEditingBug(bug);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingBug(null);
    setIsDialogOpen(true);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const bug = event.active.data.current?.bug;
    if (bug) {
      setActiveBug(bug);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveBug(null);

    if (!over) return;

    const bugId = active.id as string;
    const targetStatus = over.id as string;

    const currentBug = rawBugs?.find((b: any) => b.id === bugId);
    if (currentBug && currentBug.status !== targetStatus) {
      updateBug({ id: bugId, data: { status: targetStatus } });
    }
  };

  const projectBugs = (rawBugs || []).filter((b: any) => isItemInActiveProject(b.projectId));

  const filteredBugs = projectBugs.filter((bug: any) => {
    const query = searchQuery.toLowerCase();
    return (
      bug.summary?.toLowerCase().includes(query) ||
      bug.pic?.toLowerCase().includes(query) ||
      bug.details?.toLowerCase().includes(query) ||
      bug.jiraTicketNumber?.toLowerCase().includes(query)
    );
  });

  return (
    <Panel className="h-full border-t-4 border-t-primary">
      <PanelHeader className="flex flex-col sm:flex-row items-start justify-between border-b-0 pb-0 gap-4">
        <div className="w-full sm:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground flex items-center gap-2 flex-wrap">
            Bug & Report
            {activeProject && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5 ml-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeProject.color || "#3b82f6" }} />
                {activeProject.name}
              </span>
            )}
          </PanelTitle>
          <PanelDescription className="mt-1">
            Track issues and QA reports for {activeProject?.name || "this project"}.
          </PanelDescription>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={handleCreate} className="shadow-sm w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Report Bug
          </Button>
          <BugDialog 
            open={isDialogOpen} 
            onOpenChange={setIsDialogOpen} 
            bugToEdit={editingBug} 
          />
        </div>
      </PanelHeader>

      <PanelContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Search bugs by summary, PIC, or JIRA ticket..." 
              className="pl-8 bg-muted/50 border-border" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* View Switcher Toggle */}
          <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border/50">
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                viewMode === "kanban"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Kanban
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                viewMode === "table"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="w-3.5 h-3.5" />
              Table
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading bugs...</div>
        ) : viewMode === "kanban" ? (
          /* Kanban Board View */
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {COLUMNS.map((col) => {
                const columnBugs = filteredBugs.filter(
                  (b: any) => (b.status || "Open") === col.id
                );
                return (
                  <KanbanColumn
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    colorBadgeClass={col.colorBadgeClass}
                    bugs={columnBugs}
                    handleEdit={handleEdit}
                    deleteBug={deleteBug}
                  />
                );
              })}
            </div>

            <DragOverlay>
              {activeBug ? (
                <div className="rotate-2 shadow-2xl opacity-90">
                  <BugCard
                    bug={activeBug}
                    handleEdit={() => {}}
                    deleteBug={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          /* Table View */
          <div className="border border-border/50 rounded-md overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Summary</TableHead>
                  <TableHead>JIRA Ticket</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>PIC</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBugs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No bug reports found.</TableCell>
                  </TableRow>
                ) : (
                  filteredBugs.map((bug: any) => (
                    <TableRow key={bug.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium text-secondary-foreground">{bug.summary}</TableCell>
                      <TableCell>
                        {bug.jiraTicketNumber ? (
                          (() => {
                            const rawBase = process.env.NEXT_PUBLIC_JIRA_BASE_URL;
                            if (rawBase) {
                              const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
                              const jiraUrl = `${base}${encodeURIComponent(bug.jiraTicketNumber)}`;
                              return (
                                <a
                                  href={jiraUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded-md transition-colors"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>{bug.jiraTicketNumber}</span>
                                </a>
                              );
                            }
                            return (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md">
                                {bug.jiraTicketNumber}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-1 rounded text-xs font-semibold",
                          bug.priority === "High" ? "bg-destructive/10 text-destructive dark:text-red-400" :
                          bug.priority === "Medium" ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" :
                          "bg-green-500/10 text-green-600 dark:text-green-400"
                        )}>
                          {bug.priority}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-1 rounded text-xs font-semibold",
                          bug.status === "Closed" || bug.status === "Resolved" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                          bug.status === "In Progress" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                          "bg-red-500/10 text-red-600 dark:text-red-400"
                        )}>
                          {bug.status || "Open"}
                        </span>
                      </TableCell>
                      <TableCell>{bug.pic || "-"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-accent-foreground h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(bug)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: "Delete Bug Report?",
                                  description: `Are you sure you want to delete bug "${bug.summary}"?`,
                                  confirmText: "Delete Bug",
                                  cancelText: "Cancel",
                                  variant: "destructive",
                                });
                                if (ok) {
                                  deleteBug(bug.id);
                                }
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </PanelContent>
    </Panel>
  );
}
