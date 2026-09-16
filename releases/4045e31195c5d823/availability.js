const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function minutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
export const days = [...dayOrder];
// The roles the overview breaks a window down by, in the order it shows them. The caller may pass its
// own list; this is the roster's own order, with "Flexible" named as the card names it.
export const windowRoleOrder = ["Tank", "Healer", "Melee DPS", "Ranged DPS", "Flexible"];
// A window is only as useful as the roles standing in it, so every option carries how many of each
// role fit and who they are. The role comes from the caller: raid-roles.js owns that decision and is
// deliberately not pulled in here.
function countRoles(members, windows, roleOf, order) {
  const byIndex = new Map(windows.map((window) => [window.index, window]));
  const counts = new Map();
  for (const index of members) {
    const role = roleOf(byIndex.get(index)?.entry ?? {}) || "Flexible";
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  const rest = [...counts.keys()].filter((role) => !order.includes(role)).sort();
  return [...order, ...rest].filter((role) => counts.has(role))
    .map((role) => ({ role, count: counts.get(role) }));
}
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
export function mostAvailability(entries, limit = 5, roleOf = (entry) => entry?.role, roleOrder = windowRoleOrder) {
  const windows = entries.map((entry, index) => ({
    index, entry, days: entry.days, start: minutes(entry.earliest_start), end: minutes(entry.latest_end),
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
  // One evening per day, the fullest first. A day must not appear twice: the card is a week plan, and
  // two windows on the same day would leave a whole other day unmentioned. So the best window of each
  // day is taken, and only then does a second pass look for another window on a day that brings people
  // the first choice does not have.
  groups.sort((a, b) =>
    b.members.length - a.members.length || (b.end - b.start) - (a.end - a.start) ||
    dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) ||
    a.start - b.start || a.members.join(",").localeCompare(b.members.join(",")));
  const chosen = [];
  const daysTaken = new Set();
  for (const group of groups) {
    if (chosen.length >= limit) break;
    if (daysTaken.has(group.day)) continue;
    daysTaken.add(group.day);
    chosen.push(group);
  }
  // A day that could still bring in at least two people the chosen window of that day is missing gets a
  // second look, so a role that cannot make the fullest window is not silently left out.
  for (const group of groups) {
    if (chosen.length >= limit) break;
    const picked = chosen.filter((candidate) => candidate.day === group.day);
    if (!picked.length) continue;
    const covered = new Set(picked.flatMap((candidate) => candidate.members));
    if (group.members.filter((member) => !covered.has(member)).length < 2) continue;
    chosen.push(group);
  }
  chosen.sort((a, b) =>
    b.members.length - a.members.length || (b.end - b.start) - (a.end - a.start) ||
    dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) || a.start - b.start);
  const best = chosen.slice(0, limit);
  // Who a window is for, as records rather than names: the client sorts the people who fit by role and
  // the people who do not by spec, so it needs both fields. The roster is public either way.
  const person = (index) => {
    const entry = entries[index] ?? {};
    return { name: entry.name, role: roleOf(entry) || "Flexible", spec: entry.spec ?? "", className: entry.class_name ?? "" };
  };
  result.options = best.map((candidate) => ({
    day: candidate.day, start: clock(candidate.start), end: clock(candidate.end),
    count: candidate.members.length, missing: entries.length - candidate.members.length,
    roles: countRoles(candidate.members, windows, roleOf, roleOrder),
    canAttend: candidate.members.map(person),
    cannotAttend: windows.map((window) => window.index)
      .filter((index) => !candidate.members.includes(index)).map(person),
  }));
  if (result.options.length) {
    result.status = "available";
    result.availableCount = result.options[0].count;
    result.slots = result.options.map(({ day, start, end }) => ({ day, start, end }));
  } else if (windows.length) result.status = "none";
  return result;
}
