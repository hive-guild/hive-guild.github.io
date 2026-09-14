const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function minutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
export function commonAvailability(entries) {
  if (!entries.length) return { status: "empty", count: 0 };
  const windows = entries.map(e => ({ start: minutes(e.earliest_start), end: minutes(e.latest_end) }));
  if (entries.some((e,i) => !Array.isArray(e.days) || !e.days.length || e.days.some(d => !dayOrder.includes(d)) ||
      !Number.isInteger(e.max_raid_days) || e.max_raid_days < 1 || windows[i].start === null || windows[i].end === null || windows[i].start >= windows[i].end))
    return { status: "incomplete", count: entries.length };
  const days = dayOrder.filter(day => entries.every(e => e.days.includes(day)));
  const start = Math.max(...windows.map(w => w.start));
  const end = Math.min(...windows.map(w => w.end));
  if (!days.length || start >= end) return { status: "none", count: entries.length };
  return { status: "available", count: entries.length, days, start: clock(start), end: clock(end), maxDays: Math.min(days.length, ...entries.map(e => e.max_raid_days)) };
}

// Compare actual overlapping intervals, keeping groups separate when members change.
export function mostAvailability(entries) {
  const windows = entries.map((entry, index) => ({
    index, days: entry.days, start: minutes(entry.earliest_start), end: minutes(entry.latest_end),
  })).filter((window) => Array.isArray(window.days) && window.days.length &&
    window.days.every((day) => dayOrder.includes(day)) &&
    window.start !== null && window.end !== null && window.start < window.end);
  const result = { status: entries.length ? "incomplete" : "empty", count: entries.length,
    excludedCount: entries.length - windows.length, availableCount: 0, slots: [] };
  for (const day of dayOrder) {
    const daily = windows.filter((window) => window.days.includes(day));
    const boundaries = [...new Set(daily.flatMap((window) => [window.start, window.end]))].sort((a, b) => a - b);
    let previous = null;
    for (let index = 0; index < boundaries.length - 1; index++) {
      const start = boundaries[index], end = boundaries[index + 1];
      const members = daily.filter((window) => window.start <= start && window.end >= end).map((window) => window.index);
      if (!members.length || members.length < result.availableCount) { previous = null; continue; }
      if (members.length > result.availableCount) {
        result.availableCount = members.length;
        result.slots = [];
        previous = null;
      }
      const group = members.join(",");
      if (previous?.group === group && previous.slot.end === clock(start)) {
        previous.slot.end = clock(end);
      } else {
        const slot = { day, start: clock(start), end: clock(end) };
        result.slots.push(slot);
        previous = { group, slot };
      }
    }
  }
  if (result.slots.length) result.status = "available";
  return result;
}
