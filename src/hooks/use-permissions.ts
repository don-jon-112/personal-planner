"use client";

import { useMemo, useCallback } from "react";
import { useAuth } from "@/components/auth-context";
import { useProject } from "@/components/project-context";
import { useCollection } from "@/hooks/use-firestore";
import { ProjectRole, PermissionKey } from "@/types/user-role";

export function usePermissions() {
  const { currentUser, isSuperAdmin } = useAuth();
  const { activeProject } = useProject();
  const { data: allRoles = [] } = useCollection<ProjectRole>("roles");

  // Determine active project's assigned roles for current user
  const activeProjectRoles = useMemo<ProjectRole[]>(() => {
    if (isSuperAdmin || !currentUser || !activeProject) return [];
    
    const assignedRoleIds = currentUser.projectRoles?.[activeProject.id] || [];
    if (!assignedRoleIds.length) return [];

    return allRoles.filter((r) => assignedRoleIds.includes(r.id));
  }, [isSuperAdmin, currentUser, activeProject, allRoles]);

  // All assigned roles across any of the user's projects (used for global menus & fallback)
  const allUserRoles = useMemo<ProjectRole[]>(() => {
    if (isSuperAdmin || !currentUser || !currentUser.projectRoles) return [];
    const allAssignedIds = Array.from(new Set(Object.values(currentUser.projectRoles).flat()));
    if (!allAssignedIds.length) return [];
    return allRoles.filter((r) => allAssignedIds.includes(r.id));
  }, [isSuperAdmin, currentUser, allRoles]);

  /**
   * Check if user can view a menu / feature
   */
  const canView = useCallback(
    (featureKey: PermissionKey | string): boolean => {
      if (isSuperAdmin) return true;
      if (!currentUser) return false;

      // Special pages restricted to Super Admin
      if (featureKey === "settings" || featureKey === "users-roles") {
        return Boolean(currentUser.isSuperAdmin);
      }

      // If active project has assigned roles for this user, check them
      if (activeProjectRoles.length > 0) {
        return activeProjectRoles.some((role) => {
          const perm = role.permissions?.[featureKey];
          return perm ? perm.canView : false;
        });
      }

      // If active project is selected but no specific role doc matched yet
      if (activeProject) {
        // Fallback: if user is assigned to this project, default to view-only
        return currentUser.projectIds?.includes(activeProject.id) ?? false;
      }

      // If no active project is resolved yet (loading or global view):
      // Check if ANY assigned role across user's projects grants view permission
      if (allUserRoles.length > 0) {
        return allUserRoles.some((role) => {
          const perm = role.permissions?.[featureKey];
          return perm ? perm.canView : false;
        });
      }

      // Fallback: if user belongs to at least one project, allow view
      return (currentUser.projectIds?.length ?? 0) > 0;
    },
    [isSuperAdmin, currentUser, activeProjectRoles, activeProject, allUserRoles]
  );

  /**
   * Check if user can edit / create items in a menu / feature
   */
  const canEdit = useCallback(
    (featureKey: PermissionKey | string): boolean => {
      if (isSuperAdmin) return true;
      if (!currentUser) return false;

      if (featureKey === "settings" || featureKey === "users-roles") {
        return Boolean(currentUser.isSuperAdmin);
      }

      if (activeProjectRoles.length === 0) return false;

      return activeProjectRoles.some((role) => {
        const perm = role.permissions?.[featureKey];
        return perm ? perm.canEdit : false;
      });
    },
    [isSuperAdmin, currentUser, activeProjectRoles]
  );

  /**
   * Check if user can delete items in a menu / feature
   */
  const canDelete = useCallback(
    (featureKey: PermissionKey | string): boolean => {
      if (isSuperAdmin) return true;
      if (!currentUser) return false;

      if (featureKey === "settings" || featureKey === "users-roles") {
        return Boolean(currentUser.isSuperAdmin);
      }

      if (activeProjectRoles.length === 0) return false;

      return activeProjectRoles.some((role) => {
        const perm = role.permissions?.[featureKey];
        return perm ? perm.canDelete : false;
      });
    },
    [isSuperAdmin, currentUser, activeProjectRoles]
  );

  /**
   * Check if user is in "Watch Only" (view allowed, but edit denied)
   */
  const isReadOnly = useCallback(
    (featureKey: PermissionKey | string): boolean => {
      return canView(featureKey) && !canEdit(featureKey);
    },
    [canView, canEdit]
  );

  return {
    currentUser,
    isSuperAdmin,
    activeProjectRoles,
    canView,
    canEdit,
    canDelete,
    isReadOnly,
  };
}
