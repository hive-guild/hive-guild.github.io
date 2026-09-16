import { mostAvailability, whoCanWhen } from "./availability.js";
import {
  raidRole, raidRoleOrder, raidRoleClass, raidClassSpecs, classNames, serverModes,
  serverModeLabel, modePreferenceStats, uniqueClassRole, raidRoleLabel,
} from "./raid-roles.js";
import { AuthClient } from "./vendor/supabase-auth.js";
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from "./config.js";
import { isRaceClassAllowed, selectionForRace } from "./race-classes.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const views = { welcome: $("#welcome-view"), signup: $("#signup-view"), public: $("#public-view"), admin: $("#admin-view") };
const form = $("#registration-form");
const daysOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayLabels = { Mon: "Mo", Tue: "Di", Wed: "Mi", Thu: "Do", Fri: "Fr", Sat: "Sa", Sun: "So" };
const roleOrder = raidRoleOrder;
const races = [
  { name: "Orc", icon: "race-orc.png" },
  { name: "Troll", icon: "race-troll.png" },
  { name: "Tauren", icon: "race-tauren.png" },
  { name: "Undead", icon: "race-undead.png" },
  { name: "Skyborne", icon: "race-skyborne.png" },
  { name: "Not sure yet", label: "Noch nicht sicher", icon: "role-flexible.png" },
];
// Specs and their roles come from the central table so the picker, the derived role and the
// database can never drift apart; only the artwork stays here.
const iconSlug = (name) => name.toLowerCase().replace(/[()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const classes = classNames.map((name) => ({
  name,
  icon: `class-${iconSlug(name)}.jpg`,
  specs: Object.entries(raidClassSpecs[name]),
})).concat({ name: "Not sure yet", label: "Noch nicht sicher", icon: "role-flexible.png", specs: [] });
// Play-mode artwork. PVE shows a peace sign, "Mir egal" a shrug, PVP a dagger on the blood-red
// frame that CSS gives the PVP tile. Same table for the registration form, the public overview
// and the admin panel.
const serverModeIcons = { PVE: "mode-peace.svg", PVP: "mode-pvp.svg", ANY: "mode-shrug.svg" };
const serverModeChoices = serverModes.map((mode) => ({ ...mode, icon: serverModeIcons[mode.name] }));
// Ranged DPS has its own artwork: it used to point at the hunter class file, so the role tile showed
// the same picture as the hunter class tile.
const roleIcons = { "Melee DPS": "role-damage.jpg", "Ranged DPS": "role-ranged-dps.jpg", Tank: "role-tank.jpg", Healer: "role-healer.jpg", Damage: "role-damage.jpg", Flexible: "role-flexible.png" };
const specIcons = {
  Rogue: { Combat: "spec-rogue-combat.jpg" },
  Druid: { "Feral (Bear)": "spec-druid-feral-bear.jpg", "Feral (Cat)": "spec-druid-feral-cat.jpg" },
};
// All Hive artwork lives in one package under assets/hive/<group>/. The name alone says which
// group it belongs to, so the callers keep passing plain file names.
const ART_GROUP = { class: "classes", spec: "specs", race: "races", role: "roles", mode: "modes" };
const iconUrl = (name) => {
  const [prefix] = name.split("-");
  const group = ART_GROUP[prefix] ? `${ART_GROUP[prefix]}/` : "";
  return `./assets/hive/${group}${name}${/\.(?:svg|jpe?g|png)$/i.test(name) ? "" : ".svg"}`;
};
// Stored value -> what the roster shows. The picker tiles keep their own friendly label
// ("Noch nicht sicher"); on a card the open answer reads "tbd", the same word the role uses.
const displayChoice = (value) => value === "Not sure yet" ? "tbd" : value;
const choice = (group) => $( `input[name="${group}_choice"]:checked`, form)?.value || "";
// Same derivation the roster uses, so the preview can never disagree with the saved role.
const derivedRole = () => raidRole({ class_name: choice("class"), spec: choice("spec") });
const state = { mode: "create", editId: null, editToken: null, entries: [], publicEntries: [], auth: null, editLoadVersion: 0, adminDeleteEntry: null, originalDiscordName: "" };
const configured = () => /^https:\/\/.+\.supabase\.co\/?$/.test(SUPABASE_URL) && SUPABASE_PUBLIC_KEY && !SUPABASE_PUBLIC_KEY.startsWith("YOUR_");

function renderPicker(target, group, options, selected = "") {
  target.replaceChildren();
  options.forEach((option) => {
    const label = document.createElement("label");
    label.className = "choice-tile";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `${group}_choice`;
    input.value = option.name;
    input.required = true;
    input.disabled = Boolean(option.disabled);
    input.checked = option.name === selected;
    const card = element("span", "choice-tile-inner");
    // Play-mode tiles carry their mode, so CSS can colour each one individually.
    if (serverModes.some((mode) => mode.name === option.name)) card.dataset.mode = option.name;
    const icon = document.createElement("img");
    icon.className = "choice-icon";
    icon.src = iconUrl(option.icon);
    icon.alt = "";
    card.append(icon, document.createTextNode(option.label || option.name));
    // The role preview is skipped on the "not sure yet" tiles: their own icon already is the
    // question mark, so a second one would just repeat it.
    if (option.role && option.icon !== "role-flexible.png") {
      const roleIcon = document.createElement("img");
      roleIcon.className = "choice-role-icon";
      roleIcon.src = iconUrl(roleIcons[option.role]);
      roleIcon.alt = "";
      roleIcon.title = option.role;
      card.append(roleIcon);
    }
    label.append(input, card);
    target.append(label);
  });
}

function renderSpecs(className, selected = "") {
  const target = $("#spec-picker");
  const field = $("#spec-field");
  const chosenClass = classes.find((item) => item.name === className);
  // Without a real class there is nothing to specialise: "not sure yet" as a class keeps the whole
  // spec field out of the way instead of offering the same answer twice.
  if (!chosenClass || !chosenClass.specs.length) {
    // Clear, unrequire and disable the hidden radios. A required control that is not reachable -
    // because it is disabled or inside a hidden fieldset - blocks the submit with an error the
    // visitor cannot resolve, and that would stop "not sure yet" from being saved at all.
    for (const input of $$('input[name="spec_choice"]', form)) {
      input.checked = false;
      input.required = false;
      input.disabled = true;
    }
    target.replaceChildren();
    if (field) field.hidden = true;
    updateDerivedRole();
    return;
  }
  if (field) field.hidden = false;
  const options = chosenClass.specs.map(([name, role]) => ({ name, role, icon: specIcons[chosenClass.name]?.[name] || `spec-${iconSlug(chosenClass.name)}-${iconSlug(name)}.jpg` }));
  options.push({ name: "Not sure yet", label: "Noch nicht sicher", role: "Flexible", icon: "role-flexible.png" });
  renderPicker(target, "spec", options, selected);
  // A real class needs a spec again, so the field is required from here on.
  for (const input of $$('input[name="spec_choice"]', form)) input.required = true;
  updateDerivedRole();
}

function updateDerivedRole() {
  // The field appears as soon as the role is certain: with a picked spec, or with a class whose
  // specs all cover one role (Mage, Warlock, Rogue). A class with several possible roles stays
  // hidden until its spec is picked, so no role is announced that is still open.
  const className = choice("class");
  const chosenSpec = choice("spec");
  const panel = $("#role-result");
  if (!chosenSpec && !uniqueClassRole(className)) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  // The role is the one that would be saved; only its wording follows the display label.
  const role = derivedRole();
  const display = $("#derived-role");
  const icon = $("#derived-role-icon");
  display.textContent = raidRoleLabel(role);
  display.dataset.role = role.toLowerCase();
  icon.hidden = false;
  icon.src = iconUrl(roleIcons[role]);
}

function updateRaceAvailability(className = choice("class")) {
  for (const input of $$("input[name=race_choice]", form)) {
    input.disabled = Boolean(className) && !isRaceClassAllowed(input.value, className);
  }
}

function renderClasses(raceName = choice("race"), className = "", spec = "") {
  const selection = selectionForRace(raceName || "Not sure yet", className, spec);
  const options = classes.map((item) => ({ ...item, disabled: Boolean(raceName) && !isRaceClassAllowed(raceName, item.name) }));
  renderPicker($("#class-picker"), "class", options, selection.className);
  updateRaceAvailability(selection.className);
  renderSpecs(selection.className, selection.spec);
}

function renderAllPickers() {
  renderPicker($("#server-mode-picker"), "server_mode", serverModeChoices);
  renderPicker($("#race-picker"), "race", races);
  renderClasses();
  $("#race-picker").addEventListener("change", () => {
    const previousClass = choice("class");
    const previousSpec = choice("spec");
    renderClasses(choice("race"), previousClass, previousSpec);
    if (previousClass && !choice("class")) showToast("Diese Class passt nicht zur gewählten Race. Bitte wähle Class und Spec neu.");
  });
  $("#class-picker").addEventListener("change", () => {
    updateRaceAvailability();
    renderSpecs(choice("class"));
  });
  $("#spec-picker").addEventListener("change", updateDerivedRole);
  $("#reset-character-choices").addEventListener("click", () => {
    renderPicker($("#race-picker"), "race", races);
    renderClasses("");
    showError($("#form-error"), "");
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function setBusy(button, busy, idleText) {
  button.disabled = busy;
  button.textContent = busy ? "Einen Moment …" : idleText;
}

async function request(path, { method = "GET", body, token, headers = {} } = {}) {
  if (!configured()) throw new Error("Die Datenbank ist noch nicht verbunden. Die Seite kann erst nach der Einrichtung Einträge speichern.");
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : /^eyJ[^.]+\.[^.]+\.[^.]+$/.test(SUPABASE_PUBLIC_KEY) ? { Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    let detail = "Die Anfrage konnte nicht abgeschlossen werden. Bitte versuche es noch einmal.";
    try {
      const data = await response.json();
      detail = data.message || data.msg || data.error_description || data.error || detail;
    } catch { /* Keep the useful fallback. */ }
    if (response.status === 401 || response.status === 403) detail = "Zugriff verweigert oder Sitzung abgelaufen. Bitte melde dich erneut an.";
    throw new Error(detail);
  }
  return response.status === 204 ? null : response.json();
}

const rpc = (name, body) => request(`/rest/v1/rpc/${name}`, { method: "POST", body });

function readForm() {
  const data = new FormData(form);
  return {
    name: String(data.get("name") || "").trim(),
    knows_us: String(data.get("knows_us") || "").trim(),
    race: choice("race"),
    class_name: choice("class"),
    spec: choice("spec"),
    role: derivedRole(),
    server_mode: choice("server_mode"),
    days: daysOrder.filter((day) => data.getAll("days").includes(day)),
    max_raid_days: Number(data.get("max_raid_days")),
    earliest_start: String(data.get("earliest_start") || ""),
    latest_end: String(data.get("latest_end") || ""),
    raid_vision: String(data.get("raid_vision") || "").trim(),
    discord_name: state.originalDiscordName || "Discord",
  };
}

function fillForm(entry) {
  state.originalDiscordName = entry.discord_name || "";
  for (const key of ["name", "knows_us", "max_raid_days", "earliest_start", "latest_end", "raid_vision", "discord_name"]) {
    const control = form.elements.namedItem(key);
    if (control) control.value = entry[key] ?? "";
  }
  const selectChoice = (group, value) => {
    const input = $$(`input[name="${group}_choice"]`, form).find((item) => item.value === value);
    if (input) input.checked = true;
  };
  selectChoice("race", entry.race);
  $$("input[name=server_mode_choice]", form).forEach((input) => { input.checked = input.value === entry.server_mode; });
  renderClasses(entry.race, entry.class_name, entry.spec);
  $$("input[name=days]", form).forEach((input) => { input.checked = entry.days?.includes(input.value) || false; });
}

function paintSignupAside(mode = state.mode) {
  const copy = mode === "loading" ? {
    label: "EINEN MOMENT",
    heading: "Deine Anmeldung wird geladen.",
    body: "Wir schauen kurz nach, ob du schon eine Rückmeldung gespeichert hast.",
  } : mode === "load-error" ? {
    label: "DEINE ANMELDUNG",
    heading: "Laden gerade nicht möglich.",
    body: "Bitte lade die Seite neu, damit wir deine gespeicherten Angaben abrufen können.",
  } : mode === "admin-edit" ? {
    label: "ADMIN · EINTRAG BEARBEITEN",
    heading: "Anmeldung aktualisieren.",
    body: "Du bearbeitest die gespeicherte Rückmeldung eines Teilnehmers. Passe die Angaben an und speichere die Änderungen.",
  } : mode === "edit" || mode === "own-edit" ? {
    label: "WILLKOMMEN ZURÜCK",
    heading: "Anmeldung updaten",
    body: "Schon wieder rerollt oder haben sich deine Raidzeiten geändert? Deine Anmeldung ist bereits geladen. Passe einfach deine Angaben an und speichere die Änderungen.",
  } : {
    label: "NICE TO KNOW",
    heading: "Du kannst deine Angaben später updaten.",
    body: "Falls du schon während der Beta 5x rerollst: Melde dich später einfach wieder mit deinem Discord-Konto an und passe deine Angaben an. Das hilft uns bei der Raid-Planung und später beim Recruiting.",
  };
  $("#signup-aside-label").textContent = copy.label;
  $("#signup-aside-heading").textContent = copy.heading;
  $("#signup-aside-copy").textContent = copy.body;
}

function resetForm() {
  form.reset();
  renderClasses("");
  state.originalDiscordName = "";
  state.mode = "create";
  paintSignupAside();
  state.editId = null;
  state.editToken = null;
  $("#form-mode-label").textContent = "ANMELDUNG";
  $("#form-heading").textContent = "DEIN (HIVE)-COMEBACK";
  $("#delete-button").hidden = true;
  $("#submit-button").innerHTML = 'LET’S FUCKING GO! <span aria-hidden="true">↗</span>';
  showError($("#form-error"), "");
  $(".form-layout").hidden = false;
  $("#signup-success").hidden = true;
  paintParticipant();
}

function setEditMode(entry, id, token, isAdmin = false) {
  state.mode = isAdmin ? "admin-edit" : "edit";
  paintSignupAside();
  state.editId = id;
  state.editToken = token;
  fillForm(entry);
  $("#form-mode-label").textContent = isAdmin ? "ADMIN · EINTRAG BEARBEITEN" : "DEINE ANMELDUNG BEARBEITEN";
  $("#form-heading").textContent = isAdmin ? "Pläne geändert?" : "Erster Reroll Inc? 😂";
  $("#delete-button").hidden = isAdmin;
  $("#submit-button").innerHTML = 'Änderungen speichern <span aria-hidden="true">↗</span>';
  $(".form-layout").hidden = false;
  $("#signup-success").hidden = true;
  showError($("#form-error"), isRaceClassAllowed(entry.race, entry.class_name) ? "" : "Die bisherige Race-/Class-Kombination ist in WoW Forever nicht verfügbar. Bitte wähle Class und Spec neu, bevor du speicherst.");
}

async function submitRegistration(event) {
  event.preventDefault();
  showError($("#form-error"), "");
  if (!form.reportValidity()) return;
  const entry = readForm();
  if (!entry.race || !entry.class_name) {
    showError($("#form-error"), "Bitte wähle Rasse und Klasse aus.");
    return;
  }
  // Without a class there is no spec to pick, and the column requires a value: the field stores the
  // same placeholder the picker offers, so "not sure yet" is a complete answer.
  if (!entry.spec) entry.spec = "Not sure yet";
  if (!isRaceClassAllowed(entry.race, entry.class_name)) {
    showError($("#form-error"), "Bitte wähle eine gültige Race-/Class-Kombination für die Horde.");
    return;
  }
  if (!entry.days.length) {
    showError($("#form-error"), "Bitte wähle mindestens einen möglichen Raidtag aus.");
    $("#day-options").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const button = $("#submit-button");
  setBusy(button, true, state.mode === "create" ? "LET’S FUCKING GO! ↗" : "Änderungen speichern ↗");
  try {
    if (state.mode !== "admin-edit") {
      const wasCreate = state.mode === "create";
      const saved = await request('/rest/v1/rpc/hive_save_my_registration', { method: 'POST', body: { p_entry: entry }, token: await participantToken() });
      setEditMode(saved, saved.id, null);
      state.mode = 'own-edit';
      if (wasCreate) {
        $(".form-layout").hidden = true;
        $("#signup-success").hidden = false;
        $("#signup-success").scrollIntoView({ behavior: "smooth", block: "start" });
      } else showToast("Deine Änderungen sind gespeichert.");
    } else {
      const auth = await ensureAuth();
      await request(`/rest/v1/registrations?id=eq.${encodeURIComponent(state.editId)}`, { method: "PATCH", body: entry, token: auth.access_token, headers: { Prefer: "return=minimal" } });
      showToast("Eintrag aktualisiert.");
      location.hash = "#/admin";
      await loadEntries();
    }
  } catch (error) {
    showError($("#form-error"), error.message);
    $("#form-error").scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    setBusy(button, false, state.mode === "create" ? "LET’S FUCKING GO! ↗" : "Änderungen speichern ↗");
  }
}

function saveAuth(auth) {
  state.auth = { ...auth, expires_at: Math.floor(Date.now() / 1000) + (auth.expires_in || 3600) };
  sessionStorage.setItem("hive_admin_auth", JSON.stringify(state.auth));
}

async function ensureAuth() {
  if (!state.auth) {
    try { state.auth = JSON.parse(sessionStorage.getItem("hive_admin_auth") || "null"); } catch { state.auth = null; }
  }
  if (!state.auth?.access_token) throw new Error("Bitte melde dich als Admin an.");
  if (state.auth.expires_at > Math.floor(Date.now() / 1000) + 60) return state.auth;
  const refreshed = await request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: state.auth.refresh_token } });
  saveAuth(refreshed);
  return state.auth;
}

async function login(event) {
  event.preventDefault();
  const loginForm = event.currentTarget;
  showError($("#login-error"), "");
  const button = $("button[type=submit]", loginForm);
  setBusy(button, true, "Übersicht öffnen ↗");
  try {
    const data = new FormData(loginForm);
    const auth = await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email: data.get("email"), password: data.get("password") } });
    saveAuth(auth);
    const allowed = await request("/rest/v1/rpc/hive_is_admin", { method: "POST", body: {}, token: auth.access_token });
    if (!allowed) throw new Error("Dieses Konto ist nicht für die Raidleitung freigeschaltet.");
    loginForm.reset();
    await loadEntries();
  } catch (error) {
    state.auth = null;
    sessionStorage.removeItem("hive_admin_auth");
    showError($("#login-error"), error.message);
  } finally {
    setBusy(button, false, "Übersicht öffnen ↗");
  }
}

