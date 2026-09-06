"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAddDocument, useUpdateDocument, useCollection } from "@/hooks/use-firestore";
import { useProject } from "@/components/project-context";
import { useTaskStatuses } from "@/hooks/use-task-statuses";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
} from "@/components/ui/dialog";
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
import { Layers, CheckSquare, Clock, ArrowRight, FileText, User } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

type FormValues = z.infer<typeof formSchema>;

function getPicColor(name: string, pics: any[] = []) {
  const pic = pics.find((p: any) => p.name === name);
  if (pic && pic.color) return pic.color;
  if (!name || name === "TBD") return "#64748b";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

export function EpicDialog({ 
  epicToEdit, 
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onSelectTask,
}: { 
  epicToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void,
  onSelectTask?: (task: any) => void,
}) {
  const { activeProjectId, isItemInActiveProject } = useProject();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { data: allTasks = [], isLoading: isTasksLoading } = useCollection<any>("timelineTasks");
  const { data: pics = [] } = useCollection<any>("timelinePics");
  const { getStatusBadgeStyle } = useTaskStatuses();

  const { mutateAsync: addEpic, isPending: isAdding } = useAddDocument("timelineEpics");
  const { mutateAsync: updateEpic, isPending: isUpdating } = useUpdateDocument("timelineEpics");

  const isEditing = Boolean(epicToEdit && epicToEdit.id);

  // Filter tasks belonging to this epic in active project
  const epicTasks = useMemo(() => {
    if (!epicToEdit?.id) return [];
    return allTasks
      .filter((t: any) => t.epicId === epicToEdit.id && isItemInActiveProject(t.projectId))
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  }, [allTasks, epicToEdit, isItemInActiveProject]);

  const totalTasks = epicTasks.length;
  const doneTasks = epicTasks.filter((t) => t.status === "DONE" || t.status === "COMPLETED").length;
  const totalMd = epicTasks.reduce((sum, t) => sum + (Number(t.md) || 0), 0);
  const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: epicToEdit ? { name: epicToEdit.name || "" } : { name: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset(epicToEdit ? { name: epicToEdit.name || "" } : { name: "" });
    }
  }, [epicToEdit, open, form]);

  async function onSubmit(data: FormValues) {
    try {
      if (epicToEdit?.id) {
        await updateEpic({ id: epicToEdit.id, data });
      } else {
        await addEpic({ ...data, order: Date.now(), projectId: activeProjectId || undefined });
      }
      setOpen(false);
      if (!epicToEdit) form.reset();
    } catch (error) {
      console.error(error);
    }
  }

  const isPending = isAdding || isUpdating;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={isEditing ? "sm:max-w-[700px] max-h-[90vh] overflow-y-auto" : "sm:max-w-[440px]"}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                {isEditing ? "Edit Epic" : "Create New Epic"}
              </DialogTitle>
              {isEditing && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Update nama epic dan tinjau daftar task yang terkait.
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Epic Name Form */}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="space-y-1.5 flex-1 w-full">
              <Label className="text-xs font-semibold">Epic Name</Label>
              <Input 
                {...form.register("name")} 
                placeholder="e.g., Auth Module Revamp" 
                className="h-9 text-sm"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <Button type="submit" disabled={isPending} className="h-9 shrink-0">
              {isPending ? "Saving..." : isEditing ? "Save Epic Name" : "Create Epic"}
            </Button>
          </div>
        </form>

        {/* Epic Stats & Tasks Section (shown only when editing an existing epic) */}
        {isEditing && (
          <div className="space-y-3.5 pt-4 border-t border-border/70 mt-2">
            {/* Stats summary bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <CheckSquare className="w-3.5 h-3.5 text-primary" />
                  {doneTasks} / {totalTasks} Tasks Done ({completionPct}%)
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground font-medium">
                  <Clock className="w-3.5 h-3.5 opacity-70" />
                  {totalMd} Total MD
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Klik baris task untuk melihat detail / notes
              </span>
            </div>

            {/* Tasks in this Epic Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-primary" />
                  Tasks in this Epic
                </h4>
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-semibold text-muted-foreground">
                  {totalTasks} {totalTasks === 1 ? "task" : "tasks"}
                </span>
              </div>

              <div className="border border-border/60 rounded-lg overflow-hidden bg-card">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="h-8 hover:bg-transparent">
                      <TableHead className="w-[36px] py-1 text-center text-xs font-semibold">#</TableHead>
                      <TableHead className="py-1 text-xs font-semibold">Task Name</TableHead>
                      <TableHead className="py-1 text-xs font-semibold w-[100px]">PIC</TableHead>
                      <TableHead className="py-1 text-xs font-semibold w-[110px]">Status</TableHead>
                      <TableHead className="py-1 text-xs font-semibold w-[90px]">Start Date</TableHead>
                      <TableHead className="py-1 text-xs font-semibold w-[50px] text-center">MD</TableHead>
                      <TableHead className="w-[60px] py-1 text-right text-xs"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isTasksLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                          Loading tasks...
                        </TableCell>
                      </TableRow>
                    ) : epicTasks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                          <p className="font-medium">Belum ada task di epic ini.</p>
                          <p className="text-[11px] text-muted-foreground/70 mt-1">
                            Kamu bisa menugaskan task ke epic ini dari Task Plan atau Timeline.
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      epicTasks.map((task, idx) => {
                        const picColor = getPicColor(task.pic, pics);
                        const statusStyle = getStatusBadgeStyle(task.status);
                        const hasNotes = Array.isArray(task.notes) && task.notes.length > 0;
                        const formattedDate = task.startDate && task.startDate !== "TBD"
                          ? new Date(task.startDate).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })
                          : task.startDate || "TBD";

                        return (
                          <TableRow 
                            key={task.id || idx}
                            className="h-9 hover:bg-muted/40 cursor-pointer group transition-colors"
                            onClick={() => {
                              if (onSelectTask) {
                                onSelectTask(task);
                              }
                            }}
                          >
                            <TableCell className="text-center text-xs text-muted-foreground py-1">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="py-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                                  {task.name}
                                </span>
                                {hasNotes && (
                                  <span 
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] bg-muted text-muted-foreground border border-border/60 shrink-0 select-none"
                                    title={`${task.notes.length} note(s)`}
                                  >
                                    <FileText className="w-2.5 h-2.5 text-primary" />
                                    <span>{task.notes.length}</span>
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-1">
                              <span 
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white max-w-[90px] truncate"
                                style={{ backgroundColor: picColor }}
                              >
                                <User className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{task.pic || "TBD"}</span>
                              </span>
                            </TableCell>
                            <TableCell className="py-1">
                              <span 
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                style={statusStyle}
                              >
                                {task.status || "TODO"}
                              </span>
                            </TableCell>
                            <TableCell className="py-1 text-xs text-muted-foreground whitespace-nowrap">
                              {formattedDate}
                            </TableCell>
                            <TableCell className="py-1 text-xs font-semibold text-center text-foreground">
                              {task.md || 1}
                            </TableCell>
                            <TableCell className="py-1 text-right pr-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-primary group-hover:bg-background"
                                onClick={() => {
                                  if (onSelectTask) {
                                    onSelectTask(task);
                                  }
                                }}
                                title="Buka detail task"
                              >
                                Detail <ArrowRight className="w-3 h-3 ml-0.5" />
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
