"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAddDocument, useCollection, useDeleteDocument } from "@/hooks/use-firestore";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  date: z.string().min(1, "Date is required"),
});

type FormValues = z.infer<typeof formSchema>;

export function HolidaysDialog({ 
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: { 
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { data: holidays, isLoading } = useCollection<any>("timelineHolidays");
  const { mutateAsync: addHoliday, isPending: isAdding } = useAddDocument("timelineHolidays");
  const { mutate: deleteHoliday } = useDeleteDocument("timelineHolidays");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      date: new Date().toISOString().split("T")[0],
    },
  });

  async function onSubmit(data: FormValues) {
    try {
      await addHoliday(data);
      form.reset();
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage Holidays</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 pt-2">
          {/* Form to add new holiday */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 border-b pb-6">
            <div className="flex gap-4 items-end">
              <div className="space-y-2 flex-1">
                <Label>Holiday Name</Label>
                <Input {...form.register("name")} placeholder="e.g., New Year" />
              </div>
              <div className="space-y-2 flex-[0.8]">
                <Label>Date</Label>
                <Input type="date" {...form.register("date")} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isAdding}>
                {isAdding ? "Adding..." : "Add Holiday"}
              </Button>
            </div>
          </form>

          {/* List of existing holidays */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Existing Holidays</h4>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : holidays?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No custom holidays defined.</p>
            ) : (
              <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {holidays?.sort((a, b) => a.date.localeCompare(b.date)).map((holiday) => (
                  <div key={holiday.id} className="flex items-center justify-between bg-muted/30 p-2 rounded border">
                    <div>
                      <p className="text-sm font-medium">{holiday.name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(holiday.date).toLocaleDateString()}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => confirm("Delete this holiday?") && deleteHoliday(holiday.id)}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