async function loadEntries() {
  try {
    const auth = await ensureAuth();
    const allowed = await request("/rest/v1/rpc/hive_is_admin", { method: "POST", body: {}, token: auth.access_token });
    if (!allowed) throw new Error("Dieses Konto ist nicht für die Raidleitung freigeschaltet.");
    state.entries = await request("/rest/v1/registrations?select=id,name,knows_us,race,class_name,spec,role,server_mode,days,max_raid_days,earliest_start,latest_end,raid_vision,discord_name,created_at,updated_at&order=created_at.desc", { token: auth.access_token });
    $("#admin-login-card").hidden = true;
    $("#admin-panel").hidden = false;
    renderDashboard();
  } catch (error) {
    clearAdminData();
    state.auth = null;
    sessionStorage.removeItem("hive_admin_auth");
    $("#admin-login-card").hidden = false;
    $("#admin-panel").hidden = true;
    showError($("#login-error"), error.message);
  }
}

function clearAdminData() {
  state.entries = [];
  for (const selector of ["#stats-grid", "#mode-stats", "#most-availability", "#roster-list"]) $(selector).replaceChildren();
  $("#result-count").textContent = "";
  $("#roster-empty").hidden = true;
  $("#filter-class").replaceChildren(new Option("Alle Klassen", ""));
  if (state.mode === "admin-edit") resetForm();
}

