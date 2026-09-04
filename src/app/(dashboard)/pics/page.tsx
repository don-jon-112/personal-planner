"use client";

import React, { useState, useMemo } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Users, 
  Plus, 
  Search, 
  Trash2, 
  CheckSquare, 
  Clock, 
  BarChart2, 
  Edit2, 
  Check, 
  X,
  Palette
} from "lucide-react";
import { useCollection, useAddDocument, useUpdateDocument, useDeleteDocument } from "@/hooks/use-firestore";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/project-context";

const formSchema = z.object({
  name: z.string().min(1, "PIC Name is required"),
  color: z.string().min(1, "Color is required"),
  showInAnalytics: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export default function PicsPage() {
  const confirm = useConfirm();
  const { activeProject, isItemInActiveProject } = useProject();
  const { data: pics = [], isLoading: isPicsLoading } = useCollection<any>("timelinePics");
  const { data: tasks = [] } = useCollection<any>("timelineTasks");

  const { mutateAsync: addPic, isPending: isAdding } = useAddDocument("timelinePics");
  const { mutateAsync: updatePic } = useUpdateDocument("timelinePics");
  const { mutate: deletePic } = useDeleteDocument("timelinePics");

  const [searchQuery, setSearchQuery] = useState("");
  const [editingPicId, setEditingPicId] = useState<string | null>(null);
  const [editingPicName, setEditingPicName] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      color: "#1ABB9C",
      showInAnalytics: true,
    },
  });

  const projectPics = useMemo(() => {
    return pics.filter((p: any) => isItemInActiveProject(p.projectId));
  }, [pics, isItemInActiveProject]);

  const projectTasks = useMemo(() => {
    return tasks.filter((t: any) => isItemInActiveProject(t.projectId));
  }, [tasks, isItemInActiveProject]);

  const onSubmit = async (data: FormValues) => {
    try {
      await addPic({
        ...data,
        projectId: activeProject?.id || "",
        showInAnalytics: data.showInAnalytics ?? true,
      });
      form.reset({
        name: "",
        color: "#1ABB9C",
        showInAnalytics: true,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleStartRename = (pic: any) => {
    setEditingPicId(pic.id);
    setEditingPicName(pic.name);
  };

  const handleSaveRename = async (picId: string) => {
    if (editingPicName.trim() === "") return;
    try {
      await updatePic({ id: picId, data: { name: editingPicName.trim() } });
      setEditingPicId(null);
    } catch (error) {
      console.error(error);
    }
  };

  const filteredPics = useMemo(() => {
    let list = [...projectPics].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => (p.name || "").toLowerCase().includes(q));
    }
    return list;
  }, [projectPics, searchQuery]);

  return (
    <Panel className="h-full border-t-4 border-t-primary flex flex-col">
      {/* Header */}
      <PanelHeader className="flex flex-col sm:flex-row items-start justify-between border-b-0 pb-1 gap-4">
        <div className="w-full sm:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground flex items-center gap-2 flex-wrap">
            <Users className="w-6 h-6 text-primary" /> PIC Management
            {activeProject && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5 ml-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeProject.color || "#3b82f6" }} />
                {activeProject.name}
              </span>
            )}
          </PanelTitle>
          <PanelDescription className="mt-1">
            Manage Person In Charge (PIC), badge colors, and workload analytics for {activeProject?.name || "this project"}.
          </PanelDescription>
        </div>
      </PanelHeader>

      <PanelContent className="space-y-6 flex-1 overflow-auto p-6">
        {/* Top Section: Add New PIC Card */}
        <div className="bg-card border rounded-xl p-5 shadow-xs">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Add New PIC
          </h3>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="space-y-1.5 flex-1 w-full sm:w-auto">
              <Label htmlFor="picName" className="text-xs">
                PIC Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="picName"
                {...form.register("name")}
                placeholder="e.g., Alice, Bob, or Team Lead"
                className="bg-muted/30"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Palette className="w-3.5 h-3.5" /> Badge Color
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  {...form.register("color")}
                  className="w-14 h-10 p-1 cursor-pointer bg-muted/30 border rounded-md"
                  title="Pick Badge Color"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pb-2.5">
              <input
                type="checkbox"
                id="showAnalytics"
                {...form.register("showInAnalytics")}
                className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer"
              />
              <Label htmlFor="showAnalytics" className="text-xs cursor-pointer select-none">
                Show in Analytics
              </Label>
            </div>

            <Button type="submit" disabled={isAdding} className="w-full sm:w-auto h-10 shadow-xs">
              <Plus className="w-4 h-4 mr-1.5" />
              {isAdding ? "Adding..." : "Add PIC"}
            </Button>
          </form>
        </div>

        {/* Bottom Section: PICs Table */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search PIC..."
                className="pl-8 bg-muted/30 border-border"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Total PICs: <span className="font-semibold text-foreground">{projectPics.length}</span>
            </p>
          </div>

          <div className="border border-border/60 rounded-lg overflow-hidden bg-card shadow-xs">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-[80px]">Color</TableHead>
                  <TableHead>PIC Name</TableHead>
                  <TableHead>Assigned Tasks</TableHead>
                  <TableHead>Total MD</TableHead>
                  <TableHead className="w-[140px] text-center">Analytics Visibility</TableHead>
                  <TableHead className="w-[80px] text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPicsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      Loading PICs...
                    </TableCell>
                  </TableRow>
                ) : filteredPics.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <p className="text-base font-medium">No PICs found.</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Create a PIC above to start assigning tasks.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPics.map((pic: any) => {
                    const picTasks = projectTasks.filter((t: any) => t.pic === pic.name);
                    const totalTasks = picTasks.length;
                    const totalMd = picTasks.reduce((sum: number, t: any) => sum + (Number(t.md) || 0), 0);
                    const doneTasks = picTasks.filter((t: any) => t.status === "DONE").length;
                    const isEditing = editingPicId === pic.id;

                    return (
                      <TableRow key={pic.id} className="hover:bg-muted/20 transition-colors">
                        {/* Color Picker */}
                        <TableCell>
                          <input
                            type="color"
                            value={pic.color || "#1ABB9C"}
                            onChange={(e) => updatePic({ id: pic.id, data: { color: e.target.value } })}
                            title="Click to change color"
                            className="w-7 h-7 rounded-full border cursor-pointer p-0 overflow-hidden bg-transparent shrink-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full shadow-xs"
                          />
                        </TableCell>

                        {/* Name / Editable Name */}
                        <TableCell className="font-semibold">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editingPicName}
                                onChange={(e) => setEditingPicName(e.target.value)}
                                className="h-8 text-sm max-w-[200px]"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveRename(pic.id);
                                  if (e.key === "Escape") setEditingPicId(null);
                                }}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                                onClick={() => handleSaveRename(pic.id)}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:bg-muted"
                                onClick={() => setEditingPicId(null)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group/edit">
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold text-white shadow-xs"
                                style={{ backgroundColor: pic.color || "#1ABB9C" }}
                              >
                                {pic.name}
                              </span>
                              <button
                                onClick={() => handleStartRename(pic)}
                                className="opacity-0 group-hover/edit:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-1"
                                title="Edit Name"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </TableCell>

                        {/* Task Count Stats */}
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CheckSquare className="w-3.5 h-3.5 opacity-70" />
                            <span className="font-medium text-foreground">{doneTasks}</span> / {totalTasks} Tasks Done
                          </span>
                        </TableCell>

                        {/* Total MD */}
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                            <Clock className="w-3 h-3 opacity-70" />
                            <span className="font-medium text-foreground">{totalMd}</span> MD
                          </span>
                        </TableCell>

                        {/* Analytics Visibility Toggle */}
                        <TableCell className="text-center">
                          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={pic.showInAnalytics !== false}
                              onChange={(e) =>
                                updatePic({ id: pic.id, data: { showInAnalytics: e.target.checked } })
                              }
                              className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                            />
                            <span className="text-xs text-muted-foreground">
                              {pic.showInAnalytics !== false ? "Visible" : "Hidden"}
                            </span>
                          </label>
                        </TableCell>

                        {/* Delete Action */}
                        <TableCell className="text-right pr-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              const description = totalTasks > 0
                                ? `PIC "${pic.name}" memiliki ${totalTasks} task terkait. Menghapus preset PIC ini tidak akan menghapus task, namun preset PIC akan dihapus. Tetap hapus?`
                                : `Apakah Anda yakin ingin menghapus PIC "${pic.name}"?`;

                              const ok = await confirm({
                                title: "Hapus PIC?",
                                description,
                                confirmText: "Hapus PIC",
                                cancelText: "Batal",
                                variant: "destructive",
                              });

                              if (ok) {
                                deletePic(pic.id);
                              }
                            }}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            title="Delete PIC"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </PanelContent>
    </Panel>
  );
}
