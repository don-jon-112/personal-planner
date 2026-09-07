"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAddDocument, useUpdateDocument } from "@/hooks/use-firestore";
import { useProject } from "@/components/project-context";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key } from "lucide-react";

const formSchema = z.object({
  keyName: z.string().min(1, "Key name is required"),
  valueSit: z.string().optional(),
  valueUat: z.string().optional(),
  valueProdAscom: z.string().optional(),
  valueProd: z.string().optional(),
  existsInProd: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function SecretDialog({ 
  secretToEdit, 
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: { 
  secretToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { activeProjectId } = useProject();
  const { mutateAsync: addSecret, isPending: isAdding } = useAddDocument("secretKeys");
  const { mutateAsync: updateSecret, isPending: isUpdating } = useUpdateDocument("secretKeys");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      keyName: "",
      valueSit: "",
      valueUat: "",
      valueProdAscom: "",
      valueProd: "",
      existsInProd: false,
    },
  });

  useEffect(() => {
    if (open) {
      if (secretToEdit) {
        form.reset({
          keyName: secretToEdit.keyName || secretToEdit.key || "",
          valueSit: secretToEdit.valueSit || "",
          valueUat: secretToEdit.valueUat || "",
          valueProdAscom: secretToEdit.valueProdAscom || "",
          valueProd: secretToEdit.valueProd || "",
          existsInProd: Boolean(secretToEdit.existsInProd ?? secretToEdit.isExistInProd ?? false),
        });
      } else {
        form.reset({
          keyName: "",
          valueSit: "",
          valueUat: "",
          valueProdAscom: "",
          valueProd: "",
          existsInProd: false,
        });
      }
    }
  }, [secretToEdit, open, form]);

  async function onSubmit(data: FormValues) {
    try {
      const payload = {
        keyName: data.keyName.trim(),
        valueSit: data.valueSit || "",
        valueUat: data.valueUat || "",
        valueProdAscom: data.valueProdAscom || "",
        valueProd: data.valueProd || "",
        existsInProd: Boolean(data.existsInProd),
        projectId: activeProjectId || null,
      };

      if (secretToEdit?.id) {
        await updateSecret({ id: secretToEdit.id, data: payload });
      } else {
        await addSecret(payload);
      }
      setOpen(false);
      if (!secretToEdit) form.reset();
    } catch (error) {
      console.error("Error saving secret key:", error);
    }
  }

  const isPending = isAdding || isUpdating;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[550px] w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Key className="w-5 h-5 text-primary" />
            {secretToEdit ? "Edit Secret Key" : "Add New Secret Key"}
          </DialogTitle>
          <DialogDescription>
            Store environment configuration, credentials, and keyvault values.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Key Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Key Name <span className="text-destructive">*</span></Label>
            <Input 
              {...form.register("keyName")} 
              placeholder="e.g. DATABASE_URL, API_KEY_GATEWAY, JWT_SECRET" 
              className="font-mono text-sm"
            />
            {form.formState.errors.keyName && (
              <p className="text-xs text-destructive">{form.formState.errors.keyName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
            {/* Value (SIT - ASCOM) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Value (SIT - ASCOM)</Label>
              <Input 
                {...form.register("valueSit")} 
                placeholder="SIT - ASCOM value" 
                className="font-mono text-xs"
              />
            </div>

            {/* Value (UAT - ASCOM) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Value (UAT - ASCOM)</Label>
              <Input 
                {...form.register("valueUat")} 
                placeholder="UAT - ASCOM value" 
                className="font-mono text-xs"
              />
            </div>

            {/* Value (PROD - ASCOM) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Value (PROD - ASCOM)</Label>
              <Input 
                {...form.register("valueProdAscom")} 
                placeholder="PROD - ASCOM value" 
                className="font-mono text-xs"
              />
            </div>

            {/* Value (PROD) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Value (PROD)</Label>
              <Input 
                {...form.register("valueProd")} 
                placeholder="PROD value" 
                className="font-mono text-xs"
              />
            </div>
          </div>

          {/* Exist in PROD Boolean Checkbox */}
          <div className="flex items-center space-x-2 pt-3 border-t">
            <input
              type="checkbox"
              id="existsInProd"
              {...form.register("existsInProd")}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
            />
            <Label htmlFor="existsInProd" className="text-xs font-semibold cursor-pointer select-none">
              Sudah Ada di PROD (Exists in PROD)
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : secretToEdit ? "Update Secret" : "Save Secret"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