function element(tag, className = "", content = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = content;
  return node;
}

async function loadPublicEntries() {
  showError($("#public-error"), "");
  for (const button of $$('[data-availability-scope="public"]')) button.disabled = true;
  for (const selector of ["#public-who-can", "#public-most-availability"]) $(selector).replaceChildren(element("p", "common-caption", "Rückmeldungen werden geladen …"));
  renderModePreferences($("#public-mode-stats"), []);
  $("#public-roster-scope").textContent = "";
  try {
    const rows = await rpc("hive_public_roster", {});
    state.publicEntries = Array.isArray(rows) ? rows : [];
    renderPublicRoster();
    renderPublicInsights();
  } catch (error) {
    state.publicEntries = [];
    renderPublicRoster();
    renderPublicInsights("Die Verfügbarkeit konnte nicht geladen werden. Bitte lade die Seite erneut.");
    $("#public-empty").hidden = true;
    showError($("#public-error"), configured() ? error.message : "Die Raid-Übersicht ist noch nicht mit der Datenbank verbunden.");
  } finally {
    for (const button of $$('[data-availability-scope="public"]')) button.disabled = false;
  }
}

// "Noch offen" for registrations without a play mode, without claiming a preference.
const knownServerMode = (value) =>
  serverModes.some((mode) => mode.name === value) ? serverModeLabel(value) : "Noch offen";

