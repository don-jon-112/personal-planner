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
import { 
  Layers, 
  CheckSquare, 
  Clock, 
  ArrowRight, 
  FileText, 
  User, 
  Search, 
  X,
  CheckCircle2,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  readOnly = false,
}: { 
  epicToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void,
  onSelectTask?: (task: any) => void,
  readOnly?: boolean,
}) {
  const { activeProjectId, isItemInActiveProject } = useProject();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { data: allTasks = [], isLoading: isTasksLoading } = useCollection<any>("timelineTasks");
  const { data: pics = [] } = useCollection<any>("timelinePics");
  const { statuses = [], getStatusBadgeStyle, getStatusColor, isCompletedStatus } = useTaskStatuses();

  const { mutateAsync: addEpic, isPending: isAdding } = useAddDocument("timelineEpics");
  const { mutateAsync: updateEpic, isPending: isUpdating } = useUpdateDocument("timelineEpics");

  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const isEditing = Boolean(epicToEdit && epicToEdit.id);

  // Filter tasks belonging to this epic in active project
  const epicTasks = useMemo(() => {
    if (!epicToEdit?.id) return [];
    return allTasks
      .filter((t: any) => t.epicId === epicToEdit.id && isItemInActiveProject(t.projectId))
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  }, [allTasks, epicToEdit, isItemInActiveProject]);

  const totalTasks = epicTasks.length;
  const doneTasks = epicTasks.filter((t) => isCompletedStatus(t.status)).length;
  const totalMd = Number(epicTasks.reduce((sum, t) => sum + (Number(t.md) || 0), 0).toFixed(2));
  const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Full status breakdown calculation
  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    epicTasks.forEach((t) => {
      const st = (t.status || "TODO").trim().toUpperCase();
      counts[st] = (counts[st] || 0) + 1;
    });

    const allNames = new Set<string>();
    statuses.forEach((s) => allNames.add(s.name.trim().toUpperCase()));
    Object.keys(counts).forEach((st) => allNames.add(st));

    const list = Array.from(allNames).map((stName) => {
      const count = counts[stName] || 0;
      const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
      const color = getStatusColor(stName);
      const isDone = isCompletedStatus(stName);
      const statusObj = statuses.find((s) => s.name.trim().toUpperCase() === stName);
      return {
        name: stName,
        count,
        pct,
        color,
        isDone,
        order: statusObj?.order ?? (isDone ? 99 : 50),
      };
    });

    return list
      .filter((item) => item.count > 0 || statuses.some((s) => s.name.trim().toUpperCase() === item.name))
      .sort((a, b) => a.order - b.order);
  }, [epicTasks, statuses, totalTasks, getStatusColor, isCompletedStatus]);

  // Filtered tasks by search and status inside dialog
  const filteredTasks = useMemo(() => {
    return epicTasks.filter((t) => {
      const taskStatus = (t.status || "TODO").trim().toUpperCase();
      if (statusFilter !== "ALL" && taskStatus !== statusFilter) {
        return false;
      }
      if (taskSearchQuery.trim()) {
        const q = taskSearchQuery.toLowerCase().trim();
        const matchName = (t.name || "").toLowerCase().includes(q);
        const matchPic = (t.pic || "").toLowerCase().includes(q);
        return matchName || matchPic;
      }
      return true;
    });
  }, [epicTasks, statusFilter, taskSearchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [taskSearchQuery, statusFilter]);

  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, currentPage, pageSize]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: epicToEdit ? { name: epicToEdit.name || "" } : { name: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset(epicToEdit ? { name: epicToEdit.name || "" } : { name: "" });
      setTaskSearchQuery("");
      setStatusFilter("ALL");
      setCurrentPage(1);
    }
  }, [epicToEdit, open, form]);

  async function onSubmit(data: FormValues) {
    try {
      if (epicToEdit?.id) {
        await updateEpic({
          id: epicToEdit.id,
          data: {
            ...data,
            projectId: activeProjectId || epicToEdit?.projectId || undefined,
          },
        });
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
      <DialogContent 
        className={
          isEditing 
            ? "w-[94vw] max-w-5xl xl:max-w-6xl h-[88vh] max-h-[90vh] flex flex-col p-0 overflow-hidden" 
            : "sm:max-w-[480px] p-6"
        }
      >
        {/* Header */}
        <div className="p-5 pb-4 border-b border-border/60 bg-primary/5 shrink-0">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/20 text-primary shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold text-foreground">
                  {readOnly ? "Epic Details" : isEditing ? "Edit Epic" : "Create New Epic"}
                </DialogTitle>
                {isEditing && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {readOnly ? "Tinjau nama epic dan daftar task yang terkait." : "Update nama epic dan tinjau daftar task yang terkait."}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Epic Name Form */}
        <div className="px-5 py-3 border-b border-border/40 bg-card shrink-0">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <div className="space-y-1.5 flex-1 w-full">
                <Label className="text-xs font-semibold">Epic Name</Label>
                <Input 
                  {...form.register("name")} 
                  placeholder="e.g., Auth Module Revamp" 
                  disabled={readOnly}
                  className={cn("h-9 text-sm", readOnly && "bg-muted text-muted-foreground cursor-not-allowed")}
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>

              {!readOnly && (
                <Button type="submit" disabled={isPending} className="h-9 shrink-0 font-semibold gap-1.5">
                  {isPending ? "Saving..." : isEditing ? "Save Epic Name" : "Create Epic"}
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Epic Stats & Tasks Section (shown only when editing an existing epic) */}
        {isEditing && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Full Status Breakdown & Progress Header */}
            <div className="px-5 py-3 bg-muted/15 border-b border-border/50 space-y-2.5 shrink-0">
              {/* Row 1: Title & Key Stats */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                <div>
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Distribusi Status & Progres Epic
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Klik salah satu status di bawah untuk memfilter daftar task secara cepat.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 text-xs">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/20 shadow-2xs">
                    <CheckSquare className="w-3.5 h-3.5" />
                    {doneTasks} / {totalTasks} Selesai ({completionPct}%)
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-muted text-muted-foreground font-semibold border border-border/60">
                    <Clock className="w-3.5 h-3.5 opacity-70" />
                    {totalMd} Total MD
                  </span>
                </div>
              </div>

              {/* Row 2: Multi-Segment Progress Bar */}
              {totalTasks > 0 && (
                <div className="w-full h-2.5 bg-muted/60 rounded-full overflow-hidden flex shadow-inner border border-border/40">
                  {statusBreakdown.map((item) => {
                    if (item.count === 0) return null;
                    const widthPct = (item.count / totalTasks) * 100;
                    return (
                      <div
                        key={item.name}
                        style={{ width: `${widthPct}%`, backgroundColor: item.color }}
                        className="h-full transition-all duration-300 relative group/seg"
                        title={`${item.name}: ${item.count} task (${item.pct}%)`}
                      />
                    );
                  })}
                </div>
              )}

              {/* Row 3: Interactive Status Pills with counts and percentages */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-all border cursor-pointer select-none",
                    statusFilter === "ALL"
                      ? "bg-foreground text-background border-foreground shadow-2xs font-bold"
                      : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>ALL</span>
                  <span className="text-[10px] opacity-80 font-mono">({totalTasks})</span>
                </button>

                {statusBreakdown.map((item) => {
                  const isActive = statusFilter === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setStatusFilter(isActive ? "ALL" : item.name)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-all border cursor-pointer select-none",
                        isActive
                          ? "ring-2 ring-primary ring-offset-1 shadow-2xs font-bold"
                          : "hover:bg-muted/60 opacity-90 hover:opacity-100"
                      )}
                      style={{
                        backgroundColor: `${item.color}15`,
                        color: item.color,
                        borderColor: `${item.color}40`,
                      }}
                      title={`Filter task: ${item.name} (${item.count} task, ${item.pct}%)`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span>{item.name}</span>
                      <span className="text-[10px] font-mono font-bold">
                        {item.count} ({item.pct}%)
                      </span>
                      {item.isDone && (
                        <span title="Status ini terhitung Done" className="inline-flex items-center">
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Toolbar: Search input & Active Filter info */}
            <div className="px-5 py-2.5 bg-background border-b border-border/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={taskSearchQuery}
                  onChange={(e) => setTaskSearchQuery(e.target.value)}
                  placeholder="Cari task atau PIC di epic ini..."
                  className="h-8 pl-8 pr-7 text-xs bg-muted/20"
                />
                {taskSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setTaskSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {statusFilter !== "ALL" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-primary/10 text-primary font-medium">
                    Filter: <strong>{statusFilter}</strong>
                    <button type="button" onClick={() => setStatusFilter("ALL")} className="hover:text-destructive">
                      <X className="w-3 h-3 ml-0.5" />
                    </button>
                  </span>
                )}
                <span>
                  Total difilter: <strong className="text-foreground">{filteredTasks.length}</strong> task
                </span>
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
              <div className="border border-border/60 rounded-lg overflow-hidden bg-card shadow-2xs">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-xs border-b">
                    <TableRow className="h-9 hover:bg-transparent">
                      <TableHead className="w-12 py-1.5 text-center text-xs font-semibold">#</TableHead>
                      <TableHead className="py-1.5 text-xs font-semibold min-w-[260px]">Task Name</TableHead>
                      <TableHead className="py-1.5 text-xs font-semibold w-32">PIC</TableHead>
                      <TableHead className="py-1.5 text-xs font-semibold w-32">Status</TableHead>
                      <TableHead className="py-1.5 text-xs font-semibold w-28">Start Date</TableHead>
                      <TableHead className="py-1.5 text-xs font-semibold w-16 text-center">MD</TableHead>
                      <TableHead className="w-44 py-1.5 text-right text-xs font-semibold pr-3">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isTasksLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                          Loading tasks...
                        </TableCell>
                      </TableRow>
                    ) : filteredTasks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-xs text-muted-foreground">
                          <p className="font-semibold text-sm">Tidak ada task yang cocok</p>
                          <p className="text-[11px] text-muted-foreground/70 mt-1">
                            {taskSearchQuery || statusFilter !== "ALL"
                              ? "Coba ubah kata kunci pencarian atau filter status."
                              : "Belum ada task di epic ini. Kamu bisa menugaskan task dari Task Plan atau Timeline."}
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedTasks.map((task, idx) => {
                        const rowNum = (currentPage - 1) * pageSize + idx + 1;
                        const picColor = getPicColor(task.pic, pics);
                        const statusStyle = getStatusBadgeStyle(task.status);
                        const hasNotes = Array.isArray(task.notes) && task.notes.length > 0;
                        const formattedDate = task.startDate && task.startDate !== "TBD"
                          ? new Date(task.startDate).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : task.startDate || "TBD";

                        return (
                          <TableRow 
                            key={task.id || idx}
                            className="h-10 hover:bg-muted/40 cursor-pointer group transition-colors"
                            onClick={() => {
                              if (onSelectTask) {
                                onSelectTask(task);
                              }
                            }}
                          >
                            <TableCell className="text-center text-xs text-muted-foreground py-1.5">
                              {rowNum}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1" title={task.name}>
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
                            <TableCell className="py-1.5">
                              <span 
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white max-w-[120px] truncate"
                                style={{ backgroundColor: picColor }}
                              >
                                <User className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{task.pic || "TBD"}</span>
                              </span>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <span 
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                style={statusStyle}
                              >
                                {task.status || "TODO"}
                              </span>
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                              {formattedDate}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs font-semibold text-center text-foreground font-mono">
                              {task.md || 1}
                            </TableCell>
                            <TableCell className="py-1.5 text-right pr-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary group-hover:bg-background"
                                  onClick={() => {
                                    if (onSelectTask) {
                                      onSelectTask(task);
                                    }
                                  }}
                                  title="Buka detail task"
                                >
                                  Detail <ArrowRight className="w-3 h-3 ml-0.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Footer with Pagination Controls */}
            <div className="px-5 py-2.5 border-t border-border/60 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground shrink-0">
              {/* Left: Summary text & Page Size Selector */}
              <div className="flex items-center gap-3 flex-wrap">
                <span>
                  Menampilkan <strong>{filteredTasks.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> -{" "}
                  <strong>{Math.min(currentPage * pageSize, filteredTasks.length)}</strong> dari{" "}
                  <strong>{filteredTasks.length}</strong> task
                  {filteredTasks.length !== totalTasks && (
                    <span className="text-muted-foreground/80 ml-1">
                      (difilter dari {totalTasks} total)
                    </span>
                  )}
                </span>

                <div className="flex items-center gap-1.5 pl-3 border-l border-border/60">
                  <span>Per hal:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-7 text-xs rounded border border-border bg-background px-1.5 py-0.5 text-foreground focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {/* Right: Pagination Navigation & Close Button */}
              <div className="flex items-center gap-2">
                {totalPages > 1 && (
                  <div className="flex items-center gap-1 mr-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      title="Halaman Pertama"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      title="Halaman Sebelumnya"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>

                    <span className="text-xs px-2 font-medium text-foreground whitespace-nowrap">
                      {currentPage} / {totalPages}
                    </span>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      title="Halaman Berikutnya"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      title="Halaman Terakhir"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => setOpen(false)}
                >
                  Tutup
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

