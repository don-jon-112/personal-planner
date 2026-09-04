"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Project, PROJECT_STATUSES, DEFAULT_PROJECT_COLORS } from "@/types/project";
import { useProject } from "@/components/project-context";
import { Check } from "lucide-react";

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectToEdit?: Project | null;
}

export function ProjectDialog({ open, onOpenChange, projectToEdit }: ProjectDialogProps) {
  const { createProject, updateProject } = useProject();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [color, setColor] = useState(DEFAULT_PROJECT_COLORS[0]);
  const [status, setStatus] = useState<Project["status"]>("ACTIVE");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (projectToEdit) {
      setName(projectToEdit.name || "");
      setKey(projectToEdit.key || "");
      setColor(projectToEdit.color || DEFAULT_PROJECT_COLORS[0]);
      setStatus(projectToEdit.status || "ACTIVE");
      setStartDate(projectToEdit.startDate || "");
      setEndDate(projectToEdit.endDate || "");
      setDescription(projectToEdit.description || "");
    } else {
      setName("");
      setKey("");
      setColor(DEFAULT_PROJECT_COLORS[0]);
      setStatus("ACTIVE");
      setStartDate("");
      setEndDate("");
      setDescription("");
    }
  }, [projectToEdit, open]);

  // Auto-generate key from name if new
  const handleNameChange = (val: string) => {
    setName(val);
    if (!projectToEdit && !key) {
      const suggestedKey = val
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 5);
      if (suggestedKey) setKey(suggestedKey);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        key: key.trim().toUpperCase() || "",
        color: color || DEFAULT_PROJECT_COLORS[0],
        status: status || "ACTIVE",
        startDate: startDate || "",
        endDate: endDate || "",
        description: description.trim() || "",
      };

      if (projectToEdit) {
        await updateProject(projectToEdit.id, payload);
      } else {
        await createProject({
          ...payload,
          isDefault: false,
        });
      }
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving project:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full border border-black/10 shadow-sm"
              style={{ backgroundColor: color }}
            />
            {projectToEdit ? "Edit Project" : "Create New Project"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-4 gap-3 items-center">
            <div className="col-span-3 space-y-1.5">
              <Label htmlFor="projectName">Project Name <span className="text-destructive">*</span></Label>
              <Input
                id="projectName"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Retail Mobile App"
                required
              />
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label htmlFor="projectKey">Key / Code</Label>
              <Input
                id="projectKey"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="RMA"
                maxLength={6}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Project Color</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {DEFAULT_PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 shadow-sm border border-black/10"
                  style={{ backgroundColor: c }}
                  title={c}
                >
                  {color === c && <Check className="w-4 h-4 text-white drop-shadow-sm" />}
                </button>
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-7 h-7 p-0 border-0 rounded-full cursor-pointer overflow-hidden"
                title="Custom color"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value} className="bg-popover text-popover-foreground">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="endDate">Target End Date</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary or objective of this project..."
              rows={2}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Saving..." : projectToEdit ? "Save Changes" : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
