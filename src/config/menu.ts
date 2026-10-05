import { 
  LayoutDashboard, 
  CalendarDays, 
  CheckSquare, 
  FileText, 
  Bug, 
  CalendarClock,
  FolderKanban,
  Users,
  Layers,
  Tag,
  Key,
  UserCog
} from "lucide-react";
import { PermissionKey } from "@/types/user-role";

export interface SubMenuItem {
  name: string;
  href: string;
  icon?: any;
  permissionKey?: PermissionKey;
}

export interface MenuItem {
  name: string;
  href?: string;
  icon: any;
  permissionKey?: PermissionKey;
  children?: SubMenuItem[];
}

export const projectMenuItems: MenuItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, permissionKey: "dashboard" },
  { name: "Weekly Report", href: "/weekly-report", icon: CalendarDays, permissionKey: "weekly-report" },
  {
    name: "Project Plan",
    icon: FolderKanban,
    children: [
      { name: "Task Plan", href: "/todo", icon: CheckSquare, permissionKey: "todo" },
      { name: "Timeline", href: "/timeline", icon: CalendarClock, permissionKey: "timeline" },
      { name: "PICs", href: "/pics", icon: Users, permissionKey: "pics" },
      { name: "Task Status", href: "/statuses", icon: Tag, permissionKey: "statuses" },
    ],
  },
  { name: "Secret Key", href: "/secrets", icon: Key, permissionKey: "secrets" },
  { name: "Bug & Report", href: "/bugs", icon: Bug, permissionKey: "bugs" },
];

export const globalMenuItems: MenuItem[] = [
  { name: "Notes", href: "/notes", icon: FileText, permissionKey: "notes" },
  { name: "All Projects", href: "/projects", icon: Layers, permissionKey: "projects" },
  { name: "Users & Roles", href: "/users", icon: UserCog, permissionKey: "users-roles" },
];

export const menuItems: MenuItem[] = [
  ...projectMenuItems,
  ...globalMenuItems,
];
