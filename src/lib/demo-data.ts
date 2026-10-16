import { Project } from "@/types/project";
import { ProjectRole, UserProfile, createAdminPermissions, createEditorPermissions, createViewerPermissions } from "@/types/user-role";

// Helper for dynamic dates relative to current date so timeline is always active
export function getRelativeDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

export function getDefaultDemoData() {
  const proj1Id = "proj-core";
  const proj2Id = "proj-mobile";

  // 1. Projects
  const projects: Project[] = [
    {
      id: proj1Id,
      name: "Core Platform Modernization",
      key: "CPM",
      color: "#10b981",
      description: "Modernizing core architecture, performance tuning, and redesigning web experience.",
      status: "ACTIVE",
      isDefault: true,
      startDate: getRelativeDate(-30),
      endDate: getRelativeDate(60),
      shareSettings: {
        isEnabled: true,
        shareToken: "demo-share-cpm",
        isSecretsEnabled: true,
        secretsShareToken: "demo-sec-cpm",
      },
      createdAt: { seconds: Math.floor(Date.now() / 1000) - 86400 * 30 },
      updatedAt: { seconds: Math.floor(Date.now() / 1000) },
    },
    {
      id: proj2Id,
      name: "Mobile App Companion",
      key: "MAC",
      color: "#3b82f6",
      description: "Next-gen iOS and Android companion app with real-time push alerts and offline sync.",
      status: "ACTIVE",
      isDefault: false,
      startDate: getRelativeDate(-15),
      endDate: getRelativeDate(90),
      shareSettings: {
        isEnabled: true,
        shareToken: "demo-share-mac",
        isSecretsEnabled: false,
      },
      createdAt: { seconds: Math.floor(Date.now() / 1000) - 86400 * 15 },
      updatedAt: { seconds: Math.floor(Date.now() / 1000) },
    },
  ];

  // 2. Roles
  const roles: ProjectRole[] = [
    {
      id: "role-superadmin",
      name: "Super Administrator",
      description: "Full management access to all projects, user accounts, and system settings",
      isDefault: true,
      permissions: createAdminPermissions(),
    },
    {
      id: "role-contributor",
      name: "Contributor / Editor",
      description: "Can create and update project tasks, epics, timeline, and bugs",
      isDefault: true,
      permissions: createEditorPermissions(),
    },
    {
      id: "role-viewer",
      name: "Viewer (Watch Only)",
      description: "Read-only access across project views and analytics without editing privileges",
      isDefault: true,
      permissions: createViewerPermissions(),
    },
  ];

  // 3. Users
  const users: UserProfile[] = [
    {
      id: "user-admin",
      username: "admin",
      name: "Jonathan Alva (Lead)",
      password: "admin123",
      isSuperAdmin: true,
      projectIds: [proj1Id, proj2Id],
      projectRoles: {
        [proj1Id]: ["role-superadmin"],
        [proj2Id]: ["role-superadmin"],
      },
    },
    {
      id: "user-contributor",
      username: "inal.mahpud",
      name: "Inal Mahpud (Dev)",
      password: "inal123",
      isSuperAdmin: false,
      projectIds: [proj1Id, proj2Id],
      projectRoles: {
        [proj1Id]: ["role-contributor"],
        [proj2Id]: ["role-contributor"],
      },
    },
    {
      id: "user-viewer",
      username: "viewer",
      name: "Demo Guest (Viewer)",
      password: "viewer123",
      isSuperAdmin: false,
      projectIds: [proj1Id],
      projectRoles: {
        [proj1Id]: ["role-viewer"],
      },
    },
  ];

  // 4. Timeline PICs
  const timelinePics = [
    { id: "pic-1", name: "Jonathan Alva", role: "Team Lead & Architect", color: "#3b82f6", projectId: proj1Id },
    { id: "pic-2", name: "Inal Mahpud", role: "Frontend Specialist", color: "#10b981", projectId: proj1Id },
    { id: "pic-3", name: "Jane Smith", role: "UI/UX Designer", color: "#ec4899", projectId: proj1Id },
    { id: "pic-4", name: "David Kim", role: "Backend Developer", color: "#f59e0b", projectId: proj1Id },
    { id: "pic-5", name: "Alex Wong", role: "Mobile Engineer", color: "#8b5cf6", projectId: proj2Id },
  ];

  // 5. Timeline Statuses
  const timelineStatuses = [
    { id: "status-todo", name: "TODO", color: "#94a3b8", order: 1, projectId: proj1Id },
    { id: "status-prog", name: "ON PROGRESS", color: "#3b82f6", order: 2, projectId: proj1Id },
    { id: "status-rev", name: "IN REVIEW", color: "#a855f7", order: 3, projectId: proj1Id },
    { id: "status-done", name: "DONE", color: "#22c55e", order: 4, projectId: proj1Id },
    { id: "status-wont", name: "WON'T DO", color: "#ef4444", order: 5, projectId: proj1Id },
    // For project 2
    { id: "status-todo-p2", name: "TODO", color: "#94a3b8", order: 1, projectId: proj2Id },
    { id: "status-prog-p2", name: "ON PROGRESS", color: "#3b82f6", order: 2, projectId: proj2Id },
    { id: "status-done-p2", name: "DONE", color: "#22c55e", order: 3, projectId: proj2Id },
  ];

  // 6. Timeline Epics
  const timelineEpics = [
    {
      id: "epic-auth",
      name: "Authentication & User Management",
      color: "#3b82f6",
      projectId: proj1Id,
      order: 1,
    },
    {
      id: "epic-timeline",
      name: "Gantt Timeline & Interactive Planning",
      color: "#10b981",
      projectId: proj1Id,
      order: 2,
    },
    {
      id: "epic-reports",
      name: "Weekly Sprint Reporting & PDF",
      color: "#f59e0b",
      projectId: proj1Id,
      order: 3,
    },
    {
      id: "epic-mobile-core",
      name: "Mobile Core Architecture & Offline Sync",
      color: "#8b5cf6",
      projectId: proj2Id,
      order: 1,
    },
  ];

  // 7. Timeline Tasks
  const timelineTasks = [
    {
      id: "task-1",
      name: "Implement RBAC & Granular Permission Matrix",
      epicId: "epic-auth",
      pic: "Jonathan Alva",
      startDate: getRelativeDate(-12),
      md: 5,
      status: "DONE",
      projectId: proj1Id,
      order: 1,
      notes: [{ id: "n1", text: "Verified against superadmin and viewer profiles" }],
    },
    {
      id: "task-2",
      name: "Multi-Project Switcher with Workspace Isolation",
      epicId: "epic-auth",
      pic: "Inal Mahpud",
      startDate: getRelativeDate(-7),
      md: 4,
      status: "DONE",
      projectId: proj1Id,
      order: 2,
      notes: [{ id: "n2", text: "Dropdown switcher integrated into sidebar header" }],
    },
    {
      id: "task-3",
      name: "Gantt Timeline Chart with Dependency Lines",
      epicId: "epic-timeline",
      pic: "Inal Mahpud",
      startDate: getRelativeDate(-2),
      md: 6,
      status: "ON PROGRESS",
      projectId: proj1Id,
      order: 3,
      notes: [{ id: "n3", text: "Working on drag & drop duration adjustment" }],
    },
    {
      id: "task-4",
      name: "Task Collision & Overlap Detection Algorithm",
      epicId: "epic-timeline",
      pic: "Jonathan Alva",
      startDate: getRelativeDate(4),
      md: 3,
      status: "TODO",
      projectId: proj1Id,
      order: 4,
      notes: [{ id: "n4", text: "Alerts user when PIC has overlapping schedules" }],
    },
    {
      id: "task-5",
      name: "Weekly Report PDF Export Generator",
      epicId: "epic-reports",
      pic: "Jane Smith",
      startDate: getRelativeDate(1),
      md: 4,
      status: "ON PROGRESS",
      projectId: proj1Id,
      order: 5,
      notes: [{ id: "n5", text: "Clean layout with chart rendering" }],
    },
    {
      id: "task-6",
      name: "Push Notification Gateway Integration",
      epicId: "epic-mobile-core",
      pic: "Alex Wong",
      startDate: getRelativeDate(-5),
      md: 7,
      status: "ON PROGRESS",
      projectId: proj2Id,
      order: 1,
    },
  ];

  // 8. Todos (Kanban)
  const todos = [
    {
      id: "todo-1",
      title: "Review mobile UI responsive drawer on iOS",
      description: "Ensure touch gesture does not conflict with native swipe navigation.",
      priority: "HIGH",
      status: "TODO",
      projectId: proj1Id,
      category: "Frontend",
      createdAt: { seconds: Math.floor(Date.now() / 1000) - 86400 * 2 },
    },
    {
      id: "todo-2",
      title: "Optimize SVG icon bundle size",
      description: "Tree-shake lucide-react icons in production bundle.",
      priority: "MEDIUM",
      status: "IN_PROGRESS",
      projectId: proj1Id,
      category: "Performance",
      createdAt: { seconds: Math.floor(Date.now() / 1000) - 86400 * 3 },
    },
    {
      id: "todo-3",
      title: "Automate build artifact verification in CI/CD",
      description: "Add GitHub actions step to run typecheck and lint.",
      priority: "LOW",
      status: "DONE",
      projectId: proj1Id,
      category: "DevOps",
      createdAt: { seconds: Math.floor(Date.now() / 1000) - 86400 * 5 },
    },
  ];

  // 9. Weekly Reports
  const weeklyReports = [
    {
      id: "report-w41",
      title: "Sprint 41 Progress & Milestone Review",
      weekNumber: 41,
      year: 2026,
      startDate: getRelativeDate(-7),
      endDate: getRelativeDate(-1),
      projectId: proj1Id,
      summary: "Completed multi-project workspace isolation and granular RBAC. Timeline chart rendering improved by 40%.",
      achievements: [
        "Delivered User & Role permission matrix",
        "Resolved save button async pending write queue",
        "Completed PIC workload allocation overview",
      ],
      blockers: [
        "Waiting for staging cloud environment SSL renewal",
      ],
      nextWeekPlan: [
        "Finalize Gantt bar drag & drop duration resizing",
        "Run end-to-end integration tests on mobile viewport",
      ],
    },
  ];

  // 10. Bug Reports
  const bugReports = [
    {
      id: "bug-1",
      title: "Safari mobile bottom navigation bar safe-area overlap",
      description: "The navigation bar needs env(safe-area-inset-bottom) padding on iPhone 16.",
      severity: "MEDIUM",
      status: "OPEN",
      pic: "Inal Mahpud",
      projectId: proj1Id,
      createdAt: { seconds: Math.floor(Date.now() / 1000) - 86400 * 1 },
    },
    {
      id: "bug-2",
      title: "CSV export special character encoding issue",
      description: "Exporting secret keys or notes with accents caused UTF-8 BOM mismatch in MS Excel.",
      severity: "LOW",
      status: "RESOLVED",
      pic: "Jonathan Alva",
      projectId: proj1Id,
      createdAt: { seconds: Math.floor(Date.now() / 1000) - 86400 * 4 },
    },
  ];

  // 11. Notes
  const notes = [
    {
      id: "note-arch",
      title: "System Architecture & Roadmap 2026",
      content: "<h2>Planner Web Architecture</h2><p>This application is designed for agile sprint management, visual timeline planning, and strict RBAC isolation.</p><ul><li><strong>State Management:</strong> TanStack Query + Reactive Local Cache</li><li><strong>Design Tokens:</strong> TailwindCSS v4 with sleek dark mode</li><li><strong>Security:</strong> Granular permissions per project workspace</li></ul>",
      category: "Architecture",
      isPinned: true,
      projectId: proj1Id,
      createdAt: { seconds: Math.floor(Date.now() / 1000) - 86400 * 10 },
    },
    {
      id: "note-guidelines",
      title: "Git Workflow & Branching Guidelines",
      content: "<p>Always branch off <code>main</code> using <code>feature/</code> or <code>fix/</code> prefix. Keep commits atomic and informative. Run build check before pushing to origin.</p>",
      category: "Standard",
      isPinned: false,
      projectId: proj1Id,
      createdAt: { seconds: Math.floor(Date.now() / 1000) - 86400 * 8 },
    },
  ];

  // 12. Secret Keys
  const secretKeys = [
    {
      id: "sec-1",
      key: "API_GATEWAY_URL",
      value: "https://api-gateway.coreplatform.internal/v2",
      description: "Internal production API gateway endpoint",
      category: "Backend",
      projectId: proj1Id,
    },
    {
      id: "sec-2",
      key: "STRIPE_PUBLIC_TOKEN",
      value: "pk_test_51MzDemoKeyExampleString827364",
      description: "Payment gateway integration token (sandbox mode)",
      category: "Payment",
      projectId: proj1Id,
    },
    {
      id: "sec-3",
      key: "JWT_SECRET_EXPIRY",
      value: "604800",
      description: "Token session duration in seconds (7 days)",
      category: "Auth",
      projectId: proj1Id,
    },
  ];

  // 13. App Settings
  const appSettings = [
    {
      id: "menu",
      hiddenMenus: [],
    },
  ];

  return {
    projects,
    roles,
    users,
    timelinePics,
    timelineStatuses,
    timelineEpics,
    timelineTasks,
    todos,
    weeklyReports,
    bugReports,
    notes,
    secretKeys,
    appSettings,
  };
}
