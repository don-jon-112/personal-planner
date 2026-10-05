export interface MenuPermission {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export type PermissionKey =
  | "dashboard"
  | "weekly-report"
  | "todo"
  | "timeline"
  | "pics"
  | "statuses"
  | "secrets"
  | "bugs"
  | "notes"
  | "projects"
  | "users-roles"
  | "settings";

export interface PermissionFeature {
  key: PermissionKey;
  label: string;
  description: string;
  category: "project" | "global";
}

export const PERMISSION_FEATURES: PermissionFeature[] = [
  { key: "dashboard", label: "Dashboard", description: "Project overview, statistics, and progress summary", category: "project" },
  { key: "weekly-report", label: "Weekly Report", description: "Weekly sprint reports and export to PDF", category: "project" },
  { key: "todo", label: "Task Plan (TODO)", description: "Epic & task list management and kanban status", category: "project" },
  { key: "timeline", label: "Timeline (Gantt)", description: "Interactive Gantt timeline chart with dependencies", category: "project" },
  { key: "pics", label: "PICs Management", description: "Person in charge list, avatars, and allocation", category: "project" },
  { key: "statuses", label: "Task Statuses", description: "Customizable status stages and colors", category: "project" },
  { key: "secrets", label: "Secret Key Vault", description: "Environment secrets, credentials, and API keys", category: "project" },
  { key: "bugs", label: "Bug & Issue Reports", description: "Issue tracker, bug reporting, and resolution flow", category: "project" },
  { key: "notes", label: "Notes & Docs", description: "Workspace rich-text notes and documentation", category: "global" },
  { key: "projects", label: "All Projects", description: "Create, view, and configure workspaces", category: "global" },
  { key: "users-roles", label: "Users & Roles", description: "User accounts, role assignment, and permissions", category: "global" },
  { key: "settings", label: "System Settings", description: "Sync data, backup/restore, and site configs", category: "global" },
];

export interface ProjectRole {
  id: string;
  projectId?: string; // specific projectId or "_global_"
  name: string;
  description?: string;
  isDefault?: boolean;
  permissions: Record<string, MenuPermission>;
  createdAt?: any;
  updatedAt?: any;
}

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  password: string; // Plaintext or hashed password credential
  isSuperAdmin?: boolean; // Super Admin has unrestricted access to all projects and configurations
  projectIds: string[]; // List of project IDs this user belongs to
  projectRoles: Record<string, string[]>; // Map: { [projectId: string]: string[] (role IDs) }
  createdAt?: any;
  updatedAt?: any;
}

export interface AuthSession {
  userId: string;
  username: string;
  name: string;
  isSuperAdmin: boolean;
}

/**
 * Creates default permissions for full admin access
 */
export function createAdminPermissions(): Record<string, MenuPermission> {
  const perms: Record<string, MenuPermission> = {};
  for (const feat of PERMISSION_FEATURES) {
    perms[feat.key] = { canView: true, canEdit: true, canDelete: true };
  }
  return perms;
}

/**
 * Creates default permissions for editor / contributor (edit but limited delete)
 */
export function createEditorPermissions(): Record<string, MenuPermission> {
  const perms: Record<string, MenuPermission> = {};
  for (const feat of PERMISSION_FEATURES) {
    if (feat.key === "settings" || feat.key === "users-roles") {
      perms[feat.key] = { canView: false, canEdit: false, canDelete: false };
    } else if (feat.key === "secrets") {
      perms[feat.key] = { canView: true, canEdit: false, canDelete: false };
    } else {
      perms[feat.key] = { canView: true, canEdit: true, canDelete: false };
    }
  }
  return perms;
}

/**
 * Creates default permissions for viewer (watch only)
 */
export function createViewerPermissions(): Record<string, MenuPermission> {
  const perms: Record<string, MenuPermission> = {};
  for (const feat of PERMISSION_FEATURES) {
    if (feat.key === "settings" || feat.key === "users-roles" || feat.key === "secrets") {
      perms[feat.key] = { canView: false, canEdit: false, canDelete: false };
    } else {
      perms[feat.key] = { canView: true, canEdit: false, canDelete: false };
    }
  }
  return perms;
}
