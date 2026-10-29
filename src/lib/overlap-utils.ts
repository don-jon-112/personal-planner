export function getDayStatus(date: Date, holidays: any[] = []) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  if (holidays.some((h: any) => h.date === dateStr)) return 'holiday';
  if (date.getDay() === 0 || date.getDay() === 6) return 'weekend';
  return false;
}

export function getTaskEndDate(startDate: Date, md: number, holidays: any[] = [], isOvertime: boolean = false): Date {
  let curr = new Date(startDate);
  curr.setHours(0, 0, 0, 0);
  let workingDays = 0;
  
  // Float MD rounding up for Gantt chart box filling (e.g. 0.5 MD -> 1 day box, 2.5 MD -> 3 day boxes)
  const validMd = Math.max(1, Math.ceil(Number(md) || 1));
  while (workingDays < validMd) {
    if (isOvertime || !getDayStatus(curr, holidays)) {
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

export function getTaskDateRange(
  task: { startDate?: string; md?: number; isOvertime?: boolean; overtime?: boolean },
  holidays: any[] = []
): { start: Date; end: Date; isValid: boolean } {
  if (!task.startDate || task.startDate === "TBD") {
    return { start: new Date(0), end: new Date(0), isValid: false };
  }

  const start = new Date(task.startDate);
  if (isNaN(start.getTime())) {
    return { start: new Date(0), end: new Date(0), isValid: false };
  }
  start.setHours(0, 0, 0, 0);

  const isOvertime = Boolean(task.isOvertime || task.overtime);
  const md = Math.max(1, Math.ceil(Number(task.md) || 1));
  const end = getTaskEndDate(start, md, holidays, isOvertime);
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

export interface TaskDayAllocation {
  dateStr: string;
  date: Date;
  md: number;
}

/**
 * Returns the list of working dates occupied by a task and the MD allocated to each day.
 * - If total MD <= 1, it occupies 1 day with that MD (e.g. 0.5 MD on startDate).
 * - If total MD > 1, working days are filled up to 1.0 MD per day, with the remainder on the last day.
 */
export function getTaskDailyAllocations(
  task: { startDate?: string; md?: number; isOvertime?: boolean; overtime?: boolean },
  holidays: any[] = []
): TaskDayAllocation[] {
  if (!task.startDate || task.startDate === "TBD") return [];
  const start = new Date(task.startDate);
  if (isNaN(start.getTime())) return [];
  start.setHours(0, 0, 0, 0);

  const rawMd = Number(task.md);
  const totalMd = isNaN(rawMd) || rawMd <= 0 ? 1 : rawMd;
  const isOvertime = Boolean(task.isOvertime || task.overtime);
  const numDays = Math.max(1, Math.ceil(totalMd));

  const allocations: TaskDayAllocation[] = [];
  let curr = new Date(start);
  let remainingMd = totalMd;

  while (allocations.length < numDays) {
    if (isOvertime || !getDayStatus(curr, holidays)) {
      const isLastDay = allocations.length === numDays - 1;
      const dayMd = isLastDay ? remainingMd : Math.min(1.0, remainingMd);
      const dayDate = new Date(curr);
      dayDate.setHours(0, 0, 0, 0);

      allocations.push({
        dateStr: formatDateString(dayDate),
        date: dayDate,
        md: Math.round(dayMd * 10000) / 10000,
      });
      remainingMd = Math.max(0, remainingMd - dayMd);
    }
    curr.setDate(curr.getDate() + 1);
  }

  return allocations;
}

/**
 * Check if target task will overlap with any existing tasks of the same PIC.
 * Overlap occurs if on ANY day occupied by the target task, the PIC's combined MD across tasks exceeds 1.0 MD.
 * If the daily total for that user is <= 1.0 MD, it is NOT considered an overlap.
 */
export function checkTaskOverlap(
  target: { id?: string; pic?: string; startDate?: string; md?: number; name?: string; status?: string; isOvertime?: boolean; overtime?: boolean },
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

  const targetAllocations = getTaskDailyAllocations(target, holidays);
  if (targetAllocations.length === 0) {
    return { hasOverlap: false, overlappingTasks: [] };
  }

  const epicMap = new Map<string, string>();
  epics.forEach((e: any) => {
    if (e.id) epicMap.set(e.id, e.name || "Unnamed Epic");
  });

  const targetPicLower = target.pic.trim().toLowerCase();
  const samePicTasks: {
    task: any;
    allocations: TaskDayAllocation[];
    range: { start: Date; end: Date; isValid: boolean };
  }[] = [];

  for (const t of allTasks) {
    if (target.id && t.id === target.id) continue;
    if (t.status === "WON'T DO" || t.status === "WONT DO") continue;
    if (!t.pic || t.pic.trim().toLowerCase() !== targetPicLower) continue;
    if (t.pic.toUpperCase() === "TBD") continue;
    if (!t.startDate || t.startDate === "TBD") continue;

    const tAllocations = getTaskDailyAllocations(t, holidays);
    if (tAllocations.length === 0) continue;

    const tRange = getTaskDateRange(t, holidays);
    samePicTasks.push({
      task: t,
      allocations: tAllocations,
      range: tRange,
    });
  }

  const conflictingTaskIds = new Set<string>();
  const conflicts: OverlappingTaskDetail[] = [];

  for (const targetDay of targetAllocations) {
    const tasksOnThisDay: { task: any; dayMd: number; range: { start: Date; end: Date; isValid: boolean } }[] = [];
    let dayTotalMd = targetDay.md;

    for (const item of samePicTasks) {
      const matchAlloc = item.allocations.find((a) => a.dateStr === targetDay.dateStr);
      if (matchAlloc) {
        tasksOnThisDay.push({
          task: item.task,
          dayMd: matchAlloc.md,
          range: item.range,
        });
        dayTotalMd += matchAlloc.md;
      }
    }

    // Only considered overlap if on this day the total MD exceeds 1.0 (with floating point tolerance)
    const roundedDayTotal = Math.round(dayTotalMd * 10000) / 10000;
    if (roundedDayTotal > 1.0) {
      for (const item of tasksOnThisDay) {
        if (!conflictingTaskIds.has(item.task.id)) {
          conflictingTaskIds.add(item.task.id);
          conflicts.push({
            id: item.task.id,
            name: item.task.name || "Untitled Task",
            epicId: item.task.epicId,
            epicName: epicMap.get(item.task.epicId) || "Backlog / No Epic",
            pic: item.task.pic,
            status: item.task.status || "TODO",
            startDate: item.task.startDate,
            endDateStr: formatDateString(item.range.end),
            md: Number(item.task.md) || 1,
          });
        }
      }
    }
  }

  return {
    hasOverlap: conflicts.length > 0,
    overlappingTasks: conflicts,
  };
}

/**
 * Precomputes overlaps for all tasks in the system for fast lookup.
 * Overlap occurs if on ANY day for a PIC, the combined MD across active tasks exceeds 1.0 MD.
 * If the daily total for that user is <= 1.0 MD, it is NOT considered an overlap.
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

  // Initialize all tasks with no overlap
  for (const t of allTasks) {
    if (t?.id) {
      overlapMap.set(t.id, { hasOverlap: false, overlappingTasks: [] });
    }
  }

  type ParsedTask = {
    id: string;
    task: any;
    pic: string;
    allocations: TaskDayAllocation[];
    range: { start: Date; end: Date; isValid: boolean };
  };

  const tasksByPic = new Map<string, ParsedTask[]>();

  for (const t of allTasks) {
    if (!t?.id) continue;
    if (t.status === "WON'T DO" || t.status === "WONT DO") continue;
    if (!t.pic || t.pic.trim() === "" || t.pic.toUpperCase() === "TBD") continue;
    if (!t.startDate || t.startDate === "TBD") continue;

    const allocations = getTaskDailyAllocations(t, holidays);
    if (allocations.length === 0) continue;

    const range = getTaskDateRange(t, holidays);
    const picKey = t.pic.trim().toLowerCase();

    const parsed: ParsedTask = {
      id: t.id,
      task: t,
      pic: t.pic,
      allocations,
      range,
    };

    if (!tasksByPic.has(picKey)) {
      tasksByPic.set(picKey, []);
    }
    tasksByPic.get(picKey)!.push(parsed);
  }

  const conflictsByTaskId = new Map<string, Map<string, OverlappingTaskDetail>>();

  for (const [, picTasks] of tasksByPic.entries()) {
    if (picTasks.length < 2) continue;

    // Group tasks on each date
    const dateAllocations = new Map<string, { parsed: ParsedTask; dayMd: number }[]>();

    for (const pt of picTasks) {
      for (const alloc of pt.allocations) {
        if (!dateAllocations.has(alloc.dateStr)) {
          dateAllocations.set(alloc.dateStr, []);
        }
        dateAllocations.get(alloc.dateStr)!.push({
          parsed: pt,
          dayMd: alloc.md,
        });
      }
    }

    for (const [, itemsOnDate] of dateAllocations.entries()) {
      if (itemsOnDate.length < 2) continue;

      const totalMdOnDate = itemsOnDate.reduce((sum, item) => sum + item.dayMd, 0);
      const roundedTotal = Math.round(totalMdOnDate * 10000) / 10000;

      // Overlap only if daily combined MD > 1.0
      if (roundedTotal > 1.0) {
        for (let i = 0; i < itemsOnDate.length; i++) {
          const itemA = itemsOnDate[i];
          if (!conflictsByTaskId.has(itemA.parsed.id)) {
            conflictsByTaskId.set(itemA.parsed.id, new Map());
          }
          const mapA = conflictsByTaskId.get(itemA.parsed.id)!;

          for (let j = 0; j < itemsOnDate.length; j++) {
            if (i === j) continue;
            const itemB = itemsOnDate[j];
            if (!mapA.has(itemB.parsed.id)) {
              mapA.set(itemB.parsed.id, {
                id: itemB.parsed.id,
                name: itemB.parsed.task.name || "Untitled Task",
                epicId: itemB.parsed.task.epicId,
                epicName: epicMap.get(itemB.parsed.task.epicId) || "Backlog / No Epic",
                pic: itemB.parsed.task.pic,
                status: itemB.parsed.task.status || "TODO",
                startDate: itemB.parsed.task.startDate,
                endDateStr: formatDateString(itemB.parsed.range.end),
                md: Number(itemB.parsed.task.md) || 1,
              });
            }
          }
        }
      }
    }
  }

  for (const [taskId, conflictMap] of conflictsByTaskId.entries()) {
    const conflictingTasks = Array.from(conflictMap.values());
    overlapMap.set(taskId, {
      hasOverlap: conflictingTasks.length > 0,
      overlappingTasks: conflictingTasks,
    });
  }

  return overlapMap;
}
