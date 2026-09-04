export interface Project {
  id: string;
  name: string;
  key?: string;
  description?: string;
  color?: string;
  status?: "ACTIVE" | "PLANNING" | "ON_HOLD" | "COMPLETED";
  startDate?: string;
  endDate?: string;
  createdAt?: any;
  updatedAt?: any;
  isDefault?: boolean;
  shareSettings?: ProjectShareSettings;
}

export interface ProjectShareSettings {
  isEnabled: boolean;
  shareToken: string;
  createdAt?: any;
  expiresAt?: string | null;
}

export const PROJECT_STATUSES = [
  { value: "ACTIVE", label: "Active", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  { value: "PLANNING", label: "Planning", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  { value: "ON_HOLD", label: "On Hold", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  { value: "COMPLETED", label: "Completed", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
] as const;

export const DEFAULT_PROJECT_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#8b5cf6", // Violet
  "#f59e0b", // Amber
  "#ef4444", // Rose
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#64748b", // Slate
];
