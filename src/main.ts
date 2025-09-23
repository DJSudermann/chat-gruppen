import type {Group, GroupMember, MemberPreview, Person} from './utils/ct-types';
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

// Personen-Auswahl + Gruppensuche & -auswahl
// + Bereich „Gruppe konfigurieren“ (Typ, Name, Chat aktiv?)
// - Checkbox = direkt ausgewählt; unten Live-Auswahl (entfernbar)
// - Export-Button schreibt Konfiguration + ID/Name ins Textfeld
// - Eingeloggter User automatisch vorausgewählt
// - Keine Debug-Logs

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

interface GroupItem {
  id: string; // String für Konsistenz
  name: string;
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
    .replace(/\p{M}/gu, "") // Diakritika entfernen
    .toLowerCase();
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
  const usersArray: any[] = Array.isArray(usersRaw) ? usersRaw : (usersRaw?.data ?? []);
  const users: Person[] = usersArray.map((p) => ({
    id: String(p.id),
    firstName: p.firstName,
    lastName: p.lastName,
  }));
  const usersById = new Map<string, Person>(users.map((p) => [p.id, p]));

  const groupsRaw = await churchtoolsClient.get<any>(`/groups`, {});
  const groupsArr: any[] = Array.isArray(groupsRaw) ? groupsRaw : (groupsRaw?.data ?? []);
  const groups: GroupItem[] = groupsArr
    .map((g) => ({ id: String(g.id ?? g.groupId ?? g.domainIdentifier), name: String(g.name ?? g.title ?? "") }))
    .filter((g) => g.id && g.name);

  // ---- UI ----
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = "";

  const container = el("div");
  container.setAttribute("style", "max-width: 760px; margin: 40px auto; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;");

  const header = el("h1", { text: `Hallo ${mainUser.firstName} ${mainUser.lastName}` });
  header.setAttribute("style", "font-size: 22px; margin-bottom: 16px;");

  const searchInput = el("input") as HTMLInputElement;
  searchInput.placeholder = "Nach Vor-, Nachname oder Gruppenname suchen…";
  searchInput.setAttribute("style", "width:100%; padding:10px 12px; margin-bottom:12px; border:1px solid #d1d5db; border-radius:8px;");

  const results = el("div");
  results.setAttribute("style", "display:grid; gap:8px; margin-bottom:20px;");

  const selectionList = el("div");
  selectionList.setAttribute("style", "margin-bottom:16px; display:grid; gap:6px;");

  // --- Gruppe konfigurieren ---
  const configCard = el("div");
  configCard.setAttribute("style", "border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin-bottom:12px; background:#fafafa;");

  const cfgTitle = el("h2", { text: "Gruppe konfigurieren" });
  cfgTitle.setAttribute("style", "font-size:16px; margin:0 0 10px 0;");

  const cfgGrid = el("div");
  cfgGrid.setAttribute("style", "display:grid; grid-template-columns: 1fr; gap:10px;");

  // Typ (Select)
  const typeWrap = el("label");
  typeWrap.setAttribute("style", "display:grid; gap:6px;");
  const typeSpan = el("span", { text: "Gruppentyp" });
  const groupTypeSelect = el("select") as HTMLSelectElement;
  groupTypeSelect.setAttribute("style", "padding:8px 10px; border:1px solid #d1d5db; border-radius:8px; background:#fff;");
  const typeOptions = ["Bitte wählen…", "Dienst", "Kleingruppe", "Team", "Sonstiges"];
  typeOptions.forEach((txt, i) => {
    const opt = document.createElement("option");
    opt.value = i === 0 ? "" : txt;
    opt.textContent = txt;
    groupTypeSelect.append(opt);
  });
  typeWrap.append(typeSpan, groupTypeSelect);

  // Name (Input)
  const nameWrap = el("label");
  nameWrap.setAttribute("style", "display:grid; gap:6px;");
  const nameSpan = el("span", { text: "Gruppenname" });
  const groupNameInput = el("input") as HTMLInputElement;
  groupNameInput.placeholder = "z. B. Gottesdienste";
  groupNameInput.setAttribute("style", "padding:8px 10px; border:1px solid #d1d5db; border-radius:8px;");
  nameWrap.append(nameSpan, groupNameInput);

  // Chat aktiv? (Checkbox)
  const chatWrap = el("label");
  chatWrap.setAttribute("style", "display:flex; align-items:center; gap:8px; user-select:none;");
  const chatCheckbox = document.createElement("input");
  chatCheckbox.type = "checkbox";
  const chatSpan = el("span", { text: "Chat direkt aktivieren" });
  chatWrap.append(chatCheckbox, chatSpan);

  cfgGrid.append(typeWrap, nameWrap, chatWrap);
  configCard.append(cfgTitle, cfgGrid);

  const exportBtn = el("button", { text: "IDs & Namen in Textfeld ausgeben" });
  exportBtn.setAttribute(
    "style",
    [
      "padding:10px 14px",
      "background:#2563eb",
      "color:white",
      "border:none",
      "border-radius:8px",
      "cursor:pointer",
      "margin-bottom:10px",
      "box-shadow: 0 1px 2px rgba(0,0,0,.05)",
    ].join(";")
  );
  exportBtn.addEventListener("mouseenter", () => (exportBtn.style.background = "#1d4ed8"));
  exportBtn.addEventListener("mouseleave", () => (exportBtn.style.background = "#2563eb"));

  const outputArea = document.createElement("textarea");
  outputArea.readOnly = true;
  outputArea.setAttribute("style", "width:100%; min-height:160px; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:13px;");