function serverModeBadge(value) {
  const known = serverModes.some((item) => item.name === value);
  const badge = element("span", `server-mode-badge${known ? ` server-${value.toLowerCase()}` : ""}`);
  if (known) {
    const icon = document.createElement("img");
    icon.src = iconUrl(serverModeIcons[value]);
    icon.alt = "";
    // The mode travels with the icon, so every surface can tint it the same way.
    icon.dataset.mode = value;
    badge.append(icon);
  }
  badge.append(document.createTextNode(`Server: ${known ? serverModeLabel(value) : "Noch offen"}`));
  return badge;
}

function renderPublicRoster() {
  const publicEntries = state.publicEntries.map((entry) => ({ ...entry, role: raidRole(entry) }));
  // The statistic describes the complete roster, independently of role and class filters.
  $("#public-roster-scope").textContent = `${publicEntries.length} ${publicEntries.length === 1 ? "Vote" : "Votes"}`;
  renderModePreferences($("#public-mode-stats"), publicEntries);
  const roleFilter = $("#public-filter-role").value;
  const classFilter = $("#public-filter-class");
  const previousClass = classFilter.value;
  const classNames = [...new Set(publicEntries.map((entry) => entry.class_name))].sort((a, b) => a.localeCompare(b, "de"));
  classFilter.replaceChildren(new Option("Alle Klassen", ""), ...classNames.map((name) => new Option(displayChoice(name), name)));
  classFilter.value = classNames.includes(previousClass) ? previousClass : "";
  const sortBy = $("#public-sort-by").value;
  const groupValue = (entry) => sortBy === "class" ? entry.class_name : sortBy === "spec" ? entry.spec : entry.role;
  const rows = publicEntries.filter((entry) => (!roleFilter || entry.role === roleFilter) && (!classFilter.value || entry.class_name === classFilter.value));
  rows.sort((a, b) => sortBy === "role"
    ? raidRoleOrder.indexOf(a.role) - raidRoleOrder.indexOf(b.role) || a.class_name.localeCompare(b.class_name, "de") || a.name.localeCompare(b.name, "de")
    : groupValue(a).localeCompare(groupValue(b), "de") || a.name.localeCompare(b.name, "de"));
  $("#public-count").textContent = `(${rows.length})`;
  const stats = $("#public-stats");
  stats.replaceChildren();
  for (const role of raidRoleOrder) {
    const count = publicEntries.filter((entry) => entry.role === role).length;
    const tile = element("button", `public-stat role-${raidRoleClass(role)}`);
    tile.type = "button";
    tile.disabled = count === 0;
    tile.setAttribute("aria-label", count ? `Zu ${raidRoleLabel(role)} springen (${count})` : `${raidRoleLabel(role)}: keine Einträge`);
    tile.addEventListener("click", () => {
      $("#public-filter-role").value = "";
      $("#public-filter-class").value = "";
      $("#public-sort-by").value = "role";
      renderPublicRoster();
      const heading = document.getElementById(`public-group-${raidRoleClass(role)}`);
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    });
    const icon = document.createElement("img");
    icon.src = iconUrl(roleIcons[role]);
    icon.alt = "";
    tile.append(icon, element("span", "", raidRoleLabel(role)), element("strong", "", count));
    stats.append(tile);
  }
  const list = $("#public-list");
  list.replaceChildren();
  $("#public-empty").hidden = rows.length > 0;
  let previousGroup = null;
  for (const entry of rows) {
    const group = groupValue(entry);
    if (group !== previousGroup) {
      const heading = element("h3", "public-group");
      // When the roster is grouped by role, the heading carries that role's artwork and colour.
      if (sortBy === "role") {
        heading.classList.add(`role-${raidRoleClass(group)}`);
        const headIcon = document.createElement("img");
        headIcon.className = "group-icon";
        headIcon.src = iconUrl(roleIcons[group]);
        headIcon.alt = "";
        heading.append(headIcon);
      }
      heading.append(document.createTextNode(raidRoleLabel(group)));
      if (sortBy === "role") {
        heading.id = `public-group-${raidRoleClass(group)}`;
        heading.tabIndex = -1;
      }
      list.append(heading);
      previousGroup = group;
    }
    const card = element("article", "public-card");
    const raceIcon = document.createElement("img");
    raceIcon.src = iconUrl(races.find((item) => item.name === entry.race)?.icon || "role-flexible.png");
    raceIcon.alt = "";
    raceIcon.className = "public-race-icon";
    const identity = element("div", "public-identity");
    identity.append(element("strong", "", displayChoice(entry.name)), element("small", "", displayChoice(entry.race)), serverModeBadge(entry.server_mode));
    const classIcon = document.createElement("img");
    classIcon.src = iconUrl(classes.find((item) => item.name === entry.class_name)?.icon || "role-flexible.png");
    classIcon.alt = "";
    const classBox = element("div", "public-class");
    classBox.append(classIcon, element("span", "", displayChoice(entry.class_name)), element("small", "", displayChoice(entry.spec)));
    // No role on the card and none in the details either: the group heading above the cards names
    // the role. Sorting by class or spec shows no role heading, but the role tiles at the top of the
    // page still break the roster down by role.
    card.append(raceIcon, identity, classBox);
    const raidDays = daysOrder.filter((day) => entry.days?.includes(day)).map((day) => dayLabels[day]).join(" · ") || "Noch offen";
    const schedule = element("div", "public-raid-schedule");
    schedule.append(element("small", "", "Raidtage"), element("p", "", `${raidDays} / max. ${entry.max_raid_days ?? "–"} / ${entry.earliest_start || "–"}–${entry.latest_end || "–"} Uhr`));
    const details = element("details", "public-raid-details");
    const summary = element("summary", "", "Details");
    summary.setAttribute("aria-label", `Details für ${entry.name}`);
    details.append(summary, schedule);
    const vision = element("div", "public-raid-vision");
    vision.append(element("small", "", "Erwartungen an den Raid"), element("p", "", entry.raid_vision?.trim() || "Noch keine Angabe"));
    details.append(vision);
    card.append(details);
    // The whole card opens the details, not just the button. The summary keeps its own click, so the
    // handler steps aside when the click landed on it or on anything interactive inside. Enter and
    // space do the same for keyboard users, since the card carries the button role.
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-expanded", "false");
    card.setAttribute("aria-label", `Details zu ${displayChoice(entry.name)} anzeigen`);
    const toggle = () => {
      details.open = !details.open;
    };
    // Keep the card's own state in step, whichever way the details were opened.
    details.addEventListener("toggle", () => card.setAttribute("aria-expanded", String(details.open)));
    card.addEventListener("click", (event) => {
      if (event.target.closest("summary, a, button, input, select, textarea, label")) return;
      toggle();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      // Space would scroll the page instead.
      event.preventDefault();
      toggle();
    });
    list.append(card);
  }
}

