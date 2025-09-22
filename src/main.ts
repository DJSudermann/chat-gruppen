import type { Person } from './utils/ct-types';
import { churchtoolsClient } from '@churchtools/churchtools-client';

// only import reset.css in development mode to keep the production bundle small and to simulate CT environment
if (import.meta.env.MODE === 'development') {
    import('./utils/reset.css');
}

declare const window: Window &
    typeof globalThis & {
        settings: {
            base_url?: string;
        };
    };

const baseUrl = window.settings?.base_url ?? import.meta.env.VITE_BASE_URL;
churchtoolsClient.setBaseUrl(baseUrl);

const username = import.meta.env.VITE_USERNAME;
const password = import.meta.env.VITE_PASSWORD;
if (import.meta.env.MODE === 'development' && username && password) {
    await churchtoolsClient.post('/login', { username, password });
}

const KEY = import.meta.env.VITE_KEY;
export { KEY };

// Umbau: nutzt /groups/members als Basis + /groups/{groupId} zur Namensauflösung
// Features:
// - Suche nach Vor-/Nachname
// - Suche nach **Gruppennamen** (aus /groups/{id})
// - Checkboxen wählen direkt aus; unten Live-Auswahl mit Entfernen
// - Export-Button gibt ID + Namen aus
// - IDs überall als String
// - Debug-Logs enthalten

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text) node.textContent = options.text;
  return node;
}

function debounce<T extends (...args: any[]) => void>(fn: T, wait = 250) {
  let t: number | undefined;
  return (...args: Parameters<T>) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), wait);
  };
}

