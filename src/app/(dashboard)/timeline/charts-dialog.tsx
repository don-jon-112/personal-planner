"use client";

import React, { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface ChartsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: any[];
  pics?: any[];
}

const COLORS = ["#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7", "#ec4899", "#14b8a6"];
const STATUS_COLORS: Record<string, string> = {
  "TODO": "#94a3b8", // slate-400
  "ON PROGRESS": "#3b82f6", // blue-500
  "DONE": "#22c55e", // green-500
};

export function ChartsDialog({ open, onOpenChange, tasks, pics = [] }: ChartsDialogProps) {
  
  // Calculate Task Status Distribution
  const statusData = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];
    
    let todoCount = 0;
    let inProgressCount = 0;
    let doneCount = 0;

    tasks.forEach(t => {
      const s = t.status || "TODO";
      if (s === "TODO") todoCount++;
      else if (s === "ON PROGRESS") inProgressCount++;
      else if (s === "DONE") doneCount++;
    });

    return [
      { name: "TODO", value: todoCount, color: STATUS_COLORS["TODO"] },
      { name: "ON PROGRESS", value: inProgressCount, color: STATUS_COLORS["ON PROGRESS"] },
      { name: "DONE", value: doneCount, color: STATUS_COLORS["DONE"] },
    ].filter(d => d.value > 0);
  }, [tasks]);

  // Calculate MD by PIC Distribution
  const picData = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];

    const picMap: Record<string, number> = {};
    
    tasks.forEach(t => {
      const pic = t.pic || "Unassigned";
      const md = t.md || 0;
      picMap[pic] = (picMap[pic] || 0) + md;
    });

    const result = Object.keys(picMap).map((picName, index) => {
      const definedPic = pics.find(p => p.name === picName);
      return {
        name: picName,
        value: picMap[picName],
        color: definedPic?.color || COLORS[index % COLORS.length]
      };
    }).sort((a, b) => b.value - a.value); // sort by highest MD

    return result;
  }, [tasks, pics]);

  // Calculate MD by PIC per Month
  const picMonthData = useMemo(() => {
    if (!tasks || tasks.length === 0) return { data: [], pics: [] };

    const monthMap: Record<string, Record<string, number>> = {};
    const uniquePics = new Set<string>();

    tasks.forEach(t => {
      const pic = t.pic || "Unassigned";
      const md = t.md || 0;
      if (!md) return; // ignore 0 MD

      let monthKey = "Unknown";
      if (t.startDate) {
        const date = new Date(t.startDate);
        if (!isNaN(date.getTime())) {
          monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
      }

      if (!monthMap[monthKey]) monthMap[monthKey] = {};
      monthMap[monthKey][pic] = (monthMap[monthKey][pic] || 0) + md;
      uniquePics.add(pic);
    });

    // Convert to array and sort chronologically
    const result = Object.keys(monthMap).map(monthKey => {
      return {
        month: monthKey,
        sortDate: monthKey === "Unknown" ? 0 : new Date(monthKey).getTime(),
        ...monthMap[monthKey]
      };
    }).sort((a, b) => a.sortDate - b.sortDate);

    return { 
      data: result, 
      pics: Array.from(uniquePics) 
    };
  }, [tasks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Timeline Analytics</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
          
          {/* Status Chart */}
          <div className="flex flex-col items-center p-4 bg-muted/30 rounded-xl border">
            <h3 className="font-semibold mb-4 text-center">Task Status Distribution</h3>
            {statusData.length > 0 ? (
              <div className="w-full h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">No tasks available</div>
            )}
          </div>

          {/* PIC Workload Chart */}
          <div className="flex flex-col items-center p-4 bg-muted/30 rounded-xl border">
            <h3 className="font-semibold mb-4 text-center">Workload by PIC (MD)</h3>
            {picData.length > 0 ? (
              <div className="w-full h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={picData}
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius={80}
                      dataKey="value"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    >
                      {picData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any) => [`${value} MD`, 'Workload']}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">No workload available</div>
            )}
          </div>

          {/* Monthly Workload Chart */}
          <div className="flex flex-col items-center p-4 bg-muted/30 rounded-xl border md:col-span-2">
            <h3 className="font-semibold mb-4 text-center">Monthly Workload by PIC (MD)</h3>
            {picMonthData.data.length > 0 ? (
              <div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={picMonthData.data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip 
                      formatter={(value: any) => [`${value} MD`]}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      cursor={{fill: 'currentColor', opacity: 0.05}}
                    />
                    <Legend verticalAlign="bottom" height={36}/>
                    {picMonthData.pics.map((picName, index) => {
                      const definedPic = pics.find(p => p.name === picName);
                      const color = definedPic?.color || COLORS[index % COLORS.length];
                      return (
                        <Bar key={picName} dataKey={picName} stackId="a" fill={color} />
                      );
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">No monthly workload available</div>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
