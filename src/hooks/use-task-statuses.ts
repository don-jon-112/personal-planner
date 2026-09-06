"use client";

import { useMemo } from "react";
import { useCollection, useAddDocument, useUpdateDocument, useDeleteDocument } from "@/hooks/use-firestore";
import { useProject } from "@/components/project-context";

export interface TaskStatus {
  id: string;
  name: string;
  color: string;
  projectId?: string;
  order?: number;
  isDefault?: boolean;
}

export const DEFAULT_TASK_STATUSES: Omit<TaskStatus, "id">[] = [
  { name: "TODO", color: "#94a3b8", order: 1 },
  { name: "ON PROGRESS", color: "#3b82f6", order: 2 },
  { name: "IN REVIEW", color: "#a855f7", order: 3 },
  { name: "DONE", color: "#22c55e", order: 4 },
  { name: "WON'T DO", color: "#ef4444", order: 5 },
];

export const DEFAULT_STATUS_COLORS: Record<string, string> = {
  "TODO": "#94a3b8",
  "ON PROGRESS": "#3b82f6",
  "IN REVIEW": "#a855f7",
  "ON REVIEW": "#a855f7",
  "DONE": "#22c55e",
  "COMPLETED": "#22c55e",
  "WON'T DO": "#ef4444",
  "WONT DO": "#ef4444",
};

export function useTaskStatuses(explicitProjectId?: string) {
  const { activeProject, isItemInActiveProject } = useProject();
  const currentProjectId = explicitProjectId || activeProject?.id || "";

  const { data: allStatuses = [], isLoading, refetch } = useCollection<TaskStatus>("timelineStatuses");
  const { mutateAsync: addStatusDoc, isPending: isAdding } = useAddDocument("timelineStatuses");
  const { mutateAsync: updateStatusDoc, isPending: isUpdating } = useUpdateDocument("timelineStatuses");
  const { mutateAsync: deleteStatusDoc, isPending: isDeleting } = useDeleteDocument("timelineStatuses");

  const projectStatuses = useMemo(() => {
    const list = allStatuses.filter((s) => {
      if (explicitProjectId) {
        return s.projectId === explicitProjectId;
      }
      return isItemInActiveProject(s.projectId);
    });

    if (list.length === 0) {
      // Return default virtual statuses if none created yet
      return DEFAULT_TASK_STATUSES.map((s, index) => ({
        id: `default-${index}`,
        ...s,
        projectId: currentProjectId,
        isDefault: true,
      })) as TaskStatus[];
    }

    return [...list].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (a.name || "").localeCompare(b.name || ""));
  }, [allStatuses, explicitProjectId, isItemInActiveProject, currentProjectId]);

  const hasCustomStatuses = useMemo(() => {
    return allStatuses.some((s) => {
      if (explicitProjectId) return s.projectId === explicitProjectId;
      return isItemInActiveProject(s.projectId);
    });
  }, [allStatuses, explicitProjectId, isItemInActiveProject]);

  const getStatusColor = (statusName?: string): string => {
    if (!statusName) return DEFAULT_STATUS_COLORS["TODO"];
    const normalized = statusName.trim().toUpperCase();
    
    // Check in project custom statuses first
    const found = projectStatuses.find((s) => s.name.trim().toUpperCase() === normalized);
    if (found?.color) return found.color;

    // Fallback to default dictionary
    if (DEFAULT_STATUS_COLORS[normalized]) return DEFAULT_STATUS_COLORS[normalized];

    // Default neutral color
    return "#94a3b8";
  };

  const getStatusBadgeStyle = (statusName?: string) => {
    const color = getStatusColor(statusName);
    return {
      backgroundColor: `${color}18`, // subtle tint background
      color: color,
      borderColor: `${color}40`,
      borderWidth: "1px",
      borderStyle: "solid",
    };
  };

  const initializeDefaultStatuses = async (targetProjectId?: string) => {
    const pid = targetProjectId || currentProjectId;
    if (!pid) return;

    for (let i = 0; i < DEFAULT_TASK_STATUSES.length; i++) {
      const s = DEFAULT_TASK_STATUSES[i];
      await addStatusDoc({
        name: s.name,
        color: s.color,
        order: s.order,
        projectId: pid,
      });
    }
  };

  return {
    statuses: projectStatuses,
    hasCustomStatuses,
    isLoading,
    isAdding,
    isUpdating,
    isDeleting,
    getStatusColor,
    getStatusBadgeStyle,
    addStatus: addStatusDoc,
    updateStatus: updateStatusDoc,
    deleteStatus: deleteStatusDoc,
    initializeDefaultStatuses,
    refetch,
  };
}
