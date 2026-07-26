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
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  summary: z.string().min(1, "Summary is required"),
  priority: z.enum(["High", "Medium", "Low"]),
  status: z.enum(["Open", "In Progress", "Resolved", "Closed"]),
  pic: z.string().optional(),
  details: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function BugDialog({ 
  bugToEdit, 
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: { 
  bugToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { mutateAsync: addBug, isPending: isAdding } = useAddDocument("bugReports");
  const { mutateAsync: updateBug, isPending: isUpdating } = useUpdateDocument("bugReports");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: bugToEdit || {
      summary: "",
      priority: "Medium",
      status: "Open",
      pic: "",
      details: "",
    },
  });

  async function onSubmit(data: FormValues) {
    try {
      if (bugToEdit?.id) {
        await updateBug({ id: bugToEdit.id, data });
      } else {
        await addBug(data);
      }
      setOpen(false);
      if (!bugToEdit) form.reset();
    } catch (error) {
      console.error(error);
    }
  }

  const isPending = isAdding || isUpdating;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{bugToEdit ? "Edit Bug Report" : "Report New Bug"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Summary</Label>
            <Input {...form.register("summary")} placeholder="Brief description of the bug" />
          </div>
          
          <div className="space-y-2">
            <Label>Details / Steps to reproduce</Label>
            <Textarea {...form.register("details")} rows={4} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select 
                onValueChange={(val) => form.setValue("priority", val as any)} 
                defaultValue={form.getValues("priority")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
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
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>PIC / Assigned To</Label>
            <Input {...form.register("pic")} placeholder="e.g. Frontend Team, John" />
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Bug Report"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
