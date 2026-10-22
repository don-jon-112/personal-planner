"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAddDocument, useUpdateDocument } from "@/hooks/use-firestore";
import { useProject } from "@/components/project-context";
import { useAuth } from "@/components/auth-context";
import { serverTimestamp } from "firebase/firestore";
import { FieldChange } from "@/types/user-role";
import { appendAssignmentLogToRedis } from "@/lib/cache-client";
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
  keyName: z.string().min(1, "Key Transform is required"),
  keyOriginal: z.string().optional(),
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

  const { activeProjectId, activeProject } = useProject();
  const { currentUser, session } = useAuth();
  const { mutateAsync: addSecret, isPending: isAdding } = useAddDocument("secretKeys");
  const { mutateAsync: updateSecret, isPending: isUpdating } = useUpdateDocument("secretKeys");
  const { mutateAsync: addAssignmentLog } = useAddDocument("assignmentLogs");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      keyName: "",
      keyOriginal: "",
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
          keyOriginal: secretToEdit.keyOriginal || "",
          valueSit: secretToEdit.valueSit || "",
          valueUat: secretToEdit.valueUat || "",
          valueProdAscom: secretToEdit.valueProdAscom || "",
          valueProd: secretToEdit.valueProd || "",
          existsInProd: Boolean(secretToEdit.existsInProd ?? secretToEdit.isExistInProd ?? false),
        });
      } else {
        form.reset({
          keyName: "",
          keyOriginal: "",
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
      const targetKeyName = data.keyName.trim();
      const targetKeyOriginal = (data.keyOriginal || "").trim();
      const currentUserName = currentUser?.name || session?.name || currentUser?.username || session?.username || "User";
      const currentUserId = currentUser?.id || session?.userId || "unknown";
      const currentUsername = currentUser?.username || session?.username || "-";
      const projId = activeProjectId || secretToEdit?.projectId || "_global_";
      const projName = activeProject?.name || "Global / Shared";

      const payload = {
        keyName: targetKeyName,
        keyOriginal: targetKeyOriginal,
        valueSit: data.valueSit || "",
        valueUat: data.valueUat || "",
        valueProdAscom: data.valueProdAscom || "",
        valueProd: data.valueProd || "",
        existsInProd: Boolean(data.existsInProd),
        projectId: activeProjectId || null,
      };

      if (secretToEdit?.id) {
        // Compute diff for update
        const changes: FieldChange[] = [];
        const oldKeyName = secretToEdit.keyName || secretToEdit.key || "";
        if (oldKeyName !== targetKeyName) {
          changes.push({ field: "keyName", label: "Key Transform", oldValue: oldKeyName, newValue: targetKeyName });
        }
        const oldKeyOrig = secretToEdit.keyOriginal || "";
        if (oldKeyOrig !== targetKeyOriginal) {
          changes.push({ field: "keyOriginal", label: "Key Original", oldValue: oldKeyOrig, newValue: targetKeyOriginal });
        }
        if ((secretToEdit.valueSit || "") !== (data.valueSit || "")) {
          changes.push({ field: "valueSit", label: "Value (SIT)", oldValue: secretToEdit.valueSit || "", newValue: data.valueSit || "" });
        }
        if ((secretToEdit.valueUat || "") !== (data.valueUat || "")) {
          changes.push({ field: "valueUat", label: "Value (UAT)", oldValue: secretToEdit.valueUat || "", newValue: data.valueUat || "" });
        }
        if ((secretToEdit.valueProdAscom || "") !== (data.valueProdAscom || "")) {
          changes.push({ field: "valueProdAscom", label: "Value (PROD - ASCOM)", oldValue: secretToEdit.valueProdAscom || "", newValue: data.valueProdAscom || "" });
        }
        if ((secretToEdit.valueProd || "") !== (data.valueProd || "")) {
          changes.push({ field: "valueProd", label: "Value (PROD)", oldValue: secretToEdit.valueProd || "", newValue: data.valueProd || "" });
        }
        const oldExist = Boolean(secretToEdit.existsInProd ?? secretToEdit.isExistInProd ?? false);
        const newExist = Boolean(data.existsInProd);
        if (oldExist !== newExist) {
          changes.push({ field: "existsInProd", label: "Exist in PROD", oldValue: oldExist ? "TRUE" : "FALSE", newValue: newExist ? "TRUE" : "FALSE" });
        }

        await updateSecret({ id: secretToEdit.id, data: payload });

        // Record Audit Log
        try {
          const changedLabels = changes.map((c) => c.label).join(", ");
          const logPayload = {
            category: "secret" as const,
            action: "UPDATE",
            secretAction: "UPDATE",
            secretId: secretToEdit.id,
            secretKey: targetKeyName,
            secretOriginal: targetKeyOriginal,
            projectId: projId,
            projectName: projName,
            userId: currentUserId,
            username: currentUsername,
            userName: currentUserName,
            existsInProd: newExist,
            details: changes.length > 0 ? `Mengubah field: ${changedLabels}` : `Memperbarui konfigurasi secret ${targetKeyName}`,
            changes: changes,
            claimedAt: serverTimestamp(),
            timestamp: new Date().toISOString(),
          };

          const newLogDoc = await addAssignmentLog(logPayload);
          appendAssignmentLogToRedis({
            ...logPayload,
            id: (newLogDoc as any)?.id || `log-${Date.now()}`,
          }).catch(console.warn);
        } catch (logErr) {
          console.error("Failed to record secret update audit log:", logErr);
        }
      } else {
        const newDoc = await addSecret(payload);

        // Record Audit Log
        try {
          const initialFields: FieldChange[] = [
            { field: "keyName", label: "Key Transform", oldValue: null, newValue: targetKeyName },
            ...(targetKeyOriginal ? [{ field: "keyOriginal", label: "Key Original", oldValue: null, newValue: targetKeyOriginal }] : []),
            ...(data.valueSit ? [{ field: "valueSit", label: "Value (SIT)", oldValue: null, newValue: data.valueSit }] : []),
            ...(data.valueUat ? [{ field: "valueUat", label: "Value (UAT)", oldValue: null, newValue: data.valueUat }] : []),
            ...(data.valueProdAscom ? [{ field: "valueProdAscom", label: "Value (PROD - ASCOM)", oldValue: null, newValue: data.valueProdAscom }] : []),
            ...(data.valueProd ? [{ field: "valueProd", label: "Value (PROD)", oldValue: null, newValue: data.valueProd }] : []),
            { field: "existsInProd", label: "Exist in PROD", oldValue: null, newValue: data.existsInProd ? "TRUE" : "FALSE" },
          ];

          const logPayload = {
            category: "secret" as const,
            action: "CREATE",
            secretAction: "CREATE",
            secretId: (newDoc as any)?.id || null,
            secretKey: targetKeyName,
            secretOriginal: targetKeyOriginal,
            projectId: projId,
            projectName: projName,
            userId: currentUserId,
            username: currentUsername,
            userName: currentUserName,
            existsInProd: Boolean(data.existsInProd),
            details: `Menambahkan secret key baru: ${targetKeyName}`,
            changes: initialFields,
            claimedAt: serverTimestamp(),
            timestamp: new Date().toISOString(),
          };

          const newLogDoc = await addAssignmentLog(logPayload);
          appendAssignmentLogToRedis({
            ...logPayload,
            id: (newLogDoc as any)?.id || `log-${Date.now()}`,
          }).catch(console.warn);
        } catch (logErr) {
          console.error("Failed to record secret creation audit log:", logErr);
        }
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
          {/* Key Transform */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Key Transform <span className="text-destructive">*</span></Label>
            <Input 
              {...form.register("keyName")} 
              placeholder="e.g. DATABASE_URL, API_KEY_GATEWAY, JWT_SECRET" 
              className="font-mono text-sm"
            />
            {form.formState.errors.keyName && (
              <p className="text-xs text-destructive">{form.formState.errors.keyName.message}</p>
            )}
          </div>

          {/* Key Original */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Key Original</Label>
            <Input 
              {...form.register("keyOriginal")} 
              placeholder="e.g. database.url, apiKeyGateway, or original key" 
              className="font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
            {/* Value (SIT) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Value (SIT)</Label>
              <Input 
                {...form.register("valueSit")} 
                placeholder="SIT value" 
                className="font-mono text-xs"
              />
            </div>

            {/* Value (UAT) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Value (UAT)</Label>
              <Input 
                {...form.register("valueUat")} 
                placeholder="UAT value" 
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
