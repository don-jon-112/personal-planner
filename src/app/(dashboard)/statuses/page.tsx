"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Tag, 
  Plus, 
  Search, 
  Trash2, 
  CheckSquare, 
  Edit2, 
  Check, 
  X,
  Palette,
  ShieldAlert
} from "lucide-react";
import { useCollection, useUpdateBatch } from "@/hooks/use-firestore";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useProject } from "@/components/project-context";
import { useTaskStatuses, TaskStatus } from "@/hooks/use-task-statuses";

const formSchema = z.object({
  name: z.string().min(1, "Status Name is required"),
  color: z.string().min(1, "Color is required"),
});

type FormValues = z.infer<typeof formSchema>;

export default function StatusesPage() {
  const confirm = useConfirm();
  const { activeProject, isItemInActiveProject } = useProject();
  
  const { 
    statuses, 
    hasCustomStatuses, 
    isLoading: isStatusesLoading, 
    addStatus, 
    updateStatus, 
    deleteStatus, 
    initializeDefaultStatuses 
  } = useTaskStatuses();

  const { data: tasks = [] } = useCollection<any>("timelineTasks");
  const { mutateAsync: updateTasksBatch } = useUpdateBatch("timelineTasks");

  const [searchQuery, setSearchQuery] = useState("");
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingStatusName, setEditingStatusName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initAttempted = useRef<Record<string, boolean>>({});

  // Automatically initialize standard statuses once per project if none saved yet
  useEffect(() => {
    const pid = activeProject?.id;
    if (!pid || isStatusesLoading) return;
    if (!hasCustomStatuses && !initAttempted.current[pid]) {
      initAttempted.current[pid] = true;
      initializeDefaultStatuses(pid);
    }
  }, [isStatusesLoading, hasCustomStatuses, activeProject?.id, initializeDefaultStatuses]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      color: "#3b82f6",
    },
  });

  const projectTasks = useMemo(() => {
    return tasks.filter((t: any) => isItemInActiveProject(t.projectId));
  }, [tasks, isItemInActiveProject]);

  const onSubmit = async (data: FormValues) => {
    if (!activeProject?.id) return;
    const trimmedName = data.name.trim().toUpperCase();

    // Check duplicate name
    const isDuplicate = statuses.some(
      (s) => s.name.trim().toUpperCase() === trimmedName
    );
    if (isDuplicate) {
      await confirm({
        title: "Duplicate Status Name",
        description: `Status "${trimmedName}" already exists in this project. Please choose a different name.`,
        confirmText: "OK",
        variant: "warning",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      await addStatus({
        name: trimmedName,
        color: data.color,
        order: statuses.length + 1,
        projectId: activeProject.id,
      });

      form.reset({
        name: "",
        color: "#3b82f6",
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartRename = (status: TaskStatus) => {
    setEditingStatusId(status.id);
    setEditingStatusName(status.name);
  };

  const handleSaveRename = async (status: TaskStatus) => {
    const trimmed = editingStatusName.trim().toUpperCase();
    if (!trimmed || trimmed === status.name) {
      setEditingStatusId(null);
      return;
    }

    const oldName = status.name;
    const affectedTasks = projectTasks.filter((t: any) => t.status === oldName);

    // Confirmation if there are associated tasks
    if (affectedTasks.length > 0) {
      const ok = await confirm({
        title: "Rename Status & Update Tasks?",
        description: `Renaming status from "${oldName}" to "${trimmed}" will also update ${affectedTasks.length} task(s) currently using this status. Proceed?`,
        confirmText: "Rename & Update Tasks",
        cancelText: "Cancel",
      });
      if (!ok) return;
    }

    try {
      // 1. Update the status doc
      await updateStatus({
        id: status.id,
        data: { name: trimmed },
      });

      // 2. Cascade update tasks in this project
      if (affectedTasks.length > 0) {
        const batchUpdates = affectedTasks.map((t: any) => ({
          id: t.id,
          data: { status: trimmed },
        }));
        await updateTasksBatch(batchUpdates);
      }

      setEditingStatusId(null);
    } catch (error) {
      console.error("Failed to rename status:", error);
    }
  };

  const handleColorChange = async (status: TaskStatus, newColor: string) => {
    await updateStatus({
      id: status.id,
      data: { color: newColor },
    });
  };

  const handleDelete = async (status: TaskStatus) => {
    const taskCount = projectTasks.filter((t: any) => t.status === status.name).length;

    // RULE: Cannot delete if any task is related!
    if (taskCount > 0) {
      await confirm({
        title: "Cannot Delete Status",
        description: `Status "${status.name}" cannot be deleted because it is currently used by ${taskCount} task(s). Please reassign or update those tasks to another status before deleting.`,
        confirmText: "I Understand",
        variant: "destructive",
      });
      return;
    }

    const ok = await confirm({
      title: "Delete Status?",
      description: `Are you sure you want to delete status "${status.name}"? This action cannot be undone.`,
      confirmText: "Delete Status",
      cancelText: "Cancel",
      variant: "destructive",
    });

    if (ok) {
      await deleteStatus(status.id);
    }
  };

  const filteredStatuses = useMemo(() => {
    if (searchQuery.trim() === "") return statuses;
    const q = searchQuery.toLowerCase();
    return statuses.filter((s) => s.name.toLowerCase().includes(q));
  }, [statuses, searchQuery]);

  return (
    <Panel className="h-full border-t-4 border-t-primary flex flex-col">
      {/* Header */}
      <PanelHeader className="flex flex-col sm:flex-row items-start justify-between border-b-0 pb-1 gap-4">
        <div className="w-full sm:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground flex items-center gap-2 flex-wrap">
            <Tag className="w-6 h-6 text-primary" /> Task Status Management
            {activeProject && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5 ml-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeProject.color || "#3b82f6" }} />
                {activeProject.name}
              </span>
            )}
          </PanelTitle>
          <PanelDescription className="mt-1">
            Manage task progress statuses, badge colors, and track task distributions for {activeProject?.name || "this project"}.
          </PanelDescription>
        </div>
      </PanelHeader>

      <PanelContent className="space-y-6 flex-1 overflow-auto p-6">
        {/* Top Section: Add New Status Form */}
        <div className="bg-card border rounded-xl p-5 shadow-xs">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Add New Status
          </h3>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="space-y-1.5 flex-1 w-full sm:w-auto">
              <Label htmlFor="statusName" className="text-xs">
                Status Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="statusName"
                {...form.register("name")}
                placeholder="e.g., WAITING CLIENT, TESTING, BLOCKED"
                className="bg-muted/30 uppercase"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Palette className="w-3.5 h-3.5" /> Badge Color
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  {...form.register("color")}
                  className="w-14 h-10 p-1 cursor-pointer bg-muted/30 border rounded-md"
                  title="Pick Badge Color"
                />
              </div>
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto h-10 shadow-xs">
              <Plus className="w-4 h-4 mr-1.5" />
              {isSubmitting ? "Adding..." : "Add Status"}
            </Button>
          </form>
        </div>

        {/* Bottom Section: Statuses Table */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search Status..."
                className="pl-8 bg-muted/30 border-border"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Total Statuses: <span className="font-semibold text-foreground">{statuses.length}</span>
            </p>
          </div>

          <div className="border border-border/60 rounded-lg overflow-hidden bg-card shadow-xs">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-[80px]">Color</TableHead>
                  <TableHead>Status Name</TableHead>
                  <TableHead>Associated Tasks</TableHead>
                  <TableHead className="w-[120px] text-center">% of Tasks</TableHead>
                  <TableHead className="w-[100px] text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isStatusesLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      Loading Statuses...
                    </TableCell>
                  </TableRow>
                ) : filteredStatuses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <p className="text-base font-medium">No status found.</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Add a status above to customize your workflow.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStatuses.map((status: TaskStatus) => {
                    const statusTasks = projectTasks.filter((t: any) => t.status === status.name);
                    const taskCount = statusTasks.length;
                    const totalProjectTasks = projectTasks.length;
                    const pct = totalProjectTasks > 0 ? Math.round((taskCount / totalProjectTasks) * 100) : 0;
                    const isEditing = editingStatusId === status.id;
                    const hasLinkedTasks = taskCount > 0;

                    return (
                      <TableRow key={status.id} className="hover:bg-muted/20 transition-colors">
                        {/* Color Picker */}
                        <TableCell>
                          <input
                            type="color"
                            value={status.color || "#3b82f6"}
                            onChange={(e) => handleColorChange(status, e.target.value)}
                            title="Click to change color"
                            className="w-7 h-7 rounded-full border cursor-pointer p-0 overflow-hidden bg-transparent shrink-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full shadow-xs"
                          />
                        </TableCell>

                        {/* Name / Inline Edit */}
                        <TableCell className="font-semibold">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editingStatusName}
                                onChange={(e) => setEditingStatusName(e.target.value)}
                                className="h-8 text-sm max-w-[220px] uppercase"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveRename(status);
                                  if (e.key === "Escape") setEditingStatusId(null);
                                }}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                                onClick={() => handleSaveRename(status)}
                                title="Save changes"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:bg-muted"
                                onClick={() => setEditingStatusId(null)}
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group/edit">
                              <span
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider"
                                style={{
                                  backgroundColor: `${status.color}20`,
                                  color: status.color,
                                  border: `1px solid ${status.color}50`,
                                }}
                              >
                                {status.name}
                              </span>
                              <button
                                onClick={() => handleStartRename(status)}
                                className="opacity-0 group-hover/edit:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-1"
                                title="Edit Name"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </TableCell>

                        {/* Associated Tasks */}
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CheckSquare className="w-3.5 h-3.5 opacity-70" />
                            <span className="font-semibold text-foreground">{taskCount}</span> task{taskCount !== 1 ? "s" : ""}
                          </span>
                        </TableCell>

                        {/* Percent of Project Tasks */}
                        <TableCell className="text-center">
                          <span className="text-xs font-medium text-muted-foreground">
                            {pct}%
                          </span>
                        </TableCell>

                        {/* Action: Delete */}
                        <TableCell className="text-right pr-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={hasLinkedTasks}
                            onClick={() => handleDelete(status)}
                            className={
                              hasLinkedTasks
                                ? "h-8 w-8 text-muted-foreground/30 cursor-not-allowed"
                                : "h-8 w-8 text-destructive hover:bg-destructive/10"
                            }
                            title={
                              hasLinkedTasks
                                ? `Cannot delete: ${taskCount} task(s) are using this status`
                                : "Delete Status"
                            }
                          >
                            {hasLinkedTasks ? (
                              <ShieldAlert className="w-4 h-4 opacity-40" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </PanelContent>
    </Panel>
  );
}
