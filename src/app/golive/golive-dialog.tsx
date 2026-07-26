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
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  status: z.enum(["Done", "Pending", "N/A"]),
  pic: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function GoLiveDialog({ 
  itemToEdit, 
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: { 
  itemToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { mutateAsync: addItem, isPending: isAdding } = useAddDocument("goliveChecks");
  const { mutateAsync: updateItem, isPending: isUpdating } = useUpdateDocument("goliveChecks");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: itemToEdit || {
      title: "",
      category: "",
      status: "Pending",
      pic: "",
    },
  });

  async function onSubmit(data: FormValues) {
    try {
      if (itemToEdit?.id) {
        await updateItem({ id: itemToEdit.id, data });
      } else {
        await addItem(data);
      }
      setOpen(false);
      if (!itemToEdit) form.reset();
    } catch (error) {
      console.error(error);
    }
  }

  const isPending = isAdding || isUpdating;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{itemToEdit ? "Edit Checklist Item" : "Add Checklist Item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input {...form.register("title")} />
          </div>
          
          <div className="space-y-2">
            <Label>Category</Label>
            <Input {...form.register("category")} placeholder="e.g. Database, Security, Cache" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>PIC</Label>
              <Input {...form.register("pic")} placeholder="Person in Charge" />
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
                  <SelectItem value="Done">Done</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="N/A">N/A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
