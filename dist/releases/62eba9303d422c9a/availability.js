const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function minutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
// Every group of the requested size, used to rank the compromise windows.
function* combinations(items, size) {
  if (size > items.length) return;
  const indices = Array.from({ length: size }, (_, position) => position);
  while (true) {
    yield indices.map((position) => items[position]);
    let position = size - 1;
    while (position >= 0 && indices[position] === items.length - size + position) position--;
    if (position < 0) return;
    indices[position]++;
    for (let next = position + 1; next < size; next++) indices[next] = indices[next - 1] + 1;
  }
}
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

// Rank the options that do not suit everybody, so the overview can offer the best few compromises
// instead of only the single largest group. A window counts when it is the overlap of exactly the
// people it names, so nobody outside the group is ever counted in. Five options, so the list still
// reads at a glance while giving a group that falls short of the roster somewhere to go.
//
// The candidates are the windows bounded by two of the times the participants gave, and the group of
// a window is everyone whose own window contains it. The overlap of any group is such a window - its
// edges are two members' times - so no offer is missed, and the group found here is never smaller
// than the one that window was built from. That costs a pass over the entries per candidate instead
// of one per subgroup: with 22 entries the old walk built millions of subgroups and took about four
// seconds on the live page, while this stays in the low milliseconds and grows with the square of
// the entries rather than with two to the power of them.
export function mostAvailability(entries, limit = 5) {
  const windows = entries.map((entry, index) => ({
    index, days: entry.days, start: minutes(entry.earliest_start), end: minutes(entry.latest_end),
  })).filter((window) => Array.isArray(window.days) && window.days.length &&
    window.days.every((day) => dayOrder.includes(day)) &&
    window.start !== null && window.end !== null && window.start < window.end);
  const result = { status: entries.length ? "incomplete" : "empty", count: entries.length,
    excludedCount: entries.length - windows.length, availableCount: 0, slots: [], options: [] };
  if (!windows.length) return result;

  const starts = [...new Set(windows.map((window) => window.start))].sort((a, b) => a - b);
  const groups = [];
  const seen = new Set();
  for (const day of dayOrder) {
    const daily = windows.filter((window) => window.days.includes(day));
    if (daily.length < 2) continue;
    for (const start of starts) {
      // Only those who are there at that start can bound the window that begins there; otherwise a
      // time from somebody who cannot attend this day would invent a window nobody shares.
      const ab = daily.filter((window) => window.start <= start);
      if (ab.length < 2) continue;
      const ends = [...new Set(ab.map((window) => window.end))].sort((a, b) => a - b);
      for (const end of ends) {
        if (start >= end) continue;
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
  // Rank by group size, then day, then start. Pick greedily and skip a group when it adds nobody
  // that the options already chosen for that day do not cover - two windows for the same people on
  // the same day are the same offer.
  groups.sort((a, b) =>
    b.members.length - a.members.length || dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) ||
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
