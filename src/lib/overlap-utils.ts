export function getDayStatus(date: Date, holidays: any[] = []) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  if (holidays.some((h: any) => h.date === dateStr)) return 'holiday';
  if (date.getDay() === 0 || date.getDay() === 6) return 'weekend';
  return false;
}

export function getTaskEndDate(startDate: Date, md: number, holidays: any[] = []): Date {
  let curr = new Date(startDate);
  curr.setHours(0, 0, 0, 0);
  let workingDays = 0;
  
  const validMd = Math.max(1, Number(md) || 1);
  while (workingDays < validMd) {
    if (!getDayStatus(curr, holidays)) {
      workingDays++;
    }
    if (workingDays < validMd) {
      curr.setDate(curr.getDate() + 1);
    }
  }
  return curr;
}

export interface OverlappingTaskDetail {
  id: string;
  name: string;
  epicId?: string;
  epicName?: string;
  pic: string;
  status: string;
  startDate: string;
  endDateStr: string;
  md: number;
}

export interface OverlapResult {
  hasOverlap: boolean;
  overlappingTasks: OverlappingTaskDetail[];
}

export function getTaskDateRange(task: { startDate?: string; md?: number }, holidays: any[] = []): { start: Date; end: Date; isValid: boolean } {
  if (!task.startDate || task.startDate === "TBD") {
    return { start: new Date(0), end: new Date(0), isValid: false };
  }

  const start = new Date(task.startDate);
  if (isNaN(start.getTime())) {
    return { start: new Date(0), end: new Date(0), isValid: false };
  }
  start.setHours(0, 0, 0, 0);

  const md = Math.max(1, Number(task.md) || 1);
  const end = getTaskEndDate(start, md, holidays);
  end.setHours(23, 59, 59, 999);

  return { start, end, isValid: true };
}

/**
 * Format a Date object to YYYY-MM-DD
 */
export function formatDateString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Check if target task will overlap with any existing tasks of the same PIC
 */
export function checkTaskOverlap(
  target: { id?: string; pic?: string; startDate?: string; md?: number; name?: string; status?: string },
  allTasks: any[] = [],
  holidays: any[] = [],
  epics: any[] = []
): OverlapResult {
  if (!target.pic || target.pic.trim() === "" || target.pic.toUpperCase() === "TBD") {
    return { hasOverlap: false, overlappingTasks: [] };
  }

  if (!target.startDate || target.startDate.trim() === "" || target.startDate.toUpperCase() === "TBD") {
    return { hasOverlap: false, overlappingTasks: [] };
  }

  if (target.status === "WON'T DO" || target.status === "WONT DO") {
    return { hasOverlap: false, overlappingTasks: [] };
  }

  const targetRange = getTaskDateRange(target, holidays);
  if (!targetRange.isValid) {
    return { hasOverlap: false, overlappingTasks: [] };
  }

  const epicMap = new Map<string, string>();
  epics.forEach((e: any) => {
    if (e.id) epicMap.set(e.id, e.name || "Unnamed Epic");
  });

  const conflicts: OverlappingTaskDetail[] = [];

  for (const t of allTasks) {
    // Exclude the task itself if editing
    if (target.id && t.id === target.id) continue;

    // Exclude tasks marked as WON'T DO
    if (t.status === "WON'T DO" || t.status === "WONT DO") continue;

    // Check same PIC (case-insensitive trim)
    if (!t.pic || t.pic.trim().toLowerCase() !== target.pic.trim().toLowerCase()) continue;
    if (t.pic.toUpperCase() === "TBD") continue;

    const tRange = getTaskDateRange(t, holidays);
    if (!tRange.isValid) continue;

    // Overlap condition: startA <= endB and endA >= startB
    if (targetRange.start.getTime() <= tRange.end.getTime() && targetRange.end.getTime() >= tRange.start.getTime()) {
      conflicts.push({
        id: t.id,
        name: t.name || "Untitled Task",
        epicId: t.epicId,
        epicName: epicMap.get(t.epicId) || "Backlog / No Epic",
        pic: t.pic,
        status: t.status || "TODO",
        startDate: t.startDate,
        endDateStr: formatDateString(tRange.end),
        md: Number(t.md) || 1,
      });
    }
  }

  return {
    hasOverlap: conflicts.length > 0,
    overlappingTasks: conflicts,
  };
}

/**
 * Precomputes overlaps for all tasks in the system for fast lookup
 */
export function computeAllTaskOverlaps(
  allTasks: any[] = [],
  holidays: any[] = [],
  epics: any[] = []
): Map<string, OverlapResult> {
  const overlapMap = new Map<string, OverlapResult>();
  const epicMap = new Map<string, string>();
  epics.forEach((e: any) => {
    if (e.id) epicMap.set(e.id, e.name || "Unnamed Epic");
  });

  // Filter tasks that have concrete dates & valid PIC
  const validTasks = allTasks.map(t => {
    const range = getTaskDateRange(t, holidays);
    return {
      ...t,
      range,
      isCheckable: range.isValid && t.pic && t.pic.trim() !== "" && t.pic.toUpperCase() !== "TBD"
    };
  });

  for (let i = 0; i < validTasks.length; i++) {
    const taskA = validTasks[i];
    if (!taskA.isCheckable) {
      overlapMap.set(taskA.id, { hasOverlap: false, overlappingTasks: [] });
      continue;
    }

    const conflicts: OverlappingTaskDetail[] = [];

    for (let j = 0; j < validTasks.length; j++) {
      if (i === j) continue;
      const taskB = validTasks[j];
      if (!taskB.isCheckable) continue;

      if (taskA.pic.trim().toLowerCase() === taskB.pic.trim().toLowerCase()) {
        if (taskA.range.start.getTime() <= taskB.range.end.getTime() && taskA.range.end.getTime() >= taskB.range.start.getTime()) {
          conflicts.push({
            id: taskB.id,
            name: taskB.name || "Untitled Task",
            epicId: taskB.epicId,
            epicName: epicMap.get(taskB.epicId) || "Backlog / No Epic",
            pic: taskB.pic,
            status: taskB.status || "TODO",
            startDate: taskB.startDate,
            endDateStr: formatDateString(taskB.range.end),
            md: Number(taskB.md) || 1,
          });
        }
      }
    }

    overlapMap.set(taskA.id, {
      hasOverlap: conflicts.length > 0,
      overlappingTasks: conflicts,
    });
  }

  return overlapMap;
}