function renderStats() {
  const stats = $("#stats-grid");
  stats.replaceChildren();
  const roleColors = { Tank: "#a9a2ff", Healer: "#8bd9bd", "Melee DPS": "#ff9c9f", "Ranged DPS": "#c8adff", Flexible: "#e3c284" };
  const definitions = [
    ["Rückmeldungen", state.entries.length, "#e83d52"],
    ...raidRoleOrder.map((role) => [role, state.entries.filter((entry) => raidRole(entry) === role).length, roleColors[role]]),
  ];
  for (const [label, value, color] of definitions) {
    const card = element("div", "stat-card");
    card.style.setProperty("--accent", color);
    card.append(element("small", "", label), element("strong", "", value));
    stats.append(card);
  }
}

function chartRow(label, count, max, share = null) {
  const row = element("div", "chart-row");
  const track = element("div", "chart-track");
  const fill = element("span", "chart-fill");
  const width = share === null
    ? Math.max(0, Math.min(100, (count / Math.max(max, 1)) * 100))
    : Math.max(0, Math.min(100, Number.isFinite(share) ? share : 0));
  fill.style.width = `${width}%`;
  track.append(fill);
  // The share is written out next to the bar only where the row reports one, so bar and number
  // always agree and rows without a share keep the compact three-column layout.
  row.setAttribute("role", "img");
  row.setAttribute("aria-label", share === null ? `${label}: ${count} Spieler` : `${label}: ${count} Spieler, ${share} %`);
  row.append(element("span", "chart-label", label), track, element("strong", "chart-count", count));
  if (share !== null) {
    row.classList.add("chart-row-share");
    row.append(element("span", "chart-share", `${share} %`));
  }
  return row;
}

// Play-mode statistic. Shared by the public overview and the admin panel; both always describe
// the whole roster, never the current role/class filter, so identical data yields identical rows.
function renderModePreferences(target, entries) {
  target.replaceChildren();
  const stats = modePreferenceStats(entries);
  if (!stats.total) {
    target.append(element("p", "common-caption", "Noch keine Rückmeldungen vorhanden."));
    return;
  }
  const chart = element("div", "bar-chart mode-chart");
  for (const row of stats.rows) {
    const line = chartRow(serverModeLabel(row.mode), row.count, 0, row.share);
    // Same play-mode artwork as the registration form, so both surfaces read alike.
    const image = document.createElement("img");
    image.className = "chart-icon";
    image.src = iconUrl(serverModeIcons[row.mode]);
    image.dataset.mode = row.mode;
    image.alt = "";
    line.prepend(image);
    chart.append(line);
  }
  target.append(chart);
  // The form requires a mode, so this can only appear for incomplete legacy records.
  if (stats.uncounted) target.append(element("p", "common-caption", `Für ${stats.uncounted} ${stats.uncounted === 1 ? "Rückmeldung" : "Rückmeldungen"} liegt kein Spielmodus vor; sie sind in keiner der Anteile enthalten.`));
}


// Average of the "maximum raid days" the roster reported. Entries without a usable number stay out
// of the average, so an empty field never pulls it towards zero.
function renderAverageRaidDays(entries, prefix = "") {
  const target = $(`#${prefix}average-days`);
  if (!target) return;
  target.replaceChildren();
  const values = entries.map((entry) => Number(entry.max_raid_days)).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) {
    target.append(element("p", "common-caption", "Noch keine Angaben zu den maximalen Raidtagen vorhanden."));
    return;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = total / values.length;
  // German decimal comma, one place: 1.5 becomes "1,5".
  const averageText = average.toFixed(1).replace(".", ",");

  // Only the headline number: the same green box the other two cards use for their slots.
  const slot = element("div", "common-slot");
  slot.append(element("strong", "", averageText), element("span", "", "Tage im Schnitt"));
  const slots = element("div", "common-slots");
  slots.append(slot);
  target.append(slots);
}

function renderPublicInsights(error = "") {
  // Always use the complete public roster, independently of the role/class filters.
  renderAverageRaidDays(state.publicEntries, "public-");
  if (error) {
    for (const selector of ["#public-who-can", "#public-most-availability"]) $(selector).replaceChildren(element("p", "common-caption", error));
    return;
  }
  renderMostAvailability(state.publicEntries, "public-");
  renderWhoCanWhen(state.publicEntries, "public-");
}

function renderMostAvailability(entries, prefix = "") {
  const target = $(`#${prefix}most-availability`);
  target.replaceChildren();
  const best = mostAvailability(entries);
  if (best.status !== "available") {
    target.append(element("p", "common-caption", best.status === "empty"
      ? "Noch keine Rückmeldungen vorhanden."
      : best.status === "none"
      ? "Für keinen Tag ergibt sich mit mindestens drei Stunden ein gemeinsames Zeitfenster."
      : "Es sind noch keine vollständigen Zeitangaben vorhanden."));
    return;
  }
  const slots = element("div", "common-slots");
  for (const option of best.options) {
    const slot = element("div", "common-slot");
    // Only the attendance; how many people that leaves out follows from the total.
    slot.append(element("strong", "", dayLabels[option.day]), element("span", "", `${option.start}–${option.end} Uhr`),
      element("small", "availability-attendance", `${option.count} von ${best.count}`));
    slots.append(slot);
  }
  target.append(slots);
  if (best.excludedCount) target.append(element("p", "common-caption",
    `${best.excludedCount} Rückmeldungen mit unvollständigen Zeitangaben sind noch nicht berücksichtigt.`));
}

