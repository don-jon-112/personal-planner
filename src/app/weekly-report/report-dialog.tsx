"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAddDocument, useUpdateDocument } from "@/hooks/use-firestore";
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
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

const formSchema = z.object({
  date: z.string().min(1, "Date is required"),
  task: z.string().min(1, "Task is required"),
  team: z.string().min(1, "Team is required"),
  status: z.enum(["Planned", "In Progress", "Done", "Blocked"]),
});

type FormValues = z.infer<typeof formSchema>;

export function WeeklyReportDialog({ 
  reportToEdit, 
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: { 
  reportToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { mutateAsync: addReport, isPending: isAdding } = useAddDocument("weeklyReports");
  const { mutateAsync: updateReport, isPending: isUpdating } = useUpdateDocument("weeklyReports");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: reportToEdit || {
      date: new Date().toISOString().split("T")[0],
      task: "",
      team: "",
      status: "In Progress",
    },
  });

  async function onSubmit(data: FormValues) {
    try {
      if (reportToEdit?.id) {
        await updateReport({ id: reportToEdit.id, data });
      } else {
        await addReport(data);
      }
      setOpen(false);
      if (!reportToEdit) form.reset();
    } catch (error) {
      console.error(error);
    }
  }

  const isPending = isAdding || isUpdating;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{reportToEdit ? "Edit Report" : "Create New Report"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" {...form.register("date")} />
            </div>
            <div className="space-y-2">
              <Label>Team</Label>
              <Input {...form.register("team")} />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Task</Label>
            <Input {...form.register("task")} placeholder="Describe the task..." />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select 
              onValueChange={(val) => form.setValue("status", val as any)} 
              defaultValue={form.getValues("status")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Planned">Planned</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Done">Done</SelectItem>
                <SelectItem value="Blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Report"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
