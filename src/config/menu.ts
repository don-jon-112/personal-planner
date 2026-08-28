import { 
  LayoutDashboard, 
  CalendarDays, 
  CheckSquare, 
  FileText, 
  Bug, 
  CalendarClock
} from "lucide-react";

export const menuItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Weekly Report", href: "/weekly-report", icon: CalendarDays },
  { name: "Todo Plan", href: "/todo", icon: CheckSquare },
  { name: "Notes", href: "/notes", icon: FileText },
  { name: "Timeline", href: "/timeline", icon: CalendarClock },
  { name: "Bug & Report", href: "/bugs", icon: Bug },
];
