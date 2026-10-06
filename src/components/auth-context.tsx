"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { UserProfile, ProjectRole, createAdminPermissions, createEditorPermissions, createViewerPermissions } from "@/types/user-role";
import { useCollection, useAddDocument } from "@/hooks/use-firestore";
import { SessionData, logout as serverLogout, setAuthSession } from "@/app/login/actions";
import { useRouter } from "next/navigation";

interface AuthContextType {
  currentUser: UserProfile | null;
  session: SessionData | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  loginUser: (user: UserProfile) => Promise<void>;
  logoutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_SESSION_KEY = "planner_auth_session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return null;
        }
      }
    }
    return null;
  });

  const { data: users = [], isLoading: isUsersLoading } = useCollection<UserProfile>("users");
  const { data: roles = [], isLoading: isRolesLoading } = useCollection<ProjectRole>("roles");
  const { mutateAsync: addUserDoc } = useAddDocument("users");
  const { mutateAsync: addRoleDoc } = useAddDocument("roles");

  // Keep localStorage cache of users in sync so login is always instantaneous
  useEffect(() => {
    if (users && users.length > 0) {
      try {
        localStorage.setItem("planner_cached_users", JSON.stringify(users));
      } catch (e) {
        console.warn("Failed to cache users in localStorage:", e);
      }
    }
  }, [users]);

  // Auto-seed default Super Admin if collection loaded and empty
  useEffect(() => {
    if (!isUsersLoading && users && users.length === 0) {
      const initDefaultAdmin = async () => {
        try {
          await addUserDoc({
            username: "admin",
            name: "Super Administrator",
            password: "AdminPassword2026!",
            isSuperAdmin: true,
            projectIds: [],
            projectRoles: {},
          });
        } catch (e) {
          console.error("Failed to seed default admin user:", e);
        }
      };
      initDefaultAdmin();
    }
  }, [isUsersLoading, users, addUserDoc]);

  // Auto-seed standard default roles if collection loaded and empty
  useEffect(() => {
    if (!isRolesLoading && roles && roles.length === 0) {
      const initDefaultRoles = async () => {
        try {
          await addRoleDoc({
            name: "Project Admin",
            description: "Full management access to all project features and settings",
            isDefault: true,
            permissions: createAdminPermissions(),
          });
          await addRoleDoc({
            name: "Contributor / Editor",
            description: "Can create and update project tasks, epics, timeline, and bugs",
            isDefault: true,
            permissions: createEditorPermissions(),
          });
          await addRoleDoc({
            name: "Viewer (Watch Only)",
            description: "Read-only access across project views and analytics",
            isDefault: true,
            permissions: createViewerPermissions(),
          });
        } catch (e) {
          console.error("Failed to seed default roles:", e);
        }
      };
      initDefaultRoles();
    }
  }, [isRolesLoading, roles, addRoleDoc]);

  // Resolve currentUser from users collection or synthetic session
  const currentUser = useMemo<UserProfile | null>(() => {
    if (!session) return null;
    if (session.userId === "master_admin") {
      return {
        id: "master_admin",
        username: session.username || "admin",
        name: session.name || "Master Administrator",
        password: "",
        isSuperAdmin: true,
        projectIds: [],
        projectRoles: {},
      };
    }
    const matched = users.find((u) => u.id === session.userId || u.username === session.username);
    if (matched) return matched;

    // Fallback if session exists before users load
    return {
      id: session.userId,
      username: session.username,
      name: session.name,
      password: "",
      isSuperAdmin: session.isSuperAdmin,
      projectIds: session.projectIds || [],
      projectRoles: session.projectRoles || {},
    };
  }, [session, users]);

  const isSuperAdmin = useMemo(() => {
    return Boolean(session?.isSuperAdmin || currentUser?.isSuperAdmin);
  }, [session, currentUser]);

  const loginUser = useCallback(async (user: UserProfile) => {
    const sessionData: SessionData = {
      userId: user.id,
      username: user.username,
      name: user.name,
      isSuperAdmin: Boolean(user.isSuperAdmin),
      projectIds: user.projectIds || [],
      projectRoles: user.projectRoles || {},
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(sessionData));
    }
    setSession(sessionData);
    await setAuthSession(sessionData);
  }, []);

  const logoutUser = useCallback(async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    }
    setSession(null);
    await serverLogout();
    router.push("/login");
    router.refresh();
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        session,
        isLoading: isUsersLoading || isRolesLoading,
        isSuperAdmin,
        loginUser,
        logoutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
