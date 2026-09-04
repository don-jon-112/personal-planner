"use client";

import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAddDocument, useUpdateDocument, useCollection } from "@/hooks/use-firestore";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ListPlus, AlertCircle, ArrowRight, AlertTriangle, Calendar, Layers, Clock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { checkTaskOverlap, OverlapResult } from "@/lib/overlap-utils";

const formSchema = z.object({
  name: z.string().min(1, "Task name is required"),
  epicId: z.string(),
  pic: z.string().min(1, "PIC is required (select TBD if not yet decided)"),
  status: z.string().min(1, "Status is required"),
  md: z.number().min(1, "MD must be at least 1"),
  startDate: z.string().min(1, "Start Date is required"),
});

type FormValues = z.infer<typeof formSchema>;

export function TaskDialog({ 
  taskToEdit, 
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  fromTimeline = false,
}: { 
  taskToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void,
  fromTimeline?: boolean,
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { data: epics = [] } = useCollection<any>("timelineEpics");
  const { data: pics = [] } = useCollection<any>("timelinePics");
  const { data: allTasks = [] } = useCollection<any>("timelineTasks");
  const { data: holidays = [] } = useCollection<any>("timelineHolidays");

  const { mutateAsync: addTask, isPending: isAdding } = useAddDocument("timelineTasks");
  const { mutateAsync: updateTask, isPending: isUpdating } = useUpdateDocument("timelineTasks");

  const [mode, setMode] = useState<"create" | "backlog">("create");
  const [selectedBacklogId, setSelectedBacklogId] = useState<string>("");
  const [isTbdDate, setIsTbdDate] = useState(false);

  // Overlap confirmation states
  const [showOverlapConfirm, setShowOverlapConfirm] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<FormValues | null>(null);
  const [activeOverlapData, setActiveOverlapData] = useState<OverlapResult | null>(null);

  // Filter tasks that do not have an epic assigned (Backlog items)
  const backlogTasks = useMemo(() => {
    return allTasks.filter((t: any) => !t.epicId || t.epicId === "");
  }, [allTasks]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      epicId: "",
      pic: "TBD",
      status: "TODO",
      md: 1,
      startDate: new Date().toISOString().split("T")[0],
    },
  });

  useEffect(() => {
    if (open) {
      setShowOverlapConfirm(false);
      setPendingSubmitData(null);
      setActiveOverlapData(null);

      if (taskToEdit && taskToEdit.id) {
        // Editing an existing task
        setMode("create");
        setSelectedBacklogId("");
        form.reset({
          name: taskToEdit.name || "",
          epicId: taskToEdit.epicId || "",
          pic: taskToEdit.pic || "TBD",
          status: taskToEdit.status || "TODO",
          md: taskToEdit.md || 1,
          startDate: taskToEdit.startDate || new Date().toISOString().split("T")[0],
        });
        setIsTbdDate(taskToEdit.startDate === "TBD");
      } else {
        // Adding a new task
        if (fromTimeline) {
          setMode("backlog");
          if (backlogTasks.length > 0) {
            const first = backlogTasks[0];
            setSelectedBacklogId(first.id);
            form.reset({
              name: first.name || "",
              epicId: taskToEdit?.epicId || "",
              pic: first.pic || "TBD",
              status: first.status || "TODO",
              md: first.md || 1,
              startDate: first.startDate || new Date().toISOString().split("T")[0],
            });
            setIsTbdDate(first.startDate === "TBD");
          } else {
            setSelectedBacklogId("");
            form.reset({
              name: "",
              epicId: taskToEdit?.epicId || "",
              pic: "TBD",
              status: "TODO",
              md: 1,
              startDate: new Date().toISOString().split("T")[0],
            });
            setIsTbdDate(false);
          }
        } else {
          setMode("create");
          setSelectedBacklogId("");
          form.reset({
            name: "",
            epicId: taskToEdit?.epicId || "",
            pic: "TBD",
            status: "TODO",
            md: 1,
            startDate: new Date().toISOString().split("T")[0],
          });
          setIsTbdDate(false);
        }
      }
    }
  }, [taskToEdit, open, form, fromTimeline, backlogTasks]);

  const handleBacklogSelect = (backlogId: string) => {
    setSelectedBacklogId(backlogId);
    if (!backlogId) return;

    const chosen = backlogTasks.find((t: any) => t.id === backlogId);
    if (chosen) {
      form.setValue("name", chosen.name || "");
      if (chosen.pic) form.setValue("pic", chosen.pic);
      if (chosen.status) form.setValue("status", chosen.status);
      if (chosen.md) form.setValue("md", chosen.md);
      if (chosen.startDate) {
        form.setValue("startDate", chosen.startDate);
        setIsTbdDate(chosen.startDate === "TBD");
      }
    }
  };

  const currentTargetId = taskToEdit?.id || (mode === "backlog" ? selectedBacklogId : null);

  // Live Overlap detection based on current form values
  const watchedPic = form.watch("pic");
  const watchedStartDate = form.watch("startDate");
  const watchedMd = form.watch("md");
  const watchedName = form.watch("name");

  const liveOverlap = useMemo(() => {
    if (!open) return { hasOverlap: false, overlappingTasks: [] };
    return checkTaskOverlap(
      {
        id: currentTargetId,
        pic: watchedPic,
        startDate: isTbdDate ? "TBD" : watchedStartDate,
        md: watchedMd,
        name: watchedName,
      },
      allTasks,
      holidays,
      epics
    );
  }, [open, currentTargetId, watchedPic, isTbdDate, watchedStartDate, watchedMd, watchedName, allTasks, holidays, epics]);

  const executeSave = async (data: FormValues) => {
    try {
      const targetId = taskToEdit?.id || (mode === "backlog" ? selectedBacklogId : null);

      if (targetId) {
        // Update existing task (or assign backlog task to epic)
        await updateTask({ id: targetId, data });
      } else {
        // Create brand new task
        await addTask({ ...data, order: Date.now() });
      }
      setShowOverlapConfirm(false);
      setPendingSubmitData(null);
      setActiveOverlapData(null);
      setOpen(false);
      if (!taskToEdit) {
        form.reset();
        setSelectedBacklogId("");
      }
    } catch (error) {
      console.error(error);
    }
  };

  async function onSubmit(data: FormValues) {
    const targetId = taskToEdit?.id || (mode === "backlog" ? selectedBacklogId : null);

    // Check overlap for submitted data
    const overlapResult = checkTaskOverlap(
      {
        id: targetId,
        pic: data.pic,
        startDate: data.startDate,
        md: data.md,
        name: data.name,
      },
      allTasks,
      holidays,
      epics
    );

    if (overlapResult.hasOverlap) {
      // Prompt user with confirmation modal
      setPendingSubmitData(data);
      setActiveOverlapData(overlapResult);
      setShowOverlapConfirm(true);
      return;
    }

    // No overlap -> save directly
    await executeSave(data);
  }

  const isPending = isAdding || isUpdating;
  const isEditing = Boolean(taskToEdit && taskToEdit.id);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Task" : fromTimeline ? "Schedule Task from Backlog" : "Create New Task"}
            </DialogTitle>
          </DialogHeader>

          {/* If opened from Timeline and there are no backlog items, display banner */}
          {fromTimeline && !isEditing && backlogTasks.length === 0 ? (
            <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center space-y-3 my-2">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm text-foreground">Tidak Ada Task di Backlog</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Di menu Timeline, task harus dipilih dari backlog yang sudah dibuat di Todo Plan. Silakan buat task backlog terlebih dahulu.
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Tutup
                </Button>
                <Link href="/todo" onClick={() => setOpen(false)}>
                  <Button type="button" size="sm" className="shadow-xs">
                    Buka Todo Plan <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Mode Selector for New Task (only shown if not in timeline mode) */}
              {!isEditing && !fromTimeline && backlogTasks.length > 0 && (
                <div className="flex bg-muted/60 p-1 rounded-lg gap-1 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("create");
                      setSelectedBacklogId("");
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all",
                      mode === "create"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create New
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("backlog");
                      if (backlogTasks.length > 0 && !selectedBacklogId) {
                        handleBacklogSelect(backlogTasks[0].id);
                      }
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all",
                      mode === "backlog"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <ListPlus className="w-3.5 h-3.5 text-primary" />
                    <span>Select from Backlog</span>
                    <span className="ml-1 px-1.5 py-0.2 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                      {backlogTasks.length}
                    </span>
                  </button>
                </div>
              )}

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Backlog Dropdown if mode is backlog */}
                {(mode === "backlog" || fromTimeline) && !isEditing && (
                  <div className="space-y-2 p-3 bg-muted/30 border rounded-lg">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <ListPlus className="w-3.5 h-3.5 text-primary" /> Pilih Task dari Backlog
                    </Label>
                    <select
                      value={selectedBacklogId}
                      onChange={(e) => handleBacklogSelect(e.target.value)}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {backlogTasks.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.status || "TODO"}, {t.md || 1} MD)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Task Name (Disabled / read-only when selecting from backlog in timeline) */}
                <div className="space-y-2">
                  <Label>Task Name</Label>
                  <Input
                    {...form.register("name")}
                    placeholder="e.g., Design Database Schema"
                    disabled={mode === "backlog" || fromTimeline}
                    className={cn((mode === "backlog" || fromTimeline) && "bg-muted text-foreground font-semibold")}
                  />
                  {form.formState.errors.name && (
                    <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                  )}
                </div>

                {/* Epic Selection */}
                <div className="space-y-2">
                  <Label>Epic {fromTimeline && <span className="text-destructive">*</span>}</Label>
                  <select
                    {...form.register("epicId")}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{fromTimeline ? "Select an Epic" : "None (Backlog)"}</option>
                    {epics?.map((epic: any) => (
                      <option key={epic.id} value={epic.id}>
                        {epic.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* PIC & Status */}
                <div className="flex gap-3">
                  <div className="space-y-2 flex-1">
                    <Label>
                      PIC <span className="text-destructive">*</span>
                    </Label>
                    <select
                      {...form.register("pic")}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Select PIC</option>
                      <option value="TBD">TBD</option>
                      {pics
                        ?.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
                        .map((pic: any) => (
                          <option key={pic.id} value={pic.name}>
                            {pic.name}
                          </option>
                        ))}
                    </select>
                    {form.formState.errors.pic && (
                      <p className="text-xs text-destructive">{form.formState.errors.pic.message}</p>
                    )}
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label>Status</Label>
                    <select
                      {...form.register("status")}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="TODO">TODO</option>
                      <option value="ON PROGRESS">ON PROGRESS</option>
                      <option value="IN REVIEW">IN REVIEW</option>
                      <option value="DONE">DONE</option>
                      <option value="WON'T DO">WON'T DO</option>
                    </select>
                  </div>
                </div>

                {/* Start Date & MD */}
                <div className="flex gap-3">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center justify-between h-[20px]">
                      <Label>Start Date</Label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id="tbdDate"
                          checked={isTbdDate}
                          onChange={(e) => {
                            setIsTbdDate(e.target.checked);
                            if (e.target.checked) form.setValue("startDate", "TBD");
                            else form.setValue("startDate", new Date().toISOString().split("T")[0]);
                          }}
                          className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <label htmlFor="tbdDate" className="text-xs cursor-pointer text-muted-foreground select-none">
                          TBD
                        </label>
                      </div>
                    </div>
                    {!isTbdDate ? (
                      <Input type="date" {...form.register("startDate")} />
                    ) : (
                      <Input type="text" value="TBD" disabled className="bg-muted text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="h-[20px] flex items-end">
                      <Label>MD (Man Days)</Label>
                    </div>
                    <Input type="number" min="1" {...form.register("md", { valueAsNumber: true })} />
                  </div>
                </div>

                {/* Live Overlap Warning Preview inside Dialog */}
                {liveOverlap.hasOverlap && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1.5 animate-in fade-in-50">
                    <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>Peringatan Jadwal Overlap ({liveOverlap.overlappingTasks.length} task)</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      PIC <strong>{watchedPic}</strong> memiliki task lain yang bertabrakan di tanggal ini:
                    </p>
                    <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                      {liveOverlap.overlappingTasks.map((ot) => (
                        <div key={ot.id} className="bg-background/80 dark:bg-muted/40 p-1.5 rounded border border-amber-500/20 text-[11px] flex justify-between items-center gap-2">
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground truncate block">{ot.name}</span>
                            <span className="text-[10px] text-muted-foreground">{ot.startDate} s/d {ot.endDateStr} ({ot.md} MD)</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 bg-muted text-muted-foreground uppercase">
                            {ot.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-3 gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending
                      ? "Saving..."
                      : isEditing
                      ? "Save Changes"
                      : fromTimeline || mode === "backlog"
                      ? "Assign Backlog to Epic"
                      : "Save Task"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Overlap Confirmation Dialog */}
      <Dialog open={showOverlapConfirm} onOpenChange={setShowOverlapConfirm}>
        <DialogContent className="sm:max-w-[480px] border-amber-500/30">
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2 mx-auto sm:mx-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              Konfirmasi Overlap Jadwal PIC
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              PIC <strong className="text-foreground">{pendingSubmitData?.pic}</strong> sudah memiliki {activeOverlapData?.overlappingTasks.length} task lain pada rentang tanggal tersebut.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <p className="text-xs font-semibold text-foreground">Daftar task yang bertabrakan:</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {activeOverlapData?.overlappingTasks.map((ot) => (
                <div key={ot.id} className="p-2.5 rounded-lg bg-muted/40 border border-border/80 flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground truncate">{ot.name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 bg-primary/10 text-primary">
                      {ot.epicName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      {ot.startDate} s/d {ot.endDateStr}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {ot.md} MD
                    </span>
                    <span className="font-medium text-foreground">
                      [{ot.status}]
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Apakah Anda ingin tetap menugaskan task ini kepada <strong>{pendingSubmitData?.pic}</strong>?
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowOverlapConfirm(false);
              }}
              disabled={isPending}
            >
              Ubah Jadwal
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
              onClick={() => {
                if (pendingSubmitData) {
                  executeSave(pendingSubmitData);
                }
              }}
              disabled={isPending}
            >
              {isPending ? "Menyimpan..." : "Tetap Assign & Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
