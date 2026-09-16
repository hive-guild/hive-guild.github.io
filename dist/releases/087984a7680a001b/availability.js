const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function minutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const days = [...dayOrder];
// Who is there when. For every entry and every day it says whether the person marked that day and
// whether their own time window still covers the raid window offered for that day. The second is what
// makes the board worth reading: a marked day is only usable when the times meet.
export function whoCanWhen(entries, slots = []) {
  const offered = new Map();
  for (const slot of Array.isArray(slots) ? slots : []) {
    const start = minutes(slot?.start);
    const end = minutes(slot?.end);
    if (start === null || end === null || start >= end) continue;
    if (!offered.has(slot.day)) offered.set(slot.day, { start, end });
  }
  return entries.map((entry, index) => {
    const start = minutes(entry.earliest_start);
    const end = minutes(entry.latest_end);
    const own = start !== null && end !== null && start < end ? { start, end } : null;
    return {
      index,
      name: entry.name,
      role: entry.role,
      cells: days.map((day) => {
        const marked = Array.isArray(entry.days) && entry.days.includes(day);
        const slot = offered.get(day);
        // Fits means: there for the day, a usable window of their own, and it covers what is offered.
        const fits = marked && Boolean(own) && Boolean(slot) && own.start <= slot.start && own.end >= slot.end;
        return { day, marked, fits };
      }),
    };
  });
}

// A raid evening is worth planning only when it lasts; a window shorter than this is no offer, however
// many people it suits.
export const RAID_WINDOW_MINUTES = 180;
// Rank the options that do not suit everybody, so the overview can offer the best few compromises
// instead of only the single largest group. A window counts when it is the overlap of exactly the
// people it names, so nobody outside the group is ever counted in.
//
// Only windows of RAID_WINDOW_MINUTES or more are considered, and the most people come first: the
// question is which evening can actually be raided, not which one is longest. Length only breaks a
// tie between windows that suit the same number of people.
//
// The candidates are the windows bounded by two of the times the participants gave, and the group of
// a window is everyone whose own window contains it. The overlap of any group is such a window - its
// edges are two members' times - so no offer is missed, and the group found here is never smaller
// than the one that window was built from. That costs a pass over the entries per candidate instead
// of one per subgroup: with 22 entries the old walk built millions of subgroups and took about four
// seconds on the live page, while this stays in the low milliseconds and grows with the square of
// the entries rather than with two to the power of them.
export function mostAvailability(entries, limit = 3) {
  const windows = entries.map((entry, index) => ({
    index, days: entry.days, start: minutes(entry.earliest_start), end: minutes(entry.latest_end),
  })).filter((window) => Array.isArray(window.days) && window.days.length &&
    window.days.every((day) => dayOrder.includes(day)) &&
    window.start !== null && window.end !== null && window.start < window.end);
  const result = { status: entries.length ? "incomplete" : "empty", count: entries.length,
    excludedCount: entries.length - windows.length, availableCount: 0, slots: [], options: [] };
  if (!windows.length) return result;

  const starts = [...new Set(windows.map((window) => window.start))].sort((a, b) => a - b);
  const ends = [...new Set(windows.map((window) => window.end))].sort((a, b) => a - b);
  const groups = [];
  const seen = new Set();
  for (const day of dayOrder) {
    const daily = windows.filter((window) => window.days.includes(day));
    if (daily.length < 2) continue;
    for (const start of starts) {
      // Only those who can make the day at all may bound a window on it, otherwise a time from
      // somebody who cannot come would invent an evening nobody shares. The end may come from anyone
      // who is there at that start - the group of the window is decided afterwards.
      const ab = daily.filter((window) => window.start <= start);
      if (ab.length < 2) continue;
      for (const end of ends) {
        if (end - start < RAID_WINDOW_MINUTES) continue;
        const members = [];
        for (const window of daily) {
          if (window.start <= start && window.end >= end) members.push(window.index);
        }
        // A single person is no compromise: nobody else would be there.
        if (members.length < 2) continue;
        members.sort((a, b) => a - b);
        const key = `${day}|${start}|${end}|${members.join(",")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push({ day, members, start, end });
      }
    }
  }
  // The most people first - that is what makes an evening raidable - then the longer window, then day
  // and start. Pick greedily and skip a group when it adds nobody that the options already chosen for
  // that day do not cover: two windows for the same people on the same day are the same offer.
  groups.sort((a, b) =>
    b.members.length - a.members.length || (b.end - b.start) - (a.end - a.start) ||
    dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) ||
    a.start - b.start || a.members.join(",").localeCompare(b.members.join(",")));
  const chosen = [];
  for (const group of groups) {
    if (chosen.length >= limit) break;
    const covered = new Set();
    for (const picked of chosen) {
      if (picked.day !== group.day) continue;
      for (const member of picked.members) covered.add(member);
    }
    if (group.members.every((member) => covered.has(member))) continue;
    chosen.push(group);
  }
  const best = chosen;
  result.options = best.slice(0, limit).map((candidate) => ({
    day: candidate.day, start: clock(candidate.start), end: clock(candidate.end),
    count: candidate.members.length, missing: entries.length - candidate.members.length,
  }));
  if (result.options.length) {
    result.status = "available";
    result.availableCount = result.options[0].count;
    result.slots = result.options.map(({ day, start, end }) => ({ day, start, end }));
  } else if (windows.length) result.status = "none";
  return result;
}