// Who is there when: a row per person, a column per day. A marked day is a bar; a day that also
// covers the window the compromise list offers for it is filled with the role's own colour, so the
// board shows at a glance whether the people you need are there on the evening you are planning.
function renderWhoCanWhen(entries, prefix = "") {
  const target = $(`#${prefix}who-can`);
  target.replaceChildren();
  if (!entries.length) {
    target.append(element("p", "common-caption", "Noch keine Rückmeldungen vorhanden."));
    return;
  }
  const best = mostAvailability(entries);
  const ordered = [...entries].sort((a, b) =>
    raidRoleOrder.indexOf(raidRole(a)) - raidRoleOrder.indexOf(raidRole(b)) ||
    a.class_name.localeCompare(b.class_name, "de") || a.name.localeCompare(b.name, "de"));
  const board = whoCanWhen(ordered, best.slots);
  const fitting = new Map(daysOrder.map((day) => [day, board.filter((row) => row.cells.some((cell) => cell.day === day && cell.fits)).length]));

  const table = element("table", "who-table");
  const head = element("thead");
  const headRow = element("tr");
  headRow.append(element("th", "who-name-head", "Wer"));
  for (const day of daysOrder) {
    const th = element("th");
    th.scope = "col";
    th.append(element("span", "who-day", dayLabels[day]));
    th.append(element("small", "who-day-count", String(fitting.get(day))));
    headRow.append(th);
  }
  head.append(headRow);
  table.append(head);

  const body = element("tbody");
  for (const row of board) {
    const tr = element("tr");
    const name = element("th", "who-name");
    name.scope = "row";
    const icon = element("img", "who-role-icon");
    icon.src = iconUrl(roleIcons[row.role] || "role-flexible.png");
    icon.alt = "";
    icon.width = 20;
    icon.height = 20;
    name.append(icon, element("span", "", displayChoice(row.name)));
    tr.append(name);
    for (const cell of row.cells) {
      const td = element("td", "who-cell");
      const mark = element("span", `who-mark${cell.marked ? ` role-${raidRoleClass(row.role)}` : ""}${cell.fits ? " who-fits" : ""}`);
      mark.title = !cell.marked ? `${row.name} kann ${dayLabels[cell.day]} nicht`
        : cell.fits ? `${row.name} passt ${dayLabels[cell.day]} ins Zeitfenster`
        : `${row.name} kann ${dayLabels[cell.day]}, aber die Zeiten passen nicht ins Fenster`;
      mark.setAttribute("aria-label", mark.title);
      td.append(mark);
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  // element() sets its third argument as text; the table has to go in as a child.
  const scroll = element("div", "who-scroll");
  scroll.append(table);
  target.append(scroll);

  const offered = best.slots.map((slot) => `${dayLabels[slot.day]} ${slot.start}–${slot.end}`);
  target.append(element("p", "common-caption", offered.length
    ? `Kräftig gefüllt heißt: kann an dem Tag und die eigenen Zeiten decken das Angebot ab. Angebotene Fenster: ${offered.join(", ")}.`
    : "Kräftig gefüllt heißt: kann an dem Tag und die eigenen Zeiten würden ein drei Stunden langes Fenster tragen. Für welchen Tag das gilt, steht unter „Wann haben die meisten Zeit?“."));
  if (best.excludedCount) target.append(element("p", "common-caption",
    `${best.excludedCount} Rückmeldungen mit unvollständigen Zeitangaben sind noch nicht berücksichtigt.`));
}

function detail(label, value, className = "roster-detail") {
  const box = element("div", className);
  box.append(element("small", "", label), element("span", "", value || "–"));
  return box;
}

function openAdminDeleteDialog(entry) {
  state.adminDeleteEntry = { id: entry.id, name: entry.name };
  $("#delete-title").textContent = "Eintrag wirklich löschen?";
  $("#delete-description").textContent = `Der Eintrag von ${entry.name} wird dauerhaft aus der öffentlichen Liste und der Admin-Übersicht entfernt.`;
  $("#confirm-delete").textContent = "Ja, Eintrag löschen";
  showError($("#delete-error"), "");
  $("#delete-dialog").showModal();
}

function expandedInfo(entry) {
  const area = element("div", "roster-expanded");
  for (const [label, value] of [
    ["Kennen wir uns?", entry.knows_us],
    ["Race", displayChoice(entry.race)],
    ["Bevorzugter Server", knownServerMode(entry.server_mode)],
    ["Frühestens ab", entry.earliest_start ? `${entry.earliest_start} Uhr` : ""],
    ["Maximal bis", entry.latest_end ? `${entry.latest_end} Uhr` : ""],
    ["Erwartungen an den Raid", entry.raid_vision],
    ["Discord-Tag", entry.discord_name],
    ["Zuletzt geändert", new Date(entry.updated_at).toLocaleDateString("de-DE")],
  ]) {
    const box = element("div");
    box.append(element("small", "", label), element("p", "", value || "–"));
    area.append(box);
  }
  const edit = element("button", "roster-edit", "Eintrag bearbeiten ↗");
  edit.type = "button";
  edit.addEventListener("click", () => {
    setEditMode(entry, entry.id, null, true);
    location.hash = "#/anmeldung";
    scrollTo({ top: 0, behavior: "smooth" });
  });
  area.append(edit);
  return area;
}

function renderDashboard() {
  renderStats();
  renderModePreferences($("#mode-stats"), state.entries);
  renderMostAvailability(state.entries);
  renderWhoCanWhen(state.entries);
  renderAverageRaidDays(state.entries);
  const roleFilter = $("#filter-role").value;
  const classFilter = $("#filter-class");
  const previousClass = classFilter.value;
  const availableClasses = [...new Set(state.entries.map((entry) => entry.class_name))].sort((a, b) => a.localeCompare(b, "de"));
  classFilter.replaceChildren(new Option("Alle Klassen", ""), ...availableClasses.map((name) => new Option(displayChoice(name), name)));
  classFilter.value = availableClasses.includes(previousClass) ? previousClass : "";
  const selectedClass = classFilter.value;
  const sortBy = $("#sort-by").value;
  const entries = state.entries.map((entry) => ({ ...entry, role: raidRole(entry) })).filter((entry) => (!roleFilter || entry.role === roleFilter) && (!selectedClass || entry.class_name === selectedClass));
  const groupValue = (entry) => sortBy === "role" ? entry.role : sortBy === "class" ? entry.class_name : sortBy === "spec" ? (entry.spec || "Noch offen") : "";
  entries.sort((a, b) => {
    if (sortBy === "newest") return new Date(b.created_at) - new Date(a.created_at);
    if (sortBy === "role") return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || a.class_name.localeCompare(b.class_name, "de") || a.name.localeCompare(b.name, "de");
    return groupValue(a).localeCompare(groupValue(b), "de") || a.name.localeCompare(b.name, "de");
  });
  $("#result-count").textContent = `(${entries.length})`;
  $("#roster-empty").hidden = entries.length > 0;
  const list = $("#roster-list");
  list.replaceChildren();
  let previousGroup = null;
  for (const entry of entries) {
    const group = groupValue(entry);
    if (sortBy !== "newest" && group !== previousGroup) {
      const count = entries.filter((item) => groupValue(item) === group).length;
      list.append(element("div", "group-heading", `${raidRoleLabel(group)}  /  ${count}`));
      previousGroup = group;
    }
    const row = element("article", "roster-item");
    const avatar = element("div", "roster-avatar");
    const classIcon = document.createElement("img");
    classIcon.src = iconUrl(classes.find((item) => item.name === entry.class_name)?.icon || "role-flexible.png");
    classIcon.alt = "";
    avatar.append(classIcon);
    row.append(avatar);
    const identity = element("div", "roster-name");
    identity.append(element("strong", "", entry.name), element("span", "", entry.discord_name));
    const race = element("div", "roster-race");
    const raceIcon = document.createElement("img");
    raceIcon.src = iconUrl(races.find((item) => item.name === entry.race)?.icon || "role-flexible.png");
    raceIcon.alt = "";
    race.append(raceIcon, element("span", "", displayChoice(entry.race)));
    identity.append(race);
    row.append(identity, detail("Klasse / Spec", `${displayChoice(entry.class_name)}${entry.spec ? ` · ${displayChoice(entry.spec)}` : ""}`, "roster-detail roster-class"));
    const role = element("div", "roster-detail roster-role");
    const badge = element("span", `role-badge role-${raidRoleClass(entry.role)}`);
    const badgeIcon = document.createElement("img");
    badgeIcon.src = iconUrl(roleIcons[entry.role] || "role-flexible.png");
    badgeIcon.alt = "";
    badge.append(badgeIcon, document.createTextNode(raidRoleLabel(entry.role)));
    role.append(element("small", "", "Role"), badge);
    row.append(role, detail("Raidtage", `${entry.days?.map((day) => dayLabels[day] || day).join(" · ") || "–"}  /  max. ${entry.max_raid_days}  /  ${entry.earliest_start || "–"}–${entry.latest_end || "–"} Uhr`, "roster-detail roster-days"));
    const toggle = element("button", "roster-edit", "Details");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      const existing = $(".roster-expanded", row);
      if (existing) { existing.remove(); toggle.setAttribute("aria-expanded", "false"); }
      else { row.append(expandedInfo(entry)); toggle.setAttribute("aria-expanded", "true"); }
    });
    const remove = element("button", "roster-edit roster-delete", "Löschen");
    remove.type = "button";
    remove.setAttribute("aria-label", `Eintrag von ${entry.name} löschen`);
    remove.addEventListener("click", () => openAdminDeleteDialog(entry));
    const actions = element("div", "roster-row-actions");
    actions.append(toggle, remove);
    row.append(actions);
    list.append(row);
  }
}

