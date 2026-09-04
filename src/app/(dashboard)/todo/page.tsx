"use client";

import React, { useState, useMemo, useEffect } from "react";
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
import { Search, Plus, ArrowUpDown, Filter, CheckSquare, Layers, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

import { useCollection, useDeleteDocument, useUpdateBatch } from "@/hooks/use-firestore";
import { TaskDialog } from "../timeline/task-dialog";
import { EpicDialog } from "../timeline/epic-dialog";
import { ImportDialog } from "./import-dialog";
import { SortableTodoRow } from "./sortable-todo-row";
import { SortableEpicRow } from "./sortable-epic-row";
import { computeAllTaskOverlaps } from "@/lib/overlap-utils";
import { useProject } from "@/components/project-context";

export default function TodoPage() {
  const [activeTab, setActiveTab] = useState<"tasks" | "epics">("tasks");
  const { activeProject, isItemInActiveProject } = useProject();

  // Firestore Collections
  const { data: tasks = [], isLoading: isTasksLoading } = useCollection<any>("timelineTasks");
  const { data: epics = [], isLoading: isEpicsLoading } = useCollection<any>("timelineEpics");
  const { data: pics = [] } = useCollection<any>("timelinePics");
  const { data: holidays = [] } = useCollection<any>("timelineHolidays");

  const activeTasks = useMemo(() => {
    return tasks.filter((t: any) => isItemInActiveProject(t.projectId));
  }, [tasks, isItemInActiveProject]);

  const activeEpics = useMemo(() => {
    return epics.filter((e: any) => isItemInActiveProject(e.projectId));
  }, [epics, isItemInActiveProject]);

  const overlapMap = useMemo(() => {
    return computeAllTaskOverlaps(activeTasks, holidays, activeEpics);
  }, [activeTasks, holidays, activeEpics]);

  const { mutate: deleteTask } = useDeleteDocument("timelineTasks");
  const { mutate: batchUpdateTasks } = useUpdateBatch("timelineTasks");

  const { mutate: deleteEpic } = useDeleteDocument("timelineEpics");
  const { mutate: batchUpdateEpics } = useUpdateBatch("timelineEpics");

  // Local state for optimistic drag & drop
  const [localTasks, setLocalTasks] = useState<any[]>([]);
  const [localEpics, setLocalEpics] = useState<any[]>([]);

  // Dialog states
  const [editingTask, setEditingTask] = useState<any>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);

  const [editingEpic, setEditingEpic] = useState<any>(null);
  const [isEpicDialogOpen, setIsEpicDialogOpen] = useState(false);

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  // Filter & Search states
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [epicSearchQuery, setEpicSearchQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [picFilters, setPicFilters] = useState<string[]>([]);
  const [epicFilters, setEpicFilters] = useState<string[]>([]);

  // Sorting state
  const [taskSortConfig, setTaskSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [epicSortConfig, setEpicSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  // Sync firestore collections to local state (scoped to active project)
  useEffect(() => {
    setLocalTasks(activeTasks);
  }, [activeTasks]);

  useEffect(() => {
    setLocalEpics(activeEpics);
  }, [activeEpics]);

  const toggleStatusFilter = (status: string) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const togglePicFilter = (pic: string) => {
    setPicFilters((prev) =>
      prev.includes(pic) ? prev.filter((p) => p !== pic) : [...prev, pic]
    );
  };

  const toggleEpicFilter = (epicId: string) => {
    setEpicFilters((prev) =>
      prev.includes(epicId) ? prev.filter((e) => e !== epicId) : [...prev, epicId]
    );
  };

  const requestTaskSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (taskSortConfig && taskSortConfig.key === key && taskSortConfig.direction === "asc") {
      direction = "desc";
    }
    setTaskSortConfig({ key, direction });
  };

  const requestEpicSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (epicSortConfig && epicSortConfig.key === key && epicSortConfig.direction === "asc") {
      direction = "desc";
    }
    setEpicSortConfig({ key, direction });
  };

  // Filtered & Sorted Tasks
  const processedTasks = useMemo(() => {
    let list = [...localTasks];

    // Search filter
    if (taskSearchQuery.trim() !== "") {
      const q = taskSearchQuery.toLowerCase();
      list = list.filter((t) => {
        const name = (t.name || "").toLowerCase();
        const pic = (t.pic || "").toLowerCase();
        const epicName = (epics.find((e) => e.id === t.epicId)?.name || "").toLowerCase();
        return name.includes(q) || pic.includes(q) || epicName.includes(q);
      });
    }

    // Status filter
    if (statusFilters.length > 0) {
      list = list.filter((t) => {
        const s = String(t.status || "TODO").toUpperCase();
        return statusFilters.includes(s);
      });
    }

    // PIC filter
    if (picFilters.length > 0) {
      list = list.filter((t) => picFilters.includes(t.pic || ""));
    }

    // Epic filter
    if (epicFilters.length > 0) {
      list = list.filter((t) => {
        if (epicFilters.includes("BACKLOG") && (!t.epicId || t.epicId === "")) return true;
        return epicFilters.includes(t.epicId || "");
      });
    }

    // Sort
    if (taskSortConfig !== null) {
      list.sort((a, b) => {
        let aVal = a[taskSortConfig.key] || "";
        let bVal = b[taskSortConfig.key] || "";

        if (taskSortConfig.key === "epic") {
          aVal = epics.find((e) => e.id === a.epicId)?.name || "";
          bVal = epics.find((e) => e.id === b.epicId)?.name || "";
        } else if (taskSortConfig.key === "md") {
          aVal = Number(a.md) || 0;
          bVal = Number(b.md) || 0;
        }

        if (aVal < bVal) return taskSortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return taskSortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      // Default sort by order / orderIndex
      list.sort((a, b) => {
        const orderA = a.order ?? a.orderIndex ?? Date.now();
        const orderB = b.order ?? b.orderIndex ?? Date.now();
        return orderA - orderB;
      });
    }

    return list;
  }, [localTasks, epics, taskSearchQuery, statusFilters, picFilters, epicFilters, taskSortConfig]);

  // Filtered & Sorted Epics
  const processedEpics = useMemo(() => {
    let list = [...localEpics];

    if (epicSearchQuery.trim() !== "") {
      const q = epicSearchQuery.toLowerCase();
      list = list.filter((e) => (e.name || "").toLowerCase().includes(q));
    }

    if (epicSortConfig !== null) {
      list.sort((a, b) => {
        let aVal = a[epicSortConfig.key] || "";
        let bVal = b[epicSortConfig.key] || "";

        if (epicSortConfig.key === "taskCount") {
          aVal = tasks.filter((t) => t.epicId === a.id).length;
          bVal = tasks.filter((t) => t.epicId === b.id).length;
        } else if (epicSortConfig.key === "totalMd") {
          aVal = tasks.filter((t) => t.epicId === a.id).reduce((sum, t) => sum + (Number(t.md) || 0), 0);
          bVal = tasks.filter((t) => t.epicId === b.id).reduce((sum, t) => sum + (Number(t.md) || 0), 0);
        }

        if (aVal < bVal) return epicSortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return epicSortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      list.sort((a, b) => {
        const orderA = a.order ?? Date.now();
        const orderB = b.order ?? Date.now();
        return orderA - orderB;
      });
    }

    return list;
  }, [localEpics, tasks, epicSearchQuery, epicSortConfig]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = processedTasks.findIndex((t) => t.id === active.id);
      const newIndex = processedTasks.findIndex((t) => t.id === over.id);
      const newOrder = arrayMove(processedTasks, oldIndex, newIndex);
      setLocalTasks(newOrder);

      const updates = newOrder.map((item, index) => ({
        id: item.id,
        data: { order: index * 1000 },
      }));
      batchUpdateTasks(updates);
    }
  };

  const handleEpicDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = processedEpics.findIndex((e) => e.id === active.id);
      const newIndex = processedEpics.findIndex((e) => e.id === over.id);
      const newOrder = arrayMove(processedEpics, oldIndex, newIndex);
      setLocalEpics(newOrder);

      const updates = newOrder.map((item, index) => ({
        id: item.id,
        data: { order: index * 1000 },
      }));
      batchUpdateEpics(updates);
    }
  };

  const handleEditTask = (task: any) => {
    setEditingTask(task);
    setIsTaskDialogOpen(true);
  };

  const handleCreateTask = () => {
    setEditingTask(null);
    setIsTaskDialogOpen(true);
  };

  const handleEditEpic = (epic: any) => {
    setEditingEpic(epic);
    setIsEpicDialogOpen(true);
  };

  const handleCreateEpic = () => {
    setEditingEpic(null);
    setIsEpicDialogOpen(true);
  };

  const totalFilterCount = statusFilters.length + picFilters.length + epicFilters.length;
  const isTaskDragDisabled = taskSortConfig !== null;
  const isEpicDragDisabled = epicSortConfig !== null;

  return (
    <Panel className="h-full border-t-4 border-t-primary flex flex-col">
      {/* Header */}
      <PanelHeader className="flex flex-col sm:flex-row items-start justify-between border-b-0 pb-1 gap-4">
        <div className="w-full sm:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground flex items-center gap-2 flex-wrap">
            <CheckSquare className="w-6 h-6 text-primary" /> Task Plan
            {activeProject && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5 ml-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeProject.color || "#3b82f6" }} />
                {activeProject.name}
              </span>
            )}
          </PanelTitle>
          <PanelDescription className="mt-1">
            Manage tasks, backlogs, and epic breakdown for {activeProject?.name || "this project"}.
          </PanelDescription>
        </div>
      </PanelHeader>

      {/* Dialogs */}
      <TaskDialog
        open={isTaskDialogOpen}
        onOpenChange={setIsTaskDialogOpen}
        taskToEdit={editingTask}
      />
      <EpicDialog
        open={isEpicDialogOpen}
        onOpenChange={setIsEpicDialogOpen}
        epicToEdit={editingEpic}
      />
      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
      />

      <PanelContent className="space-y-5 flex-1 overflow-auto">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-150",
              activeTab === "tasks"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Task List</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-bold",
                activeTab === "tasks"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {tasks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("epics")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-150",
              activeTab === "epics"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            <Layers className="w-4 h-4" />
            <span>Epic List</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-bold",
                activeTab === "epics"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {epics.length}
            </span>
          </button>
        </div>

        {/* Tab 1: Task List */}
        {activeTab === "tasks" && (
          <div className="space-y-4">
            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search task, epic, or PIC..."
                  className="pl-8 bg-muted/40 border-border"
                  value={taskSearchQuery}
                  onChange={(e) => setTaskSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3 text-xs w-full sm:w-auto">
                    <Filter className="w-4 h-4 mr-2" />
                    Filter {totalFilterCount > 0 && `(${totalFilterCount})`}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                      {["TODO", "ON PROGRESS", "IN REVIEW", "DONE", "WON'T DO"].map((status) => (
                        <DropdownMenuCheckboxItem
                          key={status}
                          checked={statusFilters.includes(status)}
                          onCheckedChange={() => toggleStatusFilter(status)}
                        >
                          {status}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuGroup>

                    {pics.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>Filter by PIC</DropdownMenuLabel>
                          {pics.map((pic) => (
                            <DropdownMenuCheckboxItem
                              key={pic.id}
                              checked={picFilters.includes(pic.name)}
                              onCheckedChange={() => togglePicFilter(pic.name)}
                            >
                              {pic.name}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuGroup>
                      </>
                    )}

                    {epics.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>Filter by Epic</DropdownMenuLabel>
                          <DropdownMenuCheckboxItem
                            checked={epicFilters.includes("BACKLOG")}
                            onCheckedChange={() => toggleEpicFilter("BACKLOG")}
                          >
                            Backlog (No Epic)
                          </DropdownMenuCheckboxItem>
                          {epics.map((epic) => (
                            <DropdownMenuCheckboxItem
                              key={epic.id}
                              checked={epicFilters.includes(epic.id)}
                              onCheckedChange={() => toggleEpicFilter(epic.id)}
                            >
                              {epic.name}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuGroup>
                      </>
                    )}

                    {totalFilterCount > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-xs text-destructive text-center justify-center cursor-pointer"
                          onClick={() => {
                            setStatusFilters([]);
                            setPicFilters([]);
                            setEpicFilters([]);
                          }}
                        >
                          Clear all filters
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsImportDialogOpen(true)} 
                  className="shadow-xs w-full sm:w-auto h-9 text-xs"
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  Import Data
                </Button>

                <Button onClick={handleCreateTask} className="shadow-sm w-full sm:w-auto h-9 text-xs">
                  <Plus className="w-4 h-4 mr-1.5" />
                  New Task
                </Button>
              </div>
            </div>

            {/* Task Table */}
            <div className="border border-border/60 rounded-lg overflow-hidden bg-card shadow-sm">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-[40px] pl-3"></TableHead>
                    <TableHead
                      onClick={() => requestTaskSort("name")}
                      className="cursor-pointer hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        Task Name <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => requestTaskSort("epic")}
                      className="cursor-pointer hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        Epic <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => requestTaskSort("pic")}
                      className="cursor-pointer hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        PIC <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => requestTaskSort("startDate")}
                      className="cursor-pointer hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        Start Date <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => requestTaskSort("md")}
                      className="cursor-pointer hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        MD <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => requestTaskSort("status")}
                      className="cursor-pointer hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        Status <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isTasksLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                        Loading tasks...
                      </TableCell>
                    </TableRow>
                  ) : processedTasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        <p className="text-base font-medium">No tasks found.</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Click "New Task" above to create your first task.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleTaskDragEnd}
                      modifiers={[restrictToVerticalAxis]}
                    >
                      <SortableContext
                        items={processedTasks.map((t) => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {processedTasks.map((item) => (
                          <SortableTodoRow
                            key={item.id}
                            item={item}
                            epics={epics}
                            pics={pics}
                            overlapInfo={overlapMap.get(item.id)}
                            handleEdit={handleEditTask}
                            deleteTask={deleteTask}
                            isDragDisabled={isTaskDragDisabled}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Tab 2: Epic List */}
        {activeTab === "epics" && (
          <div className="space-y-4">
            {/* Search Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search epics..."
                  className="pl-8 bg-muted/40 border-border"
                  value={epicSearchQuery}
                  onChange={(e) => setEpicSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsImportDialogOpen(true)} 
                  className="shadow-xs w-full sm:w-auto h-9 text-xs"
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  Import Data
                </Button>

                <Button onClick={handleCreateEpic} className="shadow-sm w-full sm:w-auto h-9 text-xs">
                  <Plus className="w-4 h-4 mr-1.5" />
                  New Epic
                </Button>
              </div>
            </div>

            {/* Epic Table */}
            <div className="border border-border/60 rounded-lg overflow-hidden bg-card shadow-sm">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-[40px] pl-3"></TableHead>
                    <TableHead
                      onClick={() => requestEpicSort("name")}
                      className="cursor-pointer hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        Epic Name <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => requestEpicSort("taskCount")}
                      className="cursor-pointer hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        Tasks Completed <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => requestEpicSort("totalMd")}
                      className="cursor-pointer hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        Total MD <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isEpicsLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                        Loading epics...
                      </TableCell>
                    </TableRow>
                  ) : processedEpics.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        <p className="text-base font-medium">No epics found.</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Click "New Epic" above to create an epic.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleEpicDragEnd}
                      modifiers={[restrictToVerticalAxis]}
                    >
                      <SortableContext
                        items={processedEpics.map((e) => e.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {processedEpics.map((epic) => (
                          <SortableEpicRow
                            key={epic.id}
                            epic={epic}
                            tasks={tasks}
                            handleEdit={handleEditEpic}
                            deleteEpic={deleteEpic}
                            isDragDisabled={isEpicDragDisabled}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </PanelContent>
    </Panel>
  );
}
