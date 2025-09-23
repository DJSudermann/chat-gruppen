// Beginn des Skripts – Überarbeitung mit offiziellen Typen & getAllPages
import { churchtoolsClient } from '@churchtools/churchtools-client';
import type { Person as CtPerson, Group as CtGroup, GroupMember as CtGroupMember, GroupType as CtGroupType } from './utils/ct-types';
import pkg from '../package.json' assert { type: 'json' };

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

const VERSION: string = (pkg as any)?.version ?? '0.0.0';

// --- Leichte UI-Typen ---
type DisplayPerson = {
  id: string;
  firstName: string;
  lastName: string;
};

interface GroupItem {
  id: string;
  name: string;
}

interface GroupTypeItem {
  id: string;
  name: string;
}

// --- Mini-Utils ---
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
  return (s || '').toLowerCase();
}

// Fallback-sicherer Fetch über alle Seiten: nutzt churchtoolsClient.getAllPages, 
// fällt bei fehlender Meta/Pagination automatisch auf manuelle Paginierung zurück.
async function fetchAll<T = any>(url: string, params: Record<string, any> = {}): Promise<T[]> {
  try {
    const res: any = await (churchtoolsClient as any).getAllPages(url, params);
    if (Array.isArray(res)) return res as T[];
    if (Array.isArray(res?.data)) return res.data as T[];
  } catch (_) {
    // Fallback unten
  }
  const out: T[] = [];
  let page = 1;
  for (let i = 0; i < 100; i++) {
    const r: any = await churchtoolsClient.get<any>(url, { ...params, page });
    const arr: T[] = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []);
    out.push(...arr);
    const current = r?.meta?.pagination?.current;
    const last = r?.meta?.pagination?.lastPage;
    if (!current || !last || current >= last || arr.length === 0) break;
    page++;
  }
  return out;
}