function route() {
  const editLoadVersion = ++state.editLoadVersion;
  const hash = location.hash || (/\/anmeldung\/?$/.test(location.pathname) ? "#/anmeldung" : "#/willkommen");
  const edit = hash.match(/^#\/bearbeiten\/([0-9a-f-]{36})\/([0-9a-f]{64})$/i);
  const view = edit || hash === "#/anmeldung" ? "signup" : hash === "#/uebersicht" ? "public" : hash === "#/admin" ? "admin" : "welcome";
  Object.entries(views).forEach(([name, node]) => { node.hidden = name !== view; });
  $$("[data-nav]").forEach((link) => {
    const active = link.dataset.nav === view;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  $(".main-nav").classList.remove("open");
  $(".menu-toggle").setAttribute("aria-expanded", "false");
  if (view !== "signup" && state.mode === "admin-edit") resetForm();
  if (view === "signup" && state.mode !== "admin-edit") loadParticipantEntry(editLoadVersion);
  paintParticipant();
  if (view === "public") loadPublicEntries();
  if (view === "admin" && state.auth) loadEntries();
  if (hash === "#brief") requestAnimationFrame(() => $("#brief").scrollIntoView({ behavior: "smooth" }));
  else scrollTo({ top: 0, behavior: "instant" });
}

form.addEventListener("submit", submitRegistration);
$("#admin-login-form").addEventListener("submit", login);
$("#delete-button").addEventListener("click", () => {
  state.adminDeleteEntry = null;
  $("#delete-title").textContent = "Wirklich raus aus dem Raid?";
  $("#delete-description").textContent = "Deine Angaben werden dauerhaft entfernt. Du kannst dich danach mit deinem Discord-Konto erneut anmelden.";
  $("#confirm-delete").textContent = "Ja, Anmeldung löschen";
  showError($("#delete-error"), "");
  $("#delete-dialog").showModal();
});
$("#cancel-delete").addEventListener("click", () => $("#delete-dialog").close());
$("#confirm-delete").addEventListener("click", async () => {
  const button = $("#confirm-delete");
  const target = state.adminDeleteEntry;
  const idleText = target ? "Ja, Eintrag löschen" : "Ja, Anmeldung löschen";
  setBusy(button, true, idleText);
  try {
    if (target) {
      const auth = await ensureAuth();
      const deleted = await request(`/rest/v1/registrations?id=eq.${encodeURIComponent(target.id)}&select=id`, { method: "DELETE", token: auth.access_token, headers: { Prefer: "return=representation" } });
      if (!deleted?.length) throw new Error("Der Eintrag wurde bereits entfernt.");
      $("#delete-dialog").close();
      state.adminDeleteEntry = null;
      await loadEntries();
      showToast(`Eintrag von ${target.name} gelöscht.`);
    } else {
      const deleted = await request("/rest/v1/rpc/hive_delete_my_registration", { method: "POST", body: {}, token: await participantToken() });
      if (!deleted) throw new Error("Der Eintrag wurde bereits gelöscht.");
      $("#delete-dialog").close();
      resetForm();
      location.hash = "#/willkommen";
      showToast("Deine Anmeldung wurde gelöscht.");
    }
  } catch (error) {
    showError($("#delete-error"), error.message);
  } finally {
    setBusy(button, false, idleText);
  }
});
$("#logout-button").addEventListener("click", async () => {
  const token = state.auth?.access_token;
  state.auth = null;
  sessionStorage.removeItem("hive_admin_auth");
  clearAdminData();
  $("#admin-panel").hidden = true;
  $("#admin-login-card").hidden = false;
  showError($("#login-error"), "");
  try { if (token) await request("/auth/v1/logout", { method: "POST", token }); } catch { /* Local logout already completed. */ }
});
for (const selector of ["#filter-role", "#filter-class", "#sort-by"]) $(selector).addEventListener("change", renderDashboard);
for (const selector of ["#public-filter-role", "#public-filter-class", "#public-sort-by"]) $(selector).addEventListener("change", renderPublicRoster);
for (const button of $$("[data-availability]")) button.addEventListener("click", () => {
  const expanded = button.getAttribute("aria-expanded") !== "true";
  const scope = button.dataset.availabilityScope;
  const prefix = scope === "public" ? "public-" : "";
  for (const option of $$(`[data-availability-scope="${scope}"]`)) option.setAttribute("aria-expanded", String(expanded && option === button));
  $(`#${prefix}availability-panel`).hidden = !expanded;
  $(`#${prefix}who-card`).hidden = button.dataset.availability !== "who";
  $(`#${prefix}most-card`).hidden = button.dataset.availability !== "most";
  $(`#${prefix}average-card`).hidden = button.dataset.availability !== "days";
  const currentEntries = scope === "public" ? state.publicEntries : state.entries;
  if (expanded && button.dataset.availability === "days") renderAverageRaidDays(currentEntries, prefix);
  if (expanded && button.dataset.availability === "who") renderWhoCanWhen(currentEntries, prefix);
});
$(".menu-toggle").addEventListener("click", () => {
  const open = $(".main-nav").classList.toggle("open");
  $(".menu-toggle").setAttribute("aria-expanded", String(open));
});
window.addEventListener("hashchange", route);
// The skip link must not touch the address bar: this is a hash-routed single page, so "#main"
// would count as an unknown route and route() would switch back to the welcome view. Moving the
// focus is all it has to do.
$(".skip-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  const main = $("#main");
  if (!main) return;
  main.focus({ preventScroll: true });
  main.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
});
try { state.auth = JSON.parse(sessionStorage.getItem("hive_admin_auth") || "null"); } catch { state.auth = null; }
// Participant authentication is independent of the existing raid-lead session.
const discordAuth = configured() ? new AuthClient({
  url: `${SUPABASE_URL}/auth/v1`, headers: { apikey: SUPABASE_PUBLIC_KEY },
  storageKey: 'hive_discord_auth', storage: sessionStorage,
  flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: true,
}) : null;
let participant = null;
let participantReady = false;

async function participantToken() {
  if (!discordAuth) throw new Error('Die Anmeldung ist noch nicht eingerichtet.');
  const { data, error } = await discordAuth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('Bitte melde dich mit Discord an.');
  return data.session.access_token;
}

function paintParticipant() {
  const adminEditing = state.mode === 'admin-edit';
  $('#discord-login').hidden = Boolean(participant);
  $('#discord-logout').hidden = !participant;
  $('#discord-account h2').hidden = Boolean(participant);
  $('#discord-status').hidden = Boolean(participant);
  $('#discord-status').textContent = !participantReady ? 'Anmeldung wird geprüft …' : participant ? '' : 'Damit Nazgral nicht trollen kann und 100 Einträge erstellt (oder zumindest mehr Aufwand hat) 😂';
  $('#discord-login').disabled = !participantReady;
  $('#discord-account').hidden = adminEditing;
  $('.form-layout').hidden = !adminEditing && !participant;
}

async function loadParticipantEntry(version) {
  resetForm();
  paintParticipant();
  if (!participantReady || !participant) return;
  paintSignupAside('loading');
  $('#submit-button').disabled = true;
  let loaded = false;
  try {
    const entry = await request('/rest/v1/rpc/hive_get_my_registration', { method: 'POST', body: {}, token: await participantToken() });
    if (version !== state.editLoadVersion) return;
    loaded = true;
    if (entry) { setEditMode(entry, entry.id, null); state.mode = 'own-edit'; }
    else resetForm();
  } catch (error) {
    if (version !== state.editLoadVersion) return;
    paintSignupAside('load-error');
    showError($('#form-error'), error.message);
  } finally {
    if (version === state.editLoadVersion) { $('#submit-button').disabled = !loaded; paintParticipant(); }
  }
}

$('#discord-login').addEventListener('click', async () => {
  showError($('#discord-error'), '');
  $('#discord-login').disabled = true;
  try {
    if (!discordAuth) throw new Error('Die Anmeldung ist noch nicht eingerichtet.');
    const redirectTo = new URL('anmeldung/', document.baseURI).href.split('#')[0].split('?')[0];
    const { error } = await discordAuth.signInWithOAuth({ provider: 'discord', options: { redirectTo } });
    if (error) throw error;
  } catch (error) { showError($('#discord-error'), error.message); $('#discord-login').disabled = false; }
});
$('#discord-logout').addEventListener('click', async () => {
  const { error } = await discordAuth.signOut({ scope: 'local' });
  if (error) { showError($('#discord-error'), 'Abmelden fehlgeschlagen. Bitte versuche es erneut.'); return; }
  participant = null;
  resetForm();
  paintParticipant();
});
$('#edit-my-entry').addEventListener('click', () => { loadParticipantEntry(++state.editLoadVersion); });

async function initializeParticipant() {
  try {
    if (!discordAuth) return;
    const initialization = await discordAuth.initialize();
    if (initialization.error) throw initialization.error;
    const { data, error } = await discordAuth.getSession();
    if (error) throw error;
    participant = data.session?.user || null;
    discordAuth.onAuthStateChange((event, session) => {
      participant = session?.user || null;
      if (event === 'SIGNED_OUT' && state.mode !== 'admin-edit') { resetForm(); paintParticipant(); }
    });
  } catch (error) {
    showError($('#discord-error'), 'Discord-Anmeldung fehlgeschlagen: ' + error.message);
  } finally {
    participantReady = true;
    // OAuth errors can otherwise be mistaken for a welcome-page hash.
    const url = new URL(location.href);
    if (url.searchParams.has('code') || url.searchParams.has('error') || url.hash.includes('error=')) {
      url.searchParams.delete('code'); url.searchParams.delete('error'); url.searchParams.delete('error_code'); url.searchParams.delete('error_description');
      url.hash = '#/anmeldung'; history.replaceState(null, '', url);
    }
    route();
  }
}

renderAllPickers();
route();
initializeParticipant();

$("#credits-toggle").addEventListener("toggle", (event) => {
  $("#footer-credits").hidden = !event.currentTarget.open;
});