function norm(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// ---- Normalizer für API-Antworten ----
function normalizePersons(res: any): Person[] {
  const arr = Array.isArray(res) ? res : res?.data ?? [];
  return arr.map((p: any) => ({
    id: String(p.id ?? p.personId ?? p.domainIdentifier ?? ""),
    firstName: String(p.firstName ?? p?.domainAttributes?.firstName ?? ""),
    lastName: String(p.lastName ?? p?.domainAttributes?.lastName ?? ""),
  }));
}

function extractGroupName(res: any): string | null {
  // /groups/{id} kann je nach Version { name } oder { data: { name } } oder { title } liefern
  const src = res?.data ?? res;
  const name = src?.name ?? src?.title ?? src?.information?.name ?? null;
  return name ? String(name) : null;
}

(async function main() {
  // ---- Daten laden ----
  const whoami = await churchtoolsClient.get<any>(`/whoami`);
  const mainUser: Person = {
    id: String(whoami.id),
    firstName: whoami.firstName,
    lastName: whoami.lastName,
  };

  const usersRaw = await churchtoolsClient.get<any>(`/persons`, {});
  const users: Person[] = normalizePersons(usersRaw);
  const usersById = new Map<string, Person>(users.map((p) => [p.id, p]));

  // Alle Mitgliedschaften (leichtgewichtiger, stabiler) – liefert personId + groupId
  const membershipsRes = await churchtoolsClient.get<any>(`/groups/members`, {});
  const memberships: Array<{ personId: number; groupId: number; groupMemberStatus?: string; deleted?: boolean }> =
    (membershipsRes?.data ?? []) as any[];

  // Map: groupId → Set(personId)
  const groupToPersons = new Map<string, Set<string>>();
  for (const m of memberships) {
    if (m.deleted) continue;
    if (m.groupMemberStatus && m.groupMemberStatus !== "active") continue;
    const gid = String(m.groupId);
    const pid = String(m.personId);
    if (!groupToPersons.has(gid)) groupToPersons.set(gid, new Set());
    groupToPersons.get(gid)!.add(pid);
  }

  console.log("/groups/members parsed:", groupToPersons);

  // Cache für Gruppen-Namen
  const groupNameCache = new Map<string, string>();
  async function fetchGroupName(groupId: string): Promise<string | null> {
    if (groupNameCache.has(groupId)) return groupNameCache.get(groupId)!;
    try {
      const res = await churchtoolsClient.get<any>(`/groups/${groupId}`, {});
      const name = extractGroupName(res);
      if (name) groupNameCache.set(groupId, name);
      console.log(`Group ${groupId} name →`, name);
      return name;
    } catch (e) {
      console.warn(`Fehler beim Laden von /groups/${groupId}`, e);
      return null;
    }
  }

  // Optionales Prefetching: lade Namen aller bekannten Gruppen einmalig
  await Promise.all([...groupToPersons.keys()].map((gid) => fetchGroupName(gid)));

  // ---- UI ----
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = "";

  const container = el("div");
  container.setAttribute("style", "max-width: 700px; margin: 40px auto; font-family: sans-serif;");

  const header = el("h1", { text: `Welcome ${mainUser.firstName} ${mainUser.lastName}` });
  header.setAttribute("style", "font-size: 20px; margin-bottom: 16px;");

  const searchInput = el("input") as HTMLInputElement;
  searchInput.placeholder = "Nach Vor-, Nachname oder Gruppenname suchen…";
  searchInput.setAttribute("style", "width:100%; padding:8px; margin-bottom:10px;");

  const results = el("div");
  results.setAttribute("style", "display:grid; gap:6px; margin-bottom:20px;");

  const selectionList = el("div");
  selectionList.setAttribute("style", "margin-bottom:20px; display:grid; gap:6px;");

  const exportBtn = el("button", { text: "IDs & Namen in Textfeld ausgeben" });
  exportBtn.setAttribute(
    "style",
    [
      "padding:10px 14px",
      "background:#2563eb",
      "color:white",
      "border:none",
      "border-radius:6px",
      "cursor:pointer",
      "margin-bottom:10px",
      "box-shadow: 0 1px 2px rgba(0,0,0,.05)",
    ].join(";")
  );
  exportBtn.addEventListener("mouseenter", () => (exportBtn.style.background = "#1d4ed8"));
  exportBtn.addEventListener("mouseleave", () => (exportBtn.style.background = "#2563eb"));

  const outputArea = document.createElement("textarea");
  outputArea.readOnly = true;
  outputArea.setAttribute("style", "width:100%; min-height:120px;");

  container.append(header, searchInput, results, selectionList, exportBtn, outputArea);
  app.append(container);

  // ---- State ----
  const selected = new Map<string, Person>();
  selected.set(mainUser.id, mainUser); // eingeloggter User vorselektiert

  // ---- Render ----
  function renderSearch(list: { person: Person; groups: string[] }[]) {
    results.innerHTML = "";
    if (!list.length) {
      const empty = el("div", { text: "Keine Treffer." });
      empty.setAttribute("style", "padding:8px; color:#6b7280; border:1px dashed #e5e7eb; border-radius:6px;");
      results.append(empty);
      return;
    }

    list.forEach(({ person, groups }) => {
      const row = el("label");
      row.setAttribute("style", "display:flex; gap:8px; align-items:center; border:1px solid #eee; padding:6px; border-radius:6px;");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(person.id);
      cb.addEventListener("change", () => {
        if (cb.checked) {
          selected.set(person.id, person);
        } else {
          selected.delete(person.id);
        }
        renderSelection();
      });

      let labelText = `${person.firstName} ${person.lastName} (ID: ${person.id}`;
      if (groups.length) labelText += `, Gruppe: ${groups.join(", ")}`;
      labelText += ")";

      const label = el("span", { text: labelText });
      row.append(cb, label);
      results.append(row);
    });
  }

  function renderSelection() {
    selectionList.innerHTML = "";
    if (!selected.size) {
      selectionList.textContent = "Noch keine Auswahl.";
      return;
    }
    [...selected.values()].forEach((p) => {
      const row = el("div");
      row.setAttribute("style", "display:flex; justify-content:space-between; align-items:center; border:1px solid #ddd; border-radius:6px; padding:6px;");

      const span = el("span", { text: `${p.firstName} ${p.lastName} (ID: ${p.id})` });

      const removeBtn = el("button", { text: "Entfernen" });
      removeBtn.setAttribute("style", "padding:4px 8px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer;");
      removeBtn.addEventListener("click", () => {
        selected.delete(p.id);
        renderSelection();
      });

      row.append(span, removeBtn);
      selectionList.append(row);
    });
  }

  // ---- Suche ----
  const runSearch = debounce(async () => {
    const qRaw = searchInput.value.trim();
    const q = norm(qRaw);
    if (!q) {
      results.innerHTML = "";
      return;
    }

    // Personentreffer (lokal)
    const personMatches = users.filter((u) => norm(u.firstName).includes(q) || norm(u.lastName).includes(q));
    const enrichedPersons = personMatches.map((p) => ({ person: p, groups: [] }));

    // Gruppennamen filtern (aus Cache, ggf. leerer Name übersprungen)
    const groupHits: Array<{ id: string; name: string }> = [];
    for (const gid of groupToPersons.keys()) {
      const name = groupNameCache.get(gid) ?? (await fetchGroupName(gid)) ?? "";
      if (!name) continue;
      if (norm(name).includes(q)) groupHits.push({ id: gid, name });
    }
    console.log("Group hits for query:", qRaw, groupHits);

    // Mitglieder dieser Gruppen auflösen
    const groupMatches: { person: Person; groups: string[] }[] = [];
    for (const { id: gid, name } of groupHits) {
      const pids = [...(groupToPersons.get(gid) ?? new Set<string>())];
      for (const pid of pids) {
        const person = usersById.get(pid);
        if (!person) continue; // Falls /persons nicht alle Personen enthält
        const existing = groupMatches.find((gm) => gm.person.id === pid);
        if (existing) {
          if (!existing.groups.includes(name)) existing.groups.push(name);
        } else {
          groupMatches.push({ person, groups: [name] });
        }
      }
    }

    // Zusammenführen & Deduplizieren
    const combined: Record<string, { person: Person; groups: string[] }> = {};
    for (const e of [...enrichedPersons, ...groupMatches]) {
      const id = e.person.id;
      if (!combined[id]) {
        combined[id] = { person: e.person, groups: [...new Set(e.groups)] };
      } else {
        combined[id].groups = [...new Set([...combined[id].groups, ...e.groups])];
      }
    }

    const resultList = Object.values(combined);
    console.log("Search results (combined):", resultList);
    renderSearch(resultList);
  }, 350);

  searchInput.addEventListener("input", runSearch);

  exportBtn.addEventListener("click", () => {
    const lines = [...selected.values()].map((p) => `${p.id}\t${p.firstName} ${p.lastName}`);
    outputArea.value = lines.join("\n");
  });

  // Initiale Auswahl anzeigen
  renderSelection();
})();