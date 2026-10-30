"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "@/firebase/config";
import { Project } from "@/types/project";
import { useCollection, useAddDocument, useUpdateDocument, useDeleteDocument } from "@/hooks/use-firestore";
import { DEFAULT_TASK_STATUSES } from "@/hooks/use-task-statuses";

import { useAuth } from "@/components/auth-context";

interface ProjectContextType {
  projects: Project[];
  activeProject: Project | null;
  activeProjectId: string | null;
  setActiveProjectId: (id: string) => void;
  isLoading: boolean;
  createProject: (data: Omit<Project, "id">) => Promise<string | undefined>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  isItemInActiveProject: (itemProjectId?: string) => boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = "planner_active_project_id";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { data: rawProjects, isLoading } = useCollection<Project>("projects");
  const { mutateAsync: addProject } = useAddDocument("projects");
  const { mutateAsync: updateProjectDoc } = useUpdateDocument("projects");
  const { mutateAsync: deleteProjectDoc } = useDeleteDocument("projects");
  const { mutateAsync: addStatusDoc } = useAddDocument("timelineStatuses");

  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const hasSelfHealedRef = useRef(false);

  // Safely get user info if AuthProvider is present
  let isSuperAdmin = false;
  let currentUser: any = null;
  try {
    const auth = useAuth();
    isSuperAdmin = auth.isSuperAdmin;
    currentUser = auth.currentUser;
  } catch {
    // default to superAdmin/unrestricted only if outside AuthProvider
    isSuperAdmin = true;
  }