  // Reihenfolge: Auswahl → Konfiguration → Button → Ausgabe
  container.append(header, searchInput, results, selectionList, configCard, exportBtn, outputArea);
  app.append(container);

  // ---- State ----
  const selected = new Map<string, Person>();
  selected.set(mainUser.id, mainUser); // eingeloggter User vorselektiert

  type PersonRow = { person: Person; groups: string[] };
  type GroupRow = { group: GroupItem; members: Person[] };
  let lastRendered: { groups: GroupRow[]; persons: PersonRow[] } = { groups: [], persons: [] };

  // ---- Render ----
  function toggleGroupSelection(members: Person[], checked: boolean) {
    if (checked) {
      members.forEach((m) => selected.set(m.id, m));
    } else {
      members.forEach((m) => selected.delete(m.id));
    }
    renderSelection();
    renderSearch(lastRendered.groups, lastRendered.persons);
  }

  function renderSearch(groupRows: GroupRow[], personRows: PersonRow[]) {
    lastRendered = { groups: groupRows, persons: personRows };
    results.innerHTML = "";

    if (!groupRows.length && !personRows.length) {
      const empty = el("div", { text: "Keine Treffer." });
      empty.setAttribute("style", "padding:8px; color:#6b7280; border:1px dashed #e5e7eb; border-radius:6px;");
      results.append(empty);
      return;
    }

    // Gruppen-Zeilen (anklickbar für Sammelauswahl)
    groupRows.forEach(({ group, members }) => {
      const row = el("label");
      row.setAttribute(
        "style",
        [
          "display:flex",
          "gap:8px",
          "align-items:center",
          "border:1px solid #dbe1ea",
          "padding:8px",
          "border-radius:8px",
          "background:#f8fafc",
        ].join(";")
      );

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = members.length > 0 && members.every((m) => selected.has(m.id));
      cb.addEventListener("change", () => toggleGroupSelection(members, cb.checked));

      const label = el("span", { text: `Gruppe: ${group.name} (${members.length} Mitglieder)` });
      label.setAttribute("style", "font-weight:600;");

      row.append(cb, label);
      results.append(row);
    });

    // Personen-Zeilen
    personRows.forEach(({ person, groups }) => {
      const row = el("label");
      row.setAttribute("style", "display:flex; gap:8px; align-items:center; border:1px solid #eee; padding:6px; border-radius:8px;");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(person.id);
      cb.addEventListener("change", () => {
        if (cb.checked) selected.set(person.id, person); else selected.delete(person.id);
        renderSelection();
        renderSearch(lastRendered.groups, lastRendered.persons);
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
        renderSearch(lastRendered.groups, lastRendered.persons);
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
      lastRendered = { groups: [], persons: [] };
      return;
    }

    // 1) Personentreffer (lokal)
    const personMatches = users.filter((u) => norm(u.firstName).includes(q) || norm(u.lastName).includes(q));
    const personRows: PersonRow[] = personMatches.map((p) => ({ person: p, groups: [] }));

    // 2) Gruppentreffer (anzeigen + Mitglieder selektierbar)
    const matchingGroups = groups.filter((g) => norm(g.name).includes(q));

    const groupRows: GroupRow[] = [];
    const fromGroups: PersonRow[] = [];

    for (const g of matchingGroups) {
      const res = await churchtoolsClient.get<any>(`/groups/${g.id}/members`, {});
      const members = Array.isArray(res) ? res : (res?.data ?? []);
      const memberPersons: Person[] = members.map((m: any) => ({
        id: String(m?.person?.domainIdentifier ?? m?.personId ?? m?.id),
        firstName: String(m?.person?.domainAttributes?.firstName ?? ""),
        lastName: String(m?.person?.domainAttributes?.lastName ?? ""),
      }));
      groupRows.push({ group: g, members: memberPersons });

      // Personen aus Gruppen ebenfalls in den Treffer-Pool aufnehmen
      for (const mp of memberPersons) {
        const person = usersById.get(mp.id) ?? mp; // falls /persons unvollständig
        const existing = fromGroups.find((x) => x.person.id === person.id);
        if (existing) {
          if (!existing.groups.includes(g.name)) existing.groups.push(g.name);
        } else {
          fromGroups.push({ person, groups: [g.name] });
        }
      }
    }

    // 3) Zusammenführen & Deduplizieren der Personenzeilen
    const combined: Record<string, PersonRow> = {};
    for (const e of [...personRows, ...fromGroups]) {
      const id = e.person.id;
      if (!combined[id]) {
        combined[id] = { person: e.person, groups: [...new Set(e.groups)] };
      } else {
        combined[id].groups = [...new Set([...combined[id].groups, ...e.groups])];
      }
    }

    renderSearch(groupRows, Object.values(combined));
  }, 350);

  searchInput.addEventListener("input", runSearch);

  // ---- Export ----
  exportBtn.addEventListener("click", () => {
    const cfgLines = [
      "[Gruppen-Konfiguration]",
      `Typ: ${groupTypeSelect.value || '-'}`,
      `Name: ${groupNameInput.value || '-'}`,
      `Chat aktiv: ${chatCheckbox.checked ? 'Ja' : 'Nein'}`,
    ];
    const personLines = [...selected.values()].map((p) => `${p.id}\t${p.firstName} ${p.lastName}`);
    outputArea.value = cfgLines.join("\n") + "\n\n" + personLines.join("\n");
  });

  // Initiale Auswahl anzeigen
  renderSelection();
})();