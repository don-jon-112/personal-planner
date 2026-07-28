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
import dynamic from "next/dynamic";
import "react-quill/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill"), { ssr: false });

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  content: z.string().optional(),
  isPinned: z.boolean().default(false).optional(),
  isFavorite: z.boolean().default(false).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function NoteDialog({ 
  noteToEdit, 
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: { 
  noteToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { mutateAsync: addNote, isPending: isAdding } = useAddDocument("notes");
  const { mutateAsync: updateNote, isPending: isUpdating } = useUpdateDocument("notes");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: noteToEdit || {
      title: "",
      category: "",
      content: "",
      isPinned: false,
      isFavorite: false,
    },
  });

  async function onSubmit(data: FormValues) {
    try {
      // Ensure boolean values
      const payload = {
        ...data,
        isPinned: !!data.isPinned,
        isFavorite: !!data.isFavorite,
      };

      if (noteToEdit?.id) {
        await updateNote({ id: noteToEdit.id, data: payload });
      } else {
        await addNote(payload);
      }
      setOpen(false);
      if (!noteToEdit) form.reset();
    } catch (error) {
      console.error(error);
    }
  }

  const isPending = isAdding || isUpdating;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{noteToEdit ? "Edit Note" : "Create New Note"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input {...form.register("title")} />
          </div>
          
          <div className="space-y-2">
            <Label>Category</Label>
            <Input {...form.register("category")} placeholder="e.g. Work, Meeting, Ideas" />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <div className="bg-background rounded-md">
              <ReactQuill 
                theme="snow"
                value={form.watch("content")}
                onChange={(value) => form.setValue("content", value)}
                className="h-[200px] mb-12"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("isPinned")} />
              Pin Note
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("isFavorite")} />
              Favorite
            </label>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Note"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