// --- Hauptlogik ---
(async function main() {
  // 1) whoami
  const who = await churchtoolsClient.get<CtPerson>('/whoami');
  const mainUser: DisplayPerson = {
    id: String(who.id),
    firstName: String(who.firstName ?? ''),
    lastName: String(who.lastName ?? ''),
  };

  // 2) Personen **vollständig** laden (offizielle Typen + getAllPages)
  const personsAll = await fetchAll<CtPerson>('/persons');
  const persons: DisplayPerson[] = personsAll.map((p) => ({
    id: String(p.id),
    firstName: String((p as any).firstName ?? ''),
    lastName: String((p as any).lastName ?? ''),
  }));
  const personsById = new Map<string, DisplayPerson>(persons.map((p) => [p.id, p]));

  // 3) Gruppen & Gruppentypen laden (ebenfalls via getAllPages)
  const groupsAll = await fetchAll<CtGroup>('/groups');
  const groups: GroupItem[] = groupsAll
    .map((g: CtGroup) => ({ id: String(g.id), name: String(g.name) }))
    .filter((g) => g.id && g.name);

  const groupTypesAll = await fetchAll<CtGroupType>('/group/grouptypes');
  const groupTypes: GroupTypeItem[] = groupTypesAll
    .map((gt: CtGroupType) => ({ id: String(gt.id), name: String(gt.name) }))
    .filter((gt) => gt.id && gt.name);

  // --- UI ---
  const app = document.querySelector<HTMLDivElement>('#app')!;
  app.innerHTML = '';

  const container = el('div');
  container.setAttribute('style', 'max-width: 760px; margin: 40px auto; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; position:relative;');

  const header = el('h1', { text: `Hallo ${mainUser.firstName} ${mainUser.lastName}` });
  header.setAttribute('style', 'font-size: 22px; margin-bottom: 16px;');

  const searchInput = el('input') as HTMLInputElement;
  searchInput.placeholder = 'Nach Vor-, Nachname oder Gruppenname suchen…';
  searchInput.setAttribute('style', 'width:100%; padding:10px 12px; margin-bottom:12px; border:1px solid #d1d5db; border-radius:8px;');

  const results = el('div');
  results.setAttribute('style', 'display:grid; gap:8px; margin-bottom:20px;');

  const selectionList = el('div');
  selectionList.setAttribute('style', 'margin-bottom:16px; display:grid; gap:6px;');

  // Gruppe konfigurieren
  const configCard = el('div');
  configCard.setAttribute('style', 'border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin-bottom:12px; background:#fafafa;');

  const cfgTitle = el('h2', { text: 'Gruppe konfigurieren' });
  cfgTitle.setAttribute('style', 'font-size:16px; margin:0 0 10px 0;');

  const cfgGrid = el('div');
  cfgGrid.setAttribute('style', 'display:grid; grid-template-columns: 1fr; gap:10px;');

  const typeWrap = el('label');
  typeWrap.setAttribute('style', 'display:grid; gap:6px;');
  const typeSpan = el('span', { text: 'Gruppentyp' });
  const groupTypeSelect = el('select') as HTMLSelectElement;
  groupTypeSelect.setAttribute('style', 'padding:8px 10px; border:1px solid #d1d5db; border-radius:8px; background:#fff;');
  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = 'Bitte wählen…';
  groupTypeSelect.append(placeholderOpt);
  for (const gt of groupTypes) {
    const opt = document.createElement('option');
    opt.value = gt.id;
    opt.textContent = gt.name;
    groupTypeSelect.append(opt);
  }
  typeWrap.append(typeSpan, groupTypeSelect);

  const nameWrap = el('label');
  nameWrap.setAttribute('style', 'display:grid; gap:6px;');
  const nameSpan = el('span', { text: 'Gruppenname' });
  const groupNameInput = el('input') as HTMLInputElement;
  groupNameInput.placeholder = 'z. B. Gottesdienste';
  groupNameInput.setAttribute('style', 'padding:8px 10px; border:1px solid #d1d5db; border-radius:8px;');
  nameWrap.append(nameSpan, groupNameInput);

  const chatWrap = el('label');
  chatWrap.setAttribute('style', 'display:flex; align-items:center; gap:8px; user-select:none;');
  const chatCheckbox = document.createElement('input');
  chatCheckbox.type = 'checkbox';
  const chatSpan = el('span', { text: 'Chat direkt aktivieren' });
  chatWrap.append(chatCheckbox, chatSpan);

  cfgGrid.append(typeWrap, nameWrap, chatWrap);
  configCard.append(cfgTitle, cfgGrid);

  const exportBtn = el('button', { text: 'IDs & Namen in Textfeld ausgeben' });
  exportBtn.setAttribute('style', [
    'padding:10px 14px',
    'background:#2563eb',
    'color:white',
    'border:none',
    'border-radius:8px',
    'cursor:pointer',
    'margin-bottom:10px',
    'box-shadow: 0 1px 2px rgba(0,0,0,.05)'
  ].join(';'));
  exportBtn.addEventListener('mouseenter', () => (exportBtn.style.background = '#1d4ed8'));
  exportBtn.addEventListener('mouseleave', () => (exportBtn.style.background = '#2563eb'));

  const outputArea = document.createElement('textarea');
  outputArea.readOnly = true;
  outputArea.setAttribute('style', "width:100%; min-height:160px; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:13px;");

  const versionBadge = el('div', { text: `v${VERSION}` });
  versionBadge.setAttribute('style', 'position:fixed; right:10px; bottom:10px; font-size:12px; color:#6b7280; opacity:.8;');

  container.append(header, searchInput, results, selectionList, configCard, exportBtn, outputArea, versionBadge);
  app.append(container);

  // --- State ---
  const selected = new Map<string, DisplayPerson>();
  selected.set(mainUser.id, mainUser);

  type PersonRow = { person: DisplayPerson; groups: string[] };
  type GroupRow = { group: GroupItem; members: DisplayPerson[] };
  let lastRendered: { groups: GroupRow[]; persons: PersonRow[] } = { groups: [], persons: [] };

  // Cache für Gruppenmitglieder
  const groupMembersCache = new Map<string, DisplayPerson[]>();
  async function fetchGroupMembers(groupId: string): Promise<DisplayPerson[]> {
    if (groupMembersCache.has(groupId)) return groupMembersCache.get(groupId)!;
    const all = await fetchAll<CtGroupMember>(`/groups/${groupId}/members`);
    const mapped: DisplayPerson[] = all.map((m: CtGroupMember) => {
      const pid = String((m as any).personId ?? (m as any)?.person?.domainIdentifier ?? '');
      if (!pid) return null;
      const fallback = personsById.get(pid);
      const firstName = String((m as any)?.person?.domainAttributes?.firstName ?? fallback?.firstName ?? '');
      const lastName  = String((m as any)?.person?.domainAttributes?.lastName  ?? fallback?.lastName  ?? '');
      return { id: pid, firstName, lastName };
    }).filter((p): p is DisplayPerson => !!p);
    groupMembersCache.set(groupId, mapped);
    return mapped;
  }

  function renderSelection() {
    selectionList.innerHTML = '';
    if (!selected.size) {
      selectionList.textContent = 'Noch keine Auswahl.';
      return;
    }
    [...selected.values()].forEach((p) => {
      const row = el('div');
      row.setAttribute('style', 'display:flex; justify-content:space-between; align-items:center; border:1px solid #ddd; border-radius:6px; padding:6px;');
      const span = el('span', { text: `${p.firstName} ${p.lastName} (ID: ${p.id})` });
      const removeBtn = el('button', { text: 'Entfernen' });
      removeBtn.setAttribute('style', 'padding:4px 8px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer;');
      removeBtn.addEventListener('click', () => {
        selected.delete(p.id);
        renderSelection();
        renderSearch(lastRendered.groups, lastRendered.persons);
      });
      row.append(span, removeBtn);
      selectionList.append(row);
    });
  }

  function toggleGroupSelection(members: DisplayPerson[], checked: boolean) {
    if (checked) members.forEach((m) => selected.set(m.id, m));
    else members.forEach((m) => selected.delete(m.id));
    renderSelection();
    renderSearch(lastRendered.groups, lastRendered.persons);
  }

  function renderSearch(groupRows: GroupRow[], personRows: PersonRow[]) {
    lastRendered = { groups: groupRows, persons: personRows };
    results.innerHTML = '';

    if (!groupRows.length && !personRows.length) {
      const empty = el('div', { text: 'Keine Treffer.' });
      empty.setAttribute('style', 'padding:8px; color:#6b7280; border:1px dashed #e5e7eb; border-radius:6px;');
      results.append(empty);
      return;
    }

    // Gruppen-Zeilen
    groupRows.forEach(({ group, members }) => {
      const row = el('label');
      row.setAttribute('style', [
        'display:flex', 'gap:8px', 'align-items:center',
        'border:1px solid #dbe1ea', 'padding:8px', 'border-radius:8px', 'background:#f8fafc'
      ].join(';'));

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = members.length > 0 && members.every((m) => selected.has(m.id));
      cb.addEventListener('change', () => toggleGroupSelection(members, cb.checked));

      const label = el('span', { text: `Gruppe: ${group.name} (${members.length} Mitglieder)` });
      label.setAttribute('style', 'font-weight:600;');

      row.append(cb, label);
      results.append(row);
    });

    // Personen-Zeilen
    personRows.forEach(({ person, groups }) => {
      const row = el('label');
      row.setAttribute('style', 'display:flex; gap:8px; align-items:center; border:1px solid #eee; padding:6px; border-radius:8px;');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.has(person.id);
      cb.addEventListener('change', () => {
        if (cb.checked) selected.set(person.id, person);
        else selected.delete(person.id);
        renderSelection();
        renderSearch(lastRendered.groups, lastRendered.persons);
      });

      let labelText = `${person.firstName} ${person.lastName} (ID: ${person.id}`;
      if (groups.length) labelText += `, Gruppe: ${groups.join(', ')}`;
      labelText += ')';
      const label = el('span', { text: labelText });

      row.append(cb, label);
      results.append(row);
    });
  }

  // ---- Suche ----
  const runSearch = debounce(async () => {
    const qRaw = searchInput.value.trim();
    const q = norm(qRaw);

    if (!q) {
      results.innerHTML = '';
      lastRendered = { groups: [], persons: [] };
      return;
    }

    // Personentreffer aus lokal **vollständiger** Liste
    const personMatches = persons.filter((u) => norm(u.firstName).includes(q) || norm(u.lastName).includes(q));
    const personRows: PersonRow[] = personMatches.map((p) => ({ person: p, groups: [] }));

    // Gruppentreffer (lokal aus vollständiger Liste)
    const matchingGroups = groups.filter((g) => norm(g.name).includes(q));

    const groupRows: GroupRow[] = [];
    const fromGroups: PersonRow[] = [];

    for (const g of matchingGroups) {
      const members = await fetchGroupMembers(g.id);
      groupRows.push({ group: g, members });

      for (const mp of members) {
        const person = personsById.get(mp.id) ?? mp;
        const existing = fromGroups.find((x) => x.person.id === person.id);
        if (existing) {
          if (!existing.groups.includes(g.name)) existing.groups.push(g.name);
        } else {
          fromGroups.push({ person, groups: [g.name] });
        }
      }
    }

    // Zusammenführen & Deduplizieren der Personenzeilen
    const combined = new Map<string, PersonRow>();
    for (const e of [...personRows, ...fromGroups]) {
      const prev = combined.get(e.person.id);
      if (!prev) combined.set(e.person.id, { person: e.person, groups: [...new Set(e.groups)] });
      else prev.groups = [...new Set([...prev.groups, ...e.groups])];
    }

    renderSearch(groupRows, [...combined.values()]);
  }, 250);

  searchInput.addEventListener('input', runSearch);

  // Export
  exportBtn.addEventListener('click', () => {
    const typeLabel = groupTypeSelect.options[groupTypeSelect.selectedIndex]?.text || '-';
    const typeValue = groupTypeSelect.value || '';

    const cfgLines = [
      '[Gruppen-Konfiguration]',
      `Typ: ${typeLabel}${typeValue ? ` (ID: ${typeValue})` : ''}`,
      `Name: ${groupNameInput.value || '-'}`,
      `Chat aktiv: ${chatCheckbox.checked ? 'Ja' : 'Nein'}`,
    ];
    const personLines = [...selected.values()].map((p) => `${p.id}    ${p.firstName} ${p.lastName}`);
    outputArea.value = cfgLines.join('\n') + '\n\n' + personLines.join('\n');
  });

  // Initiale Auswahl anzeigen
  renderSelection();
})();
