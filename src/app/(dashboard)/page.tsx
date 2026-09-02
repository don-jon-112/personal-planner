"use client";

import { 
  Panel, 
  PanelContent, 
  PanelHeader, 
  PanelTitle, 
  PanelDescription 
} from "@/components/ui/panel";
import { Bug, CheckSquare, Clock, FileText } from "lucide-react";
import { useCollection } from "@/hooks/use-firestore";
import { formatDistanceToNow } from "date-fns";

export default function Home() {
  const { data: tasks } = useCollection<any>("timelineTasks");
  const { data: notes } = useCollection<any>("notes");
  const { data: bugs } = useCollection<any>("bugReports");

  const totalTasks = tasks?.length || 0;
  const inProgressTasks = tasks?.filter((t: any) => t.status === "ON PROGRESS" || t.status === "IN REVIEW" || t.status === "ON REVIEW" || t.status === "In Progress" || t.status === "In Review" || t.status === "Pending" || t.status === "Doing").length || 0;
  const totalNotes = notes?.length || 0;
  const activeBugs = bugs?.filter((b: any) => b.status !== "Closed" && b.status !== "Resolved" && b.status !== "Done").length || 0;

  const getTime = (doc: any) => {
    if (doc.createdAt?.toMillis) return doc.createdAt.toMillis();
    if (doc.createdAt?.seconds) return doc.createdAt.seconds * 1000;
    return Date.now(); // fallback for immediately added items
  };

  const activities = [
    ...(tasks || []).map((t: any) => ({ id: t.id, type: 'task', title: `Task: ${t.name || t.task}`, time: getTime(t) })),
    ...(notes || []).map((n: any) => ({ id: n.id, type: 'note', title: `Note: ${n.title}`, time: getTime(n) })),
    ...(bugs || []).map((b: any) => ({ id: b.id, type: 'bug', title: `Bug: ${b.summary}`, time: getTime(b) })),
  ].sort((a, b) => b.time - a.time).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Panel className="mb-0">
          <PanelContent className="flex items-center gap-4 py-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <CheckSquare className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Tasks</p>
              <h3 className="text-2xl font-bold text-secondary-foreground">{totalTasks}</h3>
            </div>
          </PanelContent>
        </Panel>

        <Panel className="mb-0">
          <PanelContent className="flex items-center gap-4 py-6">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">In Progress</p>
              <h3 className="text-2xl font-bold text-secondary-foreground">{inProgressTasks}</h3>
            </div>
          </PanelContent>
        </Panel>

        <Panel className="mb-0">
          <PanelContent className="flex items-center gap-4 py-6">
            <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Notes</p>
              <h3 className="text-2xl font-bold text-secondary-foreground">{totalNotes}</h3>
            </div>
          </PanelContent>
        </Panel>

        <Panel className="mb-0">
          <PanelContent className="flex items-center gap-4 py-6">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
              <Bug className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Bugs</p>
              <h3 className="text-2xl font-bold text-secondary-foreground">{activeBugs}</h3>
            </div>
          </PanelContent>
        </Panel>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <PanelHeader>
            <PanelTitle>Recent Activity</PanelTitle>
            <PanelDescription>Your latest actions and updates.</PanelDescription>
          </PanelHeader>
          <PanelContent>
            <div className="space-y-4">
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No recent activity found.</p>
              ) : (
                activities.map(activity => (
                  <div key={`${activity.type}-${activity.id}`} className="flex items-center gap-4 border-b border-border/50 pb-4 last:border-0 last:pb-0">
                    <div className={`w-2 h-2 rounded-full ${
                      activity.type === 'task' ? 'bg-primary' : 
                      activity.type === 'note' ? 'bg-yellow-500' : 'bg-destructive'
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium truncate pr-4">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(activity.time, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </PanelContent>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Quick Links</PanelTitle>
          </PanelHeader>
          <PanelContent>
            <p className="text-sm text-muted-foreground mb-4">Jump straight into your workspace.</p>
            <div className="flex flex-col gap-2">
              <a href="/todo" className="text-sm text-primary hover:underline">Go to Todo Plan &rarr;</a>
              <a href="/weekly-report" className="text-sm text-primary hover:underline">Write Weekly Report &rarr;</a>
              <a href="/bugs" className="text-sm text-primary hover:underline">Check Active Bugs &rarr;</a>
            </div>
          </PanelContent>
        </Panel>
      </div>
    </div>
  );
}
