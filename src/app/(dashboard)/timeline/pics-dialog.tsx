"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAddDocument, useCollection, useDeleteDocument, useUpdateDocument } from "@/hooks/use-firestore";
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
  color: z.string().min(1, "Color is required"),
  showInAnalytics: z.boolean().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function PicsDialog({ 
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: { 
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { data: pics, isLoading } = useCollection<any>("timelinePics");
  const { mutateAsync: addPic, isPending: isAdding } = useAddDocument("timelinePics");
  const { mutateAsync: updatePic } = useUpdateDocument("timelinePics");
  const { mutate: deletePic } = useDeleteDocument("timelinePics");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      color: "#1ABB9C", // default primary color
      showInAnalytics: true,
    },
  });

  async function onSubmit(data: FormValues) {
    try {
      await addPic({ ...data, showInAnalytics: true });
      form.reset({
        name: "",
        color: "#1ABB9C",
      });
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage PICs</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 pt-2">
          {/* Form to add new PIC */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="border-b pb-6">
            <div className="flex gap-4 items-end">
              <div className="space-y-2 flex-1">
                <Label>PIC Name</Label>
                <Input {...form.register("name")} placeholder="e.g., Alice" />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex items-center gap-2">
                  <Input type="color" {...form.register("color")} className="w-12 h-10 p-1 cursor-pointer" />
                </div>
              </div>
              <Button type="submit" disabled={isAdding} className="h-10">
                {isAdding ? "Adding..." : "Add PIC"}
              </Button>
            </div>
          </form>

          {/* List of existing PICs */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Existing PICs</h4>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : pics?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No custom PICs defined.</p>
            ) : (
              <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {[...(pics || [])].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")).map((pic: any) => (
                  <div key={pic.id} className="flex items-center justify-between bg-muted/30 p-2 rounded border">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-6 h-6 rounded-full border shadow-sm" style={{ backgroundColor: pic.color }} />
                      <p className="text-sm font-medium truncate max-w-[150px]">{pic.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5" title="Show in Analytics">
                        <input 
                          type="checkbox" 
                          checked={pic.showInAnalytics !== false} 
                          onChange={(e) => updatePic({ id: pic.id, data: { showInAnalytics: e.target.checked } })}
                          className="cursor-pointer"
                        />
                        <span className="text-xs text-muted-foreground hidden sm:inline">Analytic</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => confirm("Delete this PIC?") && deletePic(pic.id)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
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
