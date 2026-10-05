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

      // If user has no roles in active project, check if they belong to project
      if (activeProjectRoles.length === 0) {
        // Fallback: if user is assigned to this project, default to view-only
        return currentUser.projectIds?.includes(activeProject?.id || "") ?? false;
      }

      // Check if ANY assigned role grants view permission
      return activeProjectRoles.some((role) => {
        const perm = role.permissions?.[featureKey];
        return perm ? perm.canView : false;
      });
    },
    [isSuperAdmin, currentUser, activeProjectRoles, activeProject]
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
