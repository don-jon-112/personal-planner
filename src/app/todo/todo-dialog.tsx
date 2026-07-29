"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAddDocument, useUpdateDocument } from "@/hooks/use-firestore";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
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
import { Plus } from "lucide-react";

const formSchema = z.object({
  task: z.string().min(1, "Task is required"),
  description: z.string().optional(),
  priority: z.enum(["High", "Medium", "Low"]),
  status: z.enum(["Todo", "Doing", "Done", "Cancelled"]),
  deadline: z.string().optional(),
  tags: z.string().optional(),
});

type TodoFormValues = z.infer<typeof formSchema>;

export function TodoDialog({ 
  todoToEdit, 
  children,
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: { 
  todoToEdit?: any, 
  children?: React.ReactNode,
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { mutateAsync: addTodo, isPending: isAdding } = useAddDocument("todos");
  const { mutateAsync: updateTodo, isPending: isUpdating } = useUpdateDocument("todos");

  const defaultValues = {
    task: "",
    description: "",
    priority: "Medium" as const,
    status: "Todo" as const,
    deadline: "",
    tags: "",
  };

  const form = useForm<TodoFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: todoToEdit || defaultValues,
  });

  // Reset form when todoToEdit changes
  useEffect(() => {
    if (todoToEdit) {
      form.reset({
        task: todoToEdit.task || "",
        description: todoToEdit.description || "",
        priority: todoToEdit.priority || "Medium",
        status: todoToEdit.status || "Todo",
        deadline: todoToEdit.deadline || "",
        tags: todoToEdit.tags || "",
      });
    } else {
      form.reset(defaultValues);
    }
  }, [todoToEdit, form]);

  async function onSubmit(data: TodoFormValues) {
    try {
      if (todoToEdit?.id) {
        await updateTodo({ id: todoToEdit.id, data });
      } else {
        await addTodo({ ...data, orderIndex: Date.now() });
      }
      setOpen(false);
      if (!todoToEdit) form.reset();
    } catch (error) {
      console.error(error);
    }
  }

  const isPending = isAdding || isUpdating;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{todoToEdit ? "Edit Todo" : "Create New Todo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task">Task Name</Label>
            <Input id="task" {...form.register("task")} />
            {form.formState.errors.task && (
              <p className="text-sm text-red-500">{form.formState.errors.task.message}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...form.register("description")} />
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
                  <SelectItem value="Todo">Todo</SelectItem>
                  <SelectItem value="Doing">Doing</SelectItem>
                  <SelectItem value="Done">Done</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deadline">Deadline</Label>
              <Input type="date" id="deadline" {...form.register("deadline")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input id="tags" placeholder="e.g. Work, Urgent" {...form.register("tags")} />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Todo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
