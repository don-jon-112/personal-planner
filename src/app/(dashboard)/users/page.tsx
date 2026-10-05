"use client";

import React, { useState, useMemo } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  UserCog,
  Users,
  ShieldCheck,
  Shield,
  Plus,
  Search,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  Edit2,
  FolderKanban,
  CheckSquare,
  Sparkles,
  Lock,
  Layers,
  AlertTriangle
} from "lucide-react";
import { useCollection, useAddDocument, useUpdateDocument, useDeleteDocument } from "@/hooks/use-firestore";
import { useConfirm, useAlertModal } from "@/components/confirm-dialog-provider";
import { useProject } from "@/components/project-context";
import { useAuth } from "@/components/auth-context";
import {
  UserProfile,
  ProjectRole,
  PERMISSION_FEATURES,
  createAdminPermissions,
  createEditorPermissions,
  createViewerPermissions,
  MenuPermission,
} from "@/types/user-role";
import { cn } from "@/lib/utils";

// Helper to generate a strong password
function generateStrongPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const numbers = "23456789";
  const special = "!@#$%^&*";
  const all = upper + lower + numbers + special;

  let pwd = "";
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += numbers[Math.floor(Math.random() * numbers.length)];
  pwd += special[Math.floor(Math.random() * special.length)];

  for (let i = 4; i < 12; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle
  return pwd.split("").sort(() => 0.5 - Math.random()).join("");
}

