"use client";

import { useEffect, useState } from "react";
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

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

type FormValues = z.infer<typeof formSchema>;

export function EpicDialog({ 
  epicToEdit, 
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: { 
  epicToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { mutateAsync: addEpic, isPending: isAdding } = useAddDocument("timelineEpics");
  const { mutateAsync: updateEpic, isPending: isUpdating } = useUpdateDocument("timelineEpics");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: epicToEdit || { name: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset(epicToEdit || { name: "" });
    }
  }, [epicToEdit, open, form]);

  async function onSubmit(data: FormValues) {
    try {
      if (epicToEdit?.id) {
        await updateEpic({ id: epicToEdit.id, data });
      } else {
        await addEpic({ ...data, order: Date.now() }); // Using timestamp as default order for new items at bottom
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{epicToEdit ? "Edit Epic" : "Create New Epic"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Epic Name</Label>
            <Input {...form.register("name")} placeholder="e.g., Auth Module Revamp" />
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Epic"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
