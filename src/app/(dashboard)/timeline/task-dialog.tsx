"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAddDocument, useUpdateDocument, useCollection } from "@/hooks/use-firestore";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  epicId: z.string().min(1, "Epic is required"),
  pic: z.string().min(1, "PIC is required"),
  status: z.string().min(1, "Status is required"),
  md: z.number().min(1, "MD must be at least 1"),
  startDate: z.string().min(1, "Start Date is required"),
});

type FormValues = z.infer<typeof formSchema>;

export function TaskDialog({ 
  taskToEdit, 
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: { 
  taskToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

    const { data: epics } = useCollection<any>("timelineEpics");
  const { data: pics } = useCollection<any>("timelinePics");
  const { mutateAsync: addTask, isPending: isAdding } = useAddDocument("timelineTasks");
  const { mutateAsync: updateTask, isPending: isUpdating } = useUpdateDocument("timelineTasks");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: taskToEdit || {
      name: "",
      epicId: "",
      pic: "",
      status: "TODO",
      md: 1,
      startDate: new Date().toISOString().split("T")[0],
    },
  });

  useEffect(() => {
    if (open) {
      form.reset(taskToEdit || {
        name: "",
        epicId: epics?.[0]?.id || "",
        pic: "",
        status: "TODO",
        md: 1,
        startDate: new Date().toISOString().split("T")[0],
      });
    }
  }, [taskToEdit, open, form, epics]);

  async function onSubmit(data: FormValues) {
    try {
      if (taskToEdit?.id) {
        await updateTask({ id: taskToEdit.id, data });
      } else {
        await addTask({ ...data, order: Date.now() });
      }
      setOpen(false);
      if (!taskToEdit) form.reset();
    } catch (error) {
      console.error(error);
    }
  }

  const isPending = isAdding || isUpdating;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{taskToEdit ? "Edit Task" : "Create New Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Task Name</Label>
            <Input {...form.register("name")} placeholder="e.g., Design Database Schema" />
          </div>

          <div className="space-y-2">
            <Label>Epic</Label>
            <select 
              {...form.register("epicId")} 
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select an Epic</option>
              {epics?.map((epic) => (
                <option key={epic.id} value={epic.id}>{epic.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-4">
            <div className="space-y-2 flex-1">
              <Label>PIC</Label>
              <select 
                {...form.register("pic")} 
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select PIC</option>
                {pics?.sort((a, b) => a.name.localeCompare(b.name)).map((pic) => (
                  <option key={pic.id} value={pic.name}>{pic.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 flex-1">
              <Label>Status</Label>
              <select 
                {...form.register("status")} 
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="TODO">TODO</option>
                <option value="ON PROGRESS">ON PROGRESS</option>
                <option value="DONE">DONE</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="space-y-2 flex-1">
              <Label>Start Date</Label>
              <Input type="date" {...form.register("startDate")} />
            </div>
            <div className="space-y-2 flex-1">
              <Label>MD (Man Days)</Label>
              <Input type="number" min="1" {...form.register("md", { valueAsNumber: true })} />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
