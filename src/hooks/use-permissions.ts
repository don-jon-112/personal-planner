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

  // Determine active project's assigned roles for current user (including global scope)
  const activeProjectRoles = useMemo<ProjectRole[]>(() => {
    if (isSuperAdmin || !currentUser) return [];
    
    const projRoleIds = (activeProject ? currentUser.projectRoles?.[activeProject.id] : []) || [];
    const globalRoleIds = currentUser.projectRoles?.["_global_"] || [];
    const assignedRoleIds = Array.from(new Set([...projRoleIds, ...globalRoleIds]));
    
    if (!assignedRoleIds.length) return [];

    return allRoles.filter((r) =>
      assignedRoleIds.includes(r.id) ||
      assignedRoleIds.some((rId) => {
        const cleanRId = rId.trim().toLowerCase();
        return (
          (r.name && r.name.trim().toLowerCase() === cleanRId) ||
          r.id.toLowerCase().endsWith(`_${cleanRId}`)
        );
      })
    );
  }, [isSuperAdmin, currentUser, activeProject, allRoles]);

  // All assigned roles across any of the user's projects (used for global menus & fallback)
  const allUserRoles = useMemo<ProjectRole[]>(() => {
    if (isSuperAdmin || !currentUser || !currentUser.projectRoles) return [];
    const allAssignedIds = Array.from(new Set(Object.values(currentUser.projectRoles).flat()));
    if (!allAssignedIds.length) return [];
    return allRoles.filter((r) =>
      allAssignedIds.includes(r.id) ||
      allAssignedIds.some((rId) => {
        const cleanRId = rId.trim().toLowerCase();
        return (
          (r.name && r.name.trim().toLowerCase() === cleanRId) ||
          r.id.toLowerCase().endsWith(`_${cleanRId}`)
        );
      })
    );
  }, [isSuperAdmin, currentUser, allRoles]);

  /**
   * Check if user can view a menu / feature
   */
  const canView = useCallback(
    (featureKey: PermissionKey | string): boolean => {
      if (isSuperAdmin) return true;
      if (!currentUser) return false;

      // Special pages restricted to Super Admin
      if (featureKey === "settings" || featureKey === "users-roles" || featureKey === "assignment-logs") {
        return Boolean(currentUser.isSuperAdmin);
      }

      // 1. If active project has assigned roles for this user, check them strictly
      if (activeProjectRoles.length > 0) {
        return activeProjectRoles.some((role) => {
          const perm = role.permissions?.[featureKey];
          return perm ? Boolean(perm.canView) : false;
        });
      }

      // 2. If no active project role matched, check user's roles across all projects (for global features)
      if (allUserRoles.length > 0) {
        return allUserRoles.some((role) => {
          const perm = role.permissions?.[featureKey];
          return perm ? Boolean(perm.canView) : false;
        });
      }

      // Default: Deny access if no role explicitly grants view permission
      return false;
    },
    [isSuperAdmin, currentUser, activeProjectRoles, allUserRoles]
  );

  /**
   * Check if user can edit / create items in a menu / feature
   */
  const canEdit = useCallback(
    (featureKey: PermissionKey | string): boolean => {
      if (isSuperAdmin) return true;
      if (!currentUser) return false;

      if (featureKey === "settings" || featureKey === "users-roles" || featureKey === "assignment-logs") {
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

      if (featureKey === "settings" || featureKey === "users-roles" || featureKey === "assignment-logs") {
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