export default function UsersRolesPage() {
  const confirm = useConfirm();
  const alertModal = useAlertModal();
  const { projects } = useProject();
  const { currentUser, isSuperAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<"users" | "roles">("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  // Firestore collections
  const { data: users = [], isLoading: isUsersLoading } = useCollection<UserProfile>("users");
  const { data: roles = [], isLoading: isRolesLoading } = useCollection<ProjectRole>("roles");

  const { mutateAsync: addUser, isPending: isAddingUser } = useAddDocument("users");
  const { mutateAsync: updateUser, isPending: isUpdatingUser } = useUpdateDocument("users");
  const { mutateAsync: deleteUser } = useDeleteDocument("users");

  const { mutateAsync: addRole, isPending: isAddingRole } = useAddDocument("roles");
  const { mutateAsync: updateRole, isPending: isUpdatingRole } = useUpdateDocument("roles");
  const { mutateAsync: deleteRole } = useDeleteDocument("roles");

  // User Dialog State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userFormData, setUserFormData] = useState<{
    name: string;
    username: string;
    password: string;
    isSuperAdmin: boolean;
    projectIds: string[];
    projectRoles: Record<string, string[]>;
  }>({
    name: "",
    username: "",
    password: "",
    isSuperAdmin: false,
    projectIds: [],
    projectRoles: {},
  });
  const [showPasswordInModal, setShowPasswordInModal] = useState(true);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  // Role Dialog State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleFormData, setRoleFormData] = useState<{
    name: string;
    description: string;
    projectId: string; // "_global_" or specific projectId
    permissions: Record<string, MenuPermission>;
  }>({
    name: "",
    description: "",
    projectId: "_global_",
    permissions: createEditorPermissions(),
  });

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        (u.name || "").toLowerCase().includes(q) ||
        (u.username || "").toLowerCase().includes(q);

      if (projectFilter === "all") return matchSearch;
      if (projectFilter === "_super_") return matchSearch && u.isSuperAdmin;
      return matchSearch && (u.isSuperAdmin || u.projectIds?.includes(projectFilter));
    });
  }, [users, searchQuery, projectFilter]);

  // Filtered Roles
  const filteredRoles = useMemo(() => {
    return roles.filter((r) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        (r.name || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q);

      if (projectFilter === "all") return matchSearch;
      return matchSearch && (r.projectId === projectFilter || r.projectId === "_global_" || !r.projectId);
    });
  }, [roles, searchQuery, projectFilter]);

  // Handle open create user
  const handleOpenCreateUser = () => {
    setEditingUserId(null);
    setUserFormData({
      name: "",
      username: "",
      password: generateStrongPassword(),
      isSuperAdmin: false,
      projectIds: projects.map((p) => p.id), // default assign to existing projects
      projectRoles: {},
    });
    setShowPasswordInModal(true);
    setIsUserModalOpen(true);
  };

  // Handle open edit user
  const handleOpenEditUser = (user: UserProfile) => {
    setEditingUserId(user.id);
    setUserFormData({
      name: user.name || "",
      username: user.username || "",
      password: user.password || "",
      isSuperAdmin: Boolean(user.isSuperAdmin),
      projectIds: user.projectIds || [],
      projectRoles: user.projectRoles || {},
    });
    setShowPasswordInModal(false);
    setIsUserModalOpen(true);
  };

  // Save User
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.name.trim() || !userFormData.username.trim() || !userFormData.password.trim()) {
      await alertModal({
        title: "Validation Error",
        description: "Name, Username, and Password are required.",
        variant: "error",
      });
      return;
    }

    // Check duplicate username
    const existing = users.find(
      (u) =>
        u.username.toLowerCase() === userFormData.username.trim().toLowerCase() &&
        u.id !== editingUserId
    );
    if (existing) {
      await alertModal({
        title: "Username Exists",
        description: `The username "${userFormData.username}" is already taken. Please choose another username.`,
        variant: "error",
      });
      return;
    }

    try {
      const payload: Partial<UserProfile> = {
        name: userFormData.name.trim(),
        username: userFormData.username.trim(),
        password: userFormData.password.trim(),
        isSuperAdmin: userFormData.isSuperAdmin,
        projectIds: userFormData.projectIds,
        projectRoles: userFormData.projectRoles,
      };

      if (editingUserId) {
        await updateUser({ id: editingUserId, data: payload });
      } else {
        await addUser(payload);
      }
      setIsUserModalOpen(false);
    } catch (err: any) {
      console.error(err);
      await alertModal({
        title: "Save Failed",
        description: err.message || "Failed to save user record.",
        variant: "error",
      });
    }
  };

  // Delete User
  const handleDeleteUser = async (user: UserProfile) => {
    if (user.id === currentUser?.id || user.username === currentUser?.username) {
      await alertModal({
        title: "Cannot Delete Current User",
        description: "You cannot delete your own active account.",
        variant: "error",
      });
      return;
    }

    if (user.isSuperAdmin || user.username?.toLowerCase() === "admin") {
      await alertModal({
        title: "Super Admin Protected",
        description: "The Super Administrator account cannot be deleted under any circumstances.",
        variant: "error",
      });
      return;
    }

    const confirmed = await confirm({
      title: "Delete User?",
      description: `Are you sure you want to permanently delete user "${user.name}" (@${user.username})?`,
      confirmText: "Delete User",
      variant: "destructive",
      icon: "trash",
    });

    if (confirmed) {
      try {
        await deleteUser(user.id);
      } catch (err: any) {
        console.error(err);
        await alertModal({
          title: "Delete Failed",
          description: err.message || "Failed to delete user.",
          variant: "error",
        });
      }
    }
  };

  // Handle open create role
  const handleOpenCreateRole = () => {
    setEditingRoleId(null);
    setRoleFormData({
      name: "",
      description: "",
      projectId: "_global_",
      permissions: createEditorPermissions(),
    });
    setIsRoleModalOpen(true);
  };

  // Handle open edit role
  const handleOpenEditRole = (role: ProjectRole) => {
    setEditingRoleId(role.id);
    setRoleFormData({
      name: role.name || "",
      description: role.description || "",
      projectId: role.projectId || "_global_",
      permissions: role.permissions || createEditorPermissions(),
    });
    setIsRoleModalOpen(true);
  };

  // Save Role
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleFormData.name.trim()) {
      await alertModal({
        title: "Validation Error",
        description: "Role Name is required.",
        variant: "error",
      });
      return;
    }

    try {
      const payload: Partial<ProjectRole> = {
        name: roleFormData.name.trim(),
        description: roleFormData.description.trim(),
        projectId: roleFormData.projectId,
        permissions: roleFormData.permissions,
      };

      if (editingRoleId) {
        await updateRole({ id: editingRoleId, data: payload });
      } else {
        await addRole(payload);
      }
      setIsRoleModalOpen(false);
    } catch (err: any) {
      console.error(err);
      await alertModal({
        title: "Save Failed",
        description: err.message || "Failed to save role.",
        variant: "error",
      });
    }
  };

  // Delete Role
  const handleDeleteRole = async (role: ProjectRole) => {
    const isAssigned = users.some((u) =>
      Object.values(u.projectRoles || {}).some((roleIds) => roleIds.includes(role.id))
    );

    const description = isAssigned
      ? `Warning: This role is currently assigned to one or more users. Deleting it will remove these permissions from assigned users. Proceed?`
      : `Are you sure you want to delete role "${role.name}"?`;

    const confirmed = await confirm({
      title: "Delete Role?",
      description,
      confirmText: "Delete Role",
      variant: "destructive",
      icon: "trash",
    });

    if (confirmed) {
      try {
        await deleteRole(role.id);
      } catch (err: any) {
        console.error(err);
        await alertModal({
          title: "Delete Failed",
          description: err.message || "Failed to delete role.",
          variant: "error",
        });
      }
    }
  };

  // Copy User Credentials
  const handleCopyCredentials = (user: UserProfile) => {
    const text = `Username: ${user.username}\nPassword: ${user.password}\nName: ${user.name}`;
    navigator.clipboard.writeText(text);
    setCopiedUserId(user.id);
    setTimeout(() => setCopiedUserId(null), 2500);
  };

  // Access check
  if (!isSuperAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Panel className="max-w-md text-center p-8 border-destructive/30 bg-destructive/5">
          <div className="w-14 h-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Restricted Access</h2>
          <p className="text-sm text-muted-foreground mb-4">
            User and Role Management is reserved exclusively for the <strong>Super Administrator</strong>.
            Please sign in with administrator credentials to manage user accounts and project permissions.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6 flex-1 flex flex-col min-w-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <UserCog className="w-7 h-7 text-primary" />
            User & Role Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage users, generate passwords, and assign project-level roles and granular permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "users" ? (
            <Button onClick={handleOpenCreateUser} className="gap-2 shadow-xs">
              <Plus className="w-4 h-4" />
              <span>Add New User</span>
            </Button>
          ) : (
            <Button onClick={handleOpenCreateRole} className="gap-2 shadow-xs">
              <Plus className="w-4 h-4" />
              <span>Create New Role</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs and Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 bg-muted/60 p-1 rounded-lg border border-border w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              activeTab === "users"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="w-4 h-4" />
            <span>Users</span>
            <span className="ml-1 text-xs px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-bold">
              {users.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("roles")}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              activeTab === "roles"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Shield className="w-4 h-4" />
            <span>Roles & Permissions</span>
            <span className="ml-1 text-xs px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-bold">
              {roles.length}
            </span>
          </button>
        </div>

        {/* Search & Project Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Projects</option>
            {activeTab === "users" && <option value="_super_">Super Admins Only</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "users" ? (
        <Panel className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <PanelContent className="p-0 flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[240px]">User</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Password / Credential</TableHead>
                  <TableHead>Role & Project Assignment</TableHead>
                  <TableHead className="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p>No users found matching current filters.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenCreateUser}
                        className="mt-3 gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        Create First User
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => {
                    const initials = (user.name || user.username || "U")
                      .split(" ")
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase();

                    return (
                      <TableRow key={user.id} className="hover:bg-muted/40">
                        {/* Name & Avatar */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-foreground truncate flex items-center gap-1.5">
                                <span>{user.name}</span>
                                {user.isSuperAdmin && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.2 rounded border border-primary/20">
                                    <ShieldCheck className="w-3 h-3" />
                                    Admin
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Username */}
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded text-foreground font-mono">
                            @{user.username}
                          </code>
                        </TableCell>

                        {/* Password / Copy */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border">
                              ••••••••
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => handleCopyCredentials(user)}
                              title="Copy username & password to clipboard"
                            >
                              {copiedUserId === user.id ? (
                                <Check className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>

                        {/* Project & Roles Assignment */}
                        <TableCell>
                          {user.isSuperAdmin ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                              Full Global Access across all projects
                            </span>
                          ) : (
                            <div className="space-y-1.5 max-w-md">
                              {(user.projectIds || []).length === 0 ? (
                                <span className="text-xs text-muted-foreground italic">No projects assigned</span>
                              ) : (
                                (user.projectIds || []).map((projId) => {
                                  const proj = projects.find((p) => p.id === projId);
                                  const assignedRoleIds = user.projectRoles?.[projId] || [];
                                  const assignedRoleNames = roles
                                    .filter((r) => assignedRoleIds.includes(r.id))
                                    .map((r) => r.name);

                                  return (
                                    <div key={projId} className="flex flex-wrap items-center gap-1.5 text-xs">
                                      <span
                                        className="font-semibold px-1.5 py-0.5 rounded text-[11px] border"
                                        style={{
                                          borderColor: proj?.color ? `${proj.color}40` : "var(--border)",
                                          backgroundColor: proj?.color ? `${proj.color}15` : "var(--muted)",
                                          color: proj?.color || "inherit",
                                        }}
                                      >
                                        {proj?.name || "Project"}
                                      </span>
                                      {assignedRoleNames.length > 0 ? (
                                        assignedRoleNames.map((rName, i) => (
                                          <span
                                            key={i}
                                            className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-medium"
                                          >
                                            {rName}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground italic">
                                          (No role / default viewer)
                                        </span>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEditUser(user)}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Edit user"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteUser(user)}
                              className={cn(
                                "h-8 w-8 text-muted-foreground",
                                user.isSuperAdmin || user.username?.toLowerCase() === "admin"
                                  ? "opacity-30 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground"
                                  : "hover:text-destructive hover:bg-destructive/10"
                              )}
                              title={
                                user.isSuperAdmin || user.username?.toLowerCase() === "admin"
                                  ? "Super Admin cannot be deleted"
                                  : "Delete user"
                              }
                              disabled={
                                user.id === currentUser?.id ||
                                Boolean(user.isSuperAdmin) ||
                                user.username?.toLowerCase() === "admin"
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </PanelContent>
        </Panel>
      ) : (
        <Panel className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <PanelContent className="p-0 flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Role Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Permission Summary</TableHead>
                  <TableHead className="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p>No roles defined yet.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenCreateRole}
                        className="mt-3 gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        Create New Role
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRoles.map((role) => {
                    const targetProj = projects.find((p) => p.id === role.projectId);
                    const perms = role.permissions || {};
                    const canEditCount = Object.values(perms).filter((p) => p.canEdit).length;
                    const canViewCount = Object.values(perms).filter((p) => p.canView).length;
                    const canDeleteCount = Object.values(perms).filter((p) => p.canDelete).length;

                    return (
                      <TableRow key={role.id} className="hover:bg-muted/40">
                        <TableCell>
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <Shield className="w-4 h-4 text-primary shrink-0" />
                            <span>{role.name}</span>
                          </div>
                        </TableCell>

                        <TableCell>
                          {role.projectId === "_global_" || !role.projectId ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full border border-border">
                              <Layers className="w-3 h-3" />
                              Global / All Projects
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border"
                              style={{
                                borderColor: targetProj?.color ? `${targetProj.color}40` : "var(--border)",
                                backgroundColor: targetProj?.color ? `${targetProj.color}15` : "var(--muted)",
                                color: targetProj?.color || "inherit",
                              }}
                            >
                              <FolderKanban className="w-3 h-3" />
                              {targetProj?.name || "Project"}
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {role.description || "-"}
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                              View: {canViewCount}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                              Edit: {canEditCount}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">
                              Delete: {canDeleteCount}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEditRole(role)}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Edit role permissions"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteRole(role)}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="Delete role"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </PanelContent>
        </Panel>
      )}

      {/* ================= USER CREATE/EDIT DIALOG ================= */}
      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="sm:max-w-2xl w-[calc(100vw-2rem)] max-w-full max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSaveUser}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCog className="w-5 h-5 text-primary" />
                {editingUserId ? "Edit User Account" : "Create New User"}
              </DialogTitle>
              <DialogDescription>
                Configure user credentials, generate passwords, and assign project roles.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              {/* Name & Username */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="user-name" className="text-xs font-semibold">
                    Full Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="user-name"
                    value={userFormData.name}
                    onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                    placeholder="e.g. John Doe"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-username" className="text-xs font-semibold">
                    Username <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="user-username"
                    value={userFormData.username}
                    onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                    placeholder="e.g. john.doe"
                    required
                    autoCapitalize="none"
                  />
                </div>
              </div>

              {/* Password Generator */}
              <div className="space-y-1.5 bg-muted/30 p-3.5 rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <Label htmlFor="user-password" className="text-xs font-semibold flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-primary" />
                    Account Password <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newPass = generateStrongPassword();
                      setUserFormData({ ...userFormData, password: newPass });
                      setShowPasswordInModal(true);
                    }}
                    className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate Strong Password
                  </Button>
                </div>

                <div className="relative mt-1">
                  <Input
                    id="user-password"
                    type={showPasswordInModal ? "text" : "password"}
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    placeholder="Enter or generate password"
                    required
                    className="pr-20 font-mono text-sm"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPasswordInModal(!showPasswordInModal)}
                      title={showPasswordInModal ? "Hide Password" : "Show Password"}
                    >
                      {showPasswordInModal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(userFormData.password);
                      }}
                      title="Copy Password"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Super Admin Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Super Administrator Role
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Super Admins bypass all role restrictions and have unrestricted access to all projects, user accounts, and system settings.
                  </p>
                </div>
                <Switch
                  checked={userFormData.isSuperAdmin}
                  onCheckedChange={(checked) => setUserFormData({ ...userFormData, isSuperAdmin: checked })}
                />
              </div>

              {/* Project & Roles Assignment (if not super admin) */}
              {!userFormData.isSuperAdmin && (
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Assign Projects & Roles
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Select which projects this user can access, and choose their role(s) for each project.
                    </p>
                  </div>

                  <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                    {projects.map((proj) => {
                      const isAssigned = userFormData.projectIds.includes(proj.id);
                      const currentRolesForProj = userFormData.projectRoles[proj.id] || [];

                      // Available roles for this project (project specific + global)
                      const availableRoles = roles.filter(
                        (r) => r.projectId === proj.id || r.projectId === "_global_" || !r.projectId
                      );

                      return (
                        <div
                          key={proj.id}
                          className={cn(
                            "p-3 rounded-lg border transition-colors",
                            isAssigned ? "border-primary/40 bg-accent/20" : "border-border/60 bg-muted/10 opacity-70"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isAssigned}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  let nextProjectIds = [...userFormData.projectIds];
                                  let nextProjectRoles = { ...userFormData.projectRoles };

                                  if (checked) {
                                    if (!nextProjectIds.includes(proj.id)) nextProjectIds.push(proj.id);
                                    // Default assign first available role if any
                                    if (!nextProjectRoles[proj.id] && availableRoles.length > 0) {
                                      nextProjectRoles[proj.id] = [availableRoles[0].id];
                                    }
                                  } else {
                                    nextProjectIds = nextProjectIds.filter((id) => id !== proj.id);
                                    delete nextProjectRoles[proj.id];
                                  }

                                  setUserFormData({
                                    ...userFormData,
                                    projectIds: nextProjectIds,
                                    projectRoles: nextProjectRoles,
                                  });
                                }}
                                className="rounded text-primary focus:ring-primary h-4 w-4"
                              />
                              <span style={{ color: proj.color || "inherit" }}>{proj.name}</span>
                            </label>

                            <span className="text-[11px] text-muted-foreground font-mono">
                              {proj.key || "PROJ"}
                            </span>
                          </div>

                          {/* Roles for this project */}
                          {isAssigned && (
                            <div className="mt-2.5 pt-2 border-t border-border/40 pl-6 space-y-1.5">
                              <div className="text-[11px] font-medium text-muted-foreground">
                                Roles in this project (select one or multiple):
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {availableRoles.map((role) => {
                                  const hasRole = currentRolesForProj.includes(role.id);
                                  return (
                                    <label
                                      key={role.id}
                                      className={cn(
                                        "inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer border transition-colors",
                                        hasRole
                                          ? "bg-primary text-primary-foreground border-primary font-medium"
                                          : "bg-background text-foreground border-border hover:bg-muted"
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={hasRole}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          let updated = [...currentRolesForProj];
                                          if (checked) {
                                            if (!updated.includes(role.id)) updated.push(role.id);
                                          } else {
                                            updated = updated.filter((rId) => rId !== role.id);
                                          }
                                          setUserFormData({
                                            ...userFormData,
                                            projectRoles: {
                                              ...userFormData.projectRoles,
                                              [proj.id]: updated,
                                            },
                                          });
                                        }}
                                        className="hidden"
                                      />
                                      <span>{role.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsUserModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isAddingUser || isUpdatingUser}>
                {isAddingUser || isUpdatingUser ? "Saving..." : editingUserId ? "Update User" : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= ROLE CREATE/EDIT DIALOG ================= */}
      <Dialog open={isRoleModalOpen} onOpenChange={setIsRoleModalOpen}>
        <DialogContent className="sm:max-w-[96vw] w-[calc(100vw-2rem)] max-w-full lg:max-w-[1400px] max-h-[92vh] overflow-y-auto p-6">
          <form onSubmit={handleSaveRole}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                {editingRoleId ? "Edit Role & Permissions" : "Create New Role"}
              </DialogTitle>
              <DialogDescription>
                Define role scope and configure granular View (Watch), Edit, and Delete access for each menu.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              {/* Role Name & Scope */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="role-name" className="text-xs font-semibold">
                    Role Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="role-name"
                    value={roleFormData.name}
                    onChange={(e) => setRoleFormData({ ...roleFormData, name: e.target.value })}
                    placeholder="e.g. Developer, QA Engineer, Viewer"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="role-scope" className="text-xs font-semibold">
                    Project Scope
                  </Label>
                  <select
                    id="role-scope"
                    value={roleFormData.projectId}
                    onChange={(e) => setRoleFormData({ ...roleFormData, projectId: e.target.value })}
                    className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="_global_">Global (Available in all projects)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        Project: {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="role-desc" className="text-xs font-semibold">
                  Description
                </Label>
                <Input
                  id="role-desc"
                  value={roleFormData.description}
                  onChange={(e) => setRoleFormData({ ...roleFormData, description: e.target.value })}
                  placeholder="e.g. Can view timeline and update task progress, but cannot delete epics."
                />
              </div>

              {/* Permissions Presets Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                <span className="text-xs font-semibold text-muted-foreground mr-1">Quick Presets:</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRoleFormData({ ...roleFormData, permissions: createAdminPermissions() })}
                  className="h-7 text-xs"
                >
                  Full Admin
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRoleFormData({ ...roleFormData, permissions: createEditorPermissions() })}
                  className="h-7 text-xs"
                >
                  Standard Editor
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRoleFormData({ ...roleFormData, permissions: createViewerPermissions() })}
                  className="h-7 text-xs"
                >
                  Watch Only (Viewer)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const cleared: Record<string, MenuPermission> = {};
                    for (const f of PERMISSION_FEATURES) {
                      cleared[f.key] = { canView: false, canEdit: false, canDelete: false };
                    }
                    setRoleFormData({ ...roleFormData, permissions: cleared });
                  }}
                  className="h-7 text-xs text-muted-foreground"
                >
                  Clear All
                </Button>
              </div>

              {/* Granular Permissions Table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Feature / Menu</TableHead>
                      <TableHead className="text-center w-[110px]">
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                          Watch (View)
                        </span>
                      </TableHead>
                      <TableHead className="text-center w-[110px]">
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          Can Edit
                        </span>
                      </TableHead>
                      <TableHead className="text-center w-[110px]">
                        <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                          Can Delete
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PERMISSION_FEATURES.map((feat) => {
                      const perm = roleFormData.permissions[feat.key] || {
                        canView: false,
                        canEdit: false,
                        canDelete: false,
                      };

                      const updatePerm = (field: keyof MenuPermission, val: boolean) => {
                        const next = { ...roleFormData.permissions };
                        const curr = next[feat.key] || { canView: false, canEdit: false, canDelete: false };
                        
                        // Rule: If edit or delete is enabled, view must also be true
                        let canViewVal = curr.canView;
                        if ((field === "canEdit" || field === "canDelete") && val) {
                          canViewVal = true;
                        }
                        if (field === "canView" && !val) {
                          // If view is disabled, edit and delete must also be disabled
                          next[feat.key] = { canView: false, canEdit: false, canDelete: false };
                        } else {
                          next[feat.key] = {
                            ...curr,
                            canView: canViewVal,
                            [field]: val,
                          };
                        }
                        setRoleFormData({ ...roleFormData, permissions: next });
                      };

                      return (
                        <TableRow key={feat.key} className="hover:bg-muted/20">
                          <TableCell className="py-2.5">
                            <div className="font-medium text-xs text-foreground">{feat.label}</div>
                            <div className="text-[11px] text-muted-foreground">{feat.description}</div>
                          </TableCell>

                          {/* View Checkbox */}
                          <TableCell className="text-center py-2.5">
                            <input
                              type="checkbox"
                              checked={perm.canView}
                              onChange={(e) => updatePerm("canView", e.target.checked)}
                              className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                            />
                          </TableCell>

                          {/* Edit Checkbox */}
                          <TableCell className="text-center py-2.5">
                            <input
                              type="checkbox"
                              checked={perm.canEdit}
                              onChange={(e) => updatePerm("canEdit", e.target.checked)}
                              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                            />
                          </TableCell>

                          {/* Delete Checkbox */}
                          <TableCell className="text-center py-2.5">
                            <input
                              type="checkbox"
                              checked={perm.canDelete}
                              onChange={(e) => updatePerm("canDelete", e.target.checked)}
                              className="rounded text-rose-600 focus:ring-rose-500 h-4 w-4 cursor-pointer"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRoleModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isAddingRole || isUpdatingRole}>
                {isAddingRole || isUpdatingRole ? "Saving..." : editingRoleId ? "Update Role" : "Create Role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
