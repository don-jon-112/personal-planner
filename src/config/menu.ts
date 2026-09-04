import { 
  LayoutDashboard, 
  CalendarDays, 
  CheckSquare, 
  FileText, 
  Bug, 
  CalendarClock,
  FolderKanban,
  Users,
  Layers
} from "lucide-react";

export interface SubMenuItem {
  name: string;
  href: string;
  icon?: any;
}

export interface MenuItem {
  name: string;
  href?: string;
  icon: any;
  children?: SubMenuItem[];
}

export const projectMenuItems: MenuItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Weekly Report", href: "/weekly-report", icon: CalendarDays },
  {
    name: "Project Plan",
    icon: FolderKanban,
    children: [
      { name: "Task Plan", href: "/todo", icon: CheckSquare },
      { name: "Timeline", href: "/timeline", icon: CalendarClock },
      { name: "PICs", href: "/pics", icon: Users },
    ],
  },
  { name: "Bug & Report", href: "/bugs", icon: Bug },
];

export const globalMenuItems: MenuItem[] = [
  { name: "Notes", href: "/notes", icon: FileText },
  { name: "All Projects", href: "/projects", icon: Layers },
];

export const menuItems: MenuItem[] = [
  ...projectMenuItems,
  ...globalMenuItems,
];
