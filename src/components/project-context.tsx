"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { Project } from "@/types/project";
import { useCollection, useAddDocument, useUpdateDocument, useDeleteDocument } from "@/hooks/use-firestore";

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

  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);

  // Normalize projects list sorted by creation or default first
  const projects = useMemo(() => {
    if (!rawProjects) return [];
    return [...rawProjects].sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [rawProjects]);

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
   * If the active project is the default project (or the first project created),
   * items with undefined or null projectId will also be treated as matching for backward compatibility.
   */
  const isItemInActiveProject = useCallback((itemProjectId?: string) => {
    if (!activeProject) return true;
    if (itemProjectId) {
      return itemProjectId === activeProject.id;
    }
    // Backward compatibility: items without projectId belong to the default project
    return !!activeProject.isDefault || activeProject.id === projects[0]?.id;
  }, [activeProject, projects]);

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