  // Normalize projects list sorted by creation or default first, filtered by user project assignments
  const projects = useMemo(() => {
    if (!rawProjects) return [];
    const filtered = isSuperAdmin
      ? rawProjects
      : rawProjects.filter((p) => {
          if (!currentUser || !Array.isArray(currentUser.projectIds)) return false;
          return currentUser.projectIds.includes(p.id);
        });

    return [...filtered].sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [rawProjects, isSuperAdmin, currentUser]);

  // System-level default project reference (for backward compatibility of untagged legacy items)
  const defaultProject = useMemo(() => {
    if (!rawProjects || rawProjects.length === 0) return null;
    return rawProjects.find((p) => p.isDefault) || rawProjects[0];
  }, [rawProjects]);

  // Self-Healing Migration: Automatically backfill legacy documents created before multi-project support
  useEffect(() => {
    if (!defaultProject?.id || hasSelfHealedRef.current) return;
    if (typeof window !== "undefined" && sessionStorage.getItem("planner_legacy_migrated")) {
      hasSelfHealedRef.current = true;
      return;
    }

    hasSelfHealedRef.current = true;

    const performSelfHealing = async () => {
      try {
        const collectionsToCheck = [
          "timelineTasks",
          "timelineEpics",
          "bugReports",
          "weeklyReports",
          "timelinePics",
          "secretKeys",
        ];
        let anyMigrated = false;

        for (const colName of collectionsToCheck) {
          const colRef = collection(db, colName);
          const snap = await getDocs(colRef);
          const unassignedDocs: string[] = [];

          snap.forEach((d) => {
            const data = d.data();
            if (!data.projectId || !data.projectId.trim()) {
              unassignedDocs.push(d.id);
            }
          });

          if (unassignedDocs.length > 0) {
            anyMigrated = true;
            // Write in batches (max 400 per batch as per Firestore limits)
            const batchSize = 400;
            for (let i = 0; i < unassignedDocs.length; i += batchSize) {
              const chunk = unassignedDocs.slice(i, i + batchSize);
              const batch = writeBatch(db);
              chunk.forEach((docId) => {
                batch.update(doc(db, colName, docId), {
                  projectId: defaultProject.id,
                });
              });
              await batch.commit();
            }
            console.log(
              `[Self-Healing] Successfully migrated ${unassignedDocs.length} legacy documents in "${colName}" to default project "${defaultProject.name}".`
            );
          }
        }

        if (anyMigrated) {
          // Invalidate TanStack query cache so all UI components immediately refresh with migrated data
          queryClient.invalidateQueries({ queryKey: ["timelineTasks"] });
          queryClient.invalidateQueries({ queryKey: ["timelineEpics"] });
          queryClient.invalidateQueries({ queryKey: ["bugReports"] });
          queryClient.invalidateQueries({ queryKey: ["weeklyReports"] });
          queryClient.invalidateQueries({ queryKey: ["timelinePics"] });
          queryClient.invalidateQueries({ queryKey: ["secretKeys"] });
        }

        if (typeof window !== "undefined") {
          sessionStorage.setItem("planner_legacy_migrated", "true");
        }
      } catch (err) {
        console.warn("[Self-Healing] Migration check skipped or failed:", err);
      }
    };

    performSelfHealing();
  }, [defaultProject?.id, defaultProject?.name, queryClient]);

  // Auto-initialize default project if collection is loaded and completely empty
  useEffect(() => {
    if (!isLoading && rawProjects && rawProjects.length === 0) {
      const initDefaultProject = async () => {
        try {
          const res: any = await addProject({
            name: "Main Project",
            key: "MAIN",
            color: "#3b82f6",
            status: "ACTIVE",
            description: "Default workspace for tasks and timeline",
            isDefault: true,
          });
          if (res?.id) {
            setActiveProjectIdState(res.id);
            if (typeof window !== "undefined") {
              localStorage.setItem(LOCAL_STORAGE_KEY, res.id);
            }
            // Auto-seed default statuses for initial project
            for (const def of DEFAULT_TASK_STATUSES) {
              await addStatusDoc({
                name: def.name,
                color: def.color,
                order: def.order,
                isCompleted: Boolean(def.isCompleted),
                projectId: res.id,
              });
            }
          }
        } catch (e) {
          console.error("Failed to initialize default project:", e);
        }
      };
      initDefaultProject();
    }
  }, [isLoading, rawProjects, addProject]);

  // Synchronize active project from localStorage or fallback to first project
  useEffect(() => {
    if (projects.length > 0) {
      const savedId = typeof window !== "undefined" ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
      const matched = projects.find((p) => p.id === savedId);
      if (matched) {
        setActiveProjectIdState(matched.id);
      } else {
        // Default to first project
        setActiveProjectIdState(projects[0].id);
        if (typeof window !== "undefined") {
          localStorage.setItem(LOCAL_STORAGE_KEY, projects[0].id);
        }
      }
    }
  }, [projects]);

  const setActiveProjectId = useCallback((id: string) => {
    setActiveProjectIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_STORAGE_KEY, id);
    }
  }, []);

  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === activeProjectId) || projects[0] || null;
  }, [projects, activeProjectId]);

  const createProject = async (data: Omit<Project, "id">) => {
    const res: any = await addProject(data);
    if (res?.id) {
      setActiveProjectId(res.id);
      // Auto-seed default statuses for newly created project
      for (const def of DEFAULT_TASK_STATUSES) {
        await addStatusDoc({
          name: def.name,
          color: def.color,
          order: def.order,
          isCompleted: Boolean(def.isCompleted),
          projectId: res.id,
        });
      }
    }
    return res?.id;
  };

  const updateProject = async (id: string, data: Partial<Project>) => {
    await updateProjectDoc({ id, data });
  };

  const deleteProject = async (id: string) => {
    if (projects.length <= 1) {
      throw new Error("Cannot delete the only remaining project.");
    }
    await deleteProjectDoc(id);
    if (activeProjectId === id) {
      const remaining = projects.filter((p) => p.id !== id);
      if (remaining.length > 0) {
        setActiveProjectId(remaining[0].id);
      }
    }
  };

  /**
   * Helper: checks if an item belongs to the active project.
   * If an item has an explicit projectId, it must match the activeProject.
   * If an item has no projectId (legacy), it belongs ONLY to the system default project.
   */
  const isItemInActiveProject = useCallback((itemProjectId?: string) => {
    if (!activeProject) return false;
    const cleanId = (itemProjectId || "").trim();
    if (cleanId) {
      return cleanId === activeProject.id;
    }
    // Backward compatibility: items without projectId belong ONLY to the system default project
    if (activeProject.isDefault) return true;
    if (defaultProject && activeProject.id === defaultProject.id) return true;
    return false;
  }, [activeProject, defaultProject]);

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        activeProjectId: activeProject?.id || null,
        setActiveProjectId,
        isLoading,
        createProject,
        updateProject,
        deleteProject,
        isItemInActiveProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}
