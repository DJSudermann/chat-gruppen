// Beginn des Skripts – Überarbeitung mit offiziellen Typen & getAllPages
import { churchtoolsClient } from '@churchtools/churchtools-client';
import type { Person, Group, GroupMember, GroupType, Role } from './utils/ct-types';
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



// --- Hauptlogik ---
(async function main() {
  // 1) whoami
  const mainUser = await churchtoolsClient.get<Person>('/whoami');
 

  // 2) Personen **vollständig** laden (offizielle Typen + getAllPages)
  const persons = await churchtoolsClient.getAllPages('/persons')as Person[];
  const personsById = new Map<number, Person>(persons.map((p) => [p.id, p]));

  // 3) Gruppen  laden (ebenfalls via getAllPages)
  const groups = await churchtoolsClient.getAllPages('/groups') as Group[];

  // Gruppentypen und deren Rollen - sind nicht paginiert
  const groupTypes = await churchtoolsClient.get<GroupType[]>('/group/grouptypes');

  const groupRoles = await churchtoolsClient.get<Role[]>('/group/roles');
  
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

  // Gruppentyp auswahl
  const typeWrap = el('label');
  typeWrap.setAttribute('style', 'display:grid; gap:6px;');
  const typeSpan = el('span', { text: 'Gruppentyp' });
  const groupTypeSelect = el('select') as HTMLSelectElement;
  groupTypeSelect.setAttribute('style', 'padding:8px 10px; border:1px solid #d1d5db; border-radius:8px; background:#fff;');
  for (const gt of groupTypes) {
    const opt = document.createElement('option');
    opt.value = gt.id.toString();
    opt.textContent = gt.name;
    groupTypeSelect.append(opt);
  }
  typeWrap.append(typeSpan, groupTypeSelect);

  
  function updateRolesForSelectedType() {
    const selectedTypeId = Number(groupTypeSelect.value);
    const rolesForType = groupRoles.filter(r => r.groupTypeId === selectedTypeId);
    mainUserRoleGeneratorSelect.innerHTML = '';
    otherUserRoleGeneratorSelect.innerHTML = '';
    for (const role of rolesForType) {
      const opt = document.createElement('option');
      const opt2 = document.createElement('option');  
      opt.value = role.id.toString();
      opt2.value = role.id.toString();  // gleiche Rolle für
      opt2
      opt.textContent = role.name;
      opt2.textContent = role.name;
      mainUserRoleGeneratorSelect.append(opt);
      otherUserRoleGeneratorSelect.append(opt2)
    }
    mainUserRoleGeneratorSelect.selectedIndex=1;
  }

  // Rolle des Hauptnutzers in der Gruppe
  const mainUserRoleGeneratornWrap = el('label');
  mainUserRoleGeneratornWrap.setAttribute('style', 'display:grid; gap:6px;');
  const mainUserRoleGeneratorSpan = el('span', { text: 'Welche Rolle wirst du haben?' });
  const mainUserRoleGeneratorSelect = el('select') as HTMLSelectElement;  
  mainUserRoleGeneratorSelect.setAttribute('style', 'padding:8px 10px; border:1px solid #d1d5db; border-radius:8px; background:#fff;');
  mainUserRoleGeneratornWrap.append(mainUserRoleGeneratorSpan, mainUserRoleGeneratorSelect);

  // Rolle der anderen Nutzer in der Gruppe
  const otherUserRoleGeneratornWrap = el('label');
  otherUserRoleGeneratornWrap.setAttribute('style', 'display:grid; gap:6px;');
  const otherUserRoleGeneratorSpan = el('span', { text: 'Welche Rolle werden die anderen haben?' });
  const otherUserRoleGeneratorSelect = el('select') as HTMLSelectElement;  
  otherUserRoleGeneratorSelect.setAttribute('style', 'padding:8px 10px; border:1px solid #d1d5db; border-radius:8px; background:#fff;');
  otherUserRoleGeneratornWrap.append(otherUserRoleGeneratorSpan, otherUserRoleGeneratorSelect);

  // Initiale Rollen laden
  updateRolesForSelectedType();
  groupTypeSelect.addEventListener('change', updateRolesForSelectedType);
  
  // Gruppenname
  const nameWrap = el('label');
  nameWrap.setAttribute('style', 'display:grid; gap:6px;');
  const nameSpan = el('span', { text: 'Gruppenname' });
  const groupNameInput = el('input') as HTMLInputElement;
  groupNameInput.placeholder = 'z. B. Gottesdienste';
  groupNameInput.setAttribute('style', 'padding:8px 10px; border:1px solid #d1d5db; border-radius:8px;');
  nameWrap.append(nameSpan, groupNameInput);

  // Chat direkt aktivieren
  const chatWrap = el('label');
  chatWrap.setAttribute('style', 'display:flex; align-items:center; gap:8px; user-select:none;');
  const chatCheckbox = document.createElement('input');
  chatCheckbox.type = 'checkbox';
  const chatSpan = el('span', { text: 'Chat direkt aktivieren' });
  chatWrap.append(chatCheckbox, chatSpan);

  cfgGrid.append(typeWrap, mainUserRoleGeneratornWrap, otherUserRoleGeneratornWrap  , nameWrap, chatWrap);
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
  const selected = new Map<number, Person>();
  selected.set(mainUser.id, mainUser);

  type PersonRow = { person: Person; groups: Group[] };
  type GroupRow = { group: Group; members: Person[] };

  // Cache für Gruppenmitglieder
  const groupMembersCache = new Map<number, Person[]>();

async function fetchGroupMembers(groupId: number): Promise<Person[]> {
  const cached = groupMembersCache.get(groupId);
  if (cached) return cached;
  console.log(`Lade Mitglieder für Gruppe ${groupId}…`);
  const members = await churchtoolsClient.getAllPages<GroupMember>(
    `/groups/${groupId}/members`
  );

  const seen = new Set<number>();
  const result: Person[] = [];

  for (const m of members) {
    // domainIdentifier ist ein String der numerischen Person.id
    const di = m.person?.domainIdentifier;
    const numIdFromDi = di ? Number(di) : undefined;

    const id =
      Number.isFinite(numIdFromDi) ? (numIdFromDi as number)
      : typeof m.personId === "number" ? m.personId
      : undefined;

    if (id == null || seen.has(id)) continue;

    const person = personsById.get(id);
    if (person) {
      result.push(person);
      seen.add(id);
    } 
  }

  groupMembersCache.set(groupId, result);
  return result;
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
      renderSearch(lastRenderedItems);
    });
    row.append(span, removeBtn);
    selectionList.append(row);
  });
}

function toggleGroupSelection(members: Person[], checked: boolean) {
  if (checked) members.forEach((m) => selected.set(m.id, m));
  else members.forEach((m) => selected.delete(m.id));
  renderSelection();
  renderSearch(lastRenderedItems);
}

type SearchItem =
  | { kind: 'group';  score: number; row: GroupRow }
  | { kind: 'person'; score: number; row: PersonRow };

// "Besserer" Treffer = höherer Score
function scoreText(text: string | undefined | null, q: string): number {
  const t = norm(text ?? '');
  if (!q || !t) return 0;
  if (t === q) return 1000;                           // exakter Match
  if (t.startsWith(q)) return 800 + Math.max(0, 50 - (t.length - q.length)); // Prefix + leichte Längenpräferenz
  const words = t.split(/\s+/);
  if (words.some(w => w.startsWith(q))) return 700;   // Wortanfang
  const idx = t.indexOf(q);
  if (idx >= 0) return 400 - idx;                     // irgendwo enthalten, früher ist besser
  return 0;
}

function scorePerson(person: Person, groups: Group[], q: string, matchedGroupIds: Set<number>): number {
  const nameScores = [
    scoreText(person.firstName, q),
    scoreText(person.lastName, q),
    scoreText(`${person.firstName ?? ''} ${person.lastName ?? ''}`.trim(), q),
    scoreText(`${person.lastName ?? ''} ${person.firstName ?? ''}`.trim(), q),
  ];
  const base = Math.max(...nameScores);

  // Falls Name nicht passt, aber Person in passender Gruppe ist → kleiner Boost
  const boost = Math.max(
    0,
    ...groups
      .filter(gr => matchedGroupIds.has(gr.id))
      .map(gr => scoreText(gr.name, q) * 0.6) // 60% des Gruppenscores
  );

  return Math.max(base, boost);
}


function renderSearch(items: SearchItem[]) {
  // Scrollbarer Container
  results.style.maxHeight = '60vh';
  results.style.overflowY = 'auto';
  results.style.display = 'flex';
  results.style.flexDirection = 'column';
  results.style.gap = '8px';
  results.innerHTML = '';

  if (!items.length) {
    const empty = el('div', { text: 'Keine Treffer.' });
    empty.setAttribute('style', 'padding:8px; color:#6b7280; border:1px dashed #e5e7eb; border-radius:6px;');
    results.append(empty);
    return;
  }

  for (const item of items) {
    if (item.kind === 'group') {
      const { group, members } = item.row;

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
    } else {
      const { person, groups } = item.row;

      const row = el('label');
      row.setAttribute('style', 'display:flex; gap:8px; align-items:center; border:1px solid #eee; padding:6px; border-radius:8px;');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.has(person.id);
      cb.addEventListener('change', () => {
        if (cb.checked) selected.set(person.id, person);
        else selected.delete(person.id);
        renderSelection();
        renderSearch(lastRenderedItems); // <- aktualisiere ohne neu zu suchen
      });

      const groupNames = groups.map(gr => gr?.name).filter(Boolean) as string[];
      let labelText = `${person.firstName ?? ''} ${person.lastName ?? ''} (ID: ${person.id}`;
      if (groupNames.length) labelText += `, Gruppe: ${groupNames.join(', ')}`;
      labelText += ')';

      const label = el('span', { text: labelText });

      row.append(cb, label);
      results.append(row);
    }
  }
}




// Globale letzte Anzeige jetzt als Items
let lastRenderedItems: SearchItem[] = [];

const runSearch = debounce(async () => {
  const qRaw = searchInput.value.trim();
  const q = norm(qRaw);

  if (!q) {
    results.innerHTML = '';
    lastRenderedItems = [];
    return;
  }

  // 1) Personentreffer nach Name (lokal)
  const personMatches = persons.filter(
    (u) => norm(u.firstName ?? '').startsWith(q) ||            // Prefix zuerst
           norm(u.lastName ?? '').startsWith(q)  ||
           norm(`${u.firstName ?? ''} ${u.lastName ?? ''}`).includes(q) ||
           norm(`${u.lastName ?? ''} ${u.firstName ?? ''}`).includes(q)
  );

  // Index: PersonId -> PersonRow
  const personRowsById = new Map<number, PersonRow>(
    personMatches.map(p => [p.id, { person: p, groups: [] } as PersonRow])
  );

  // 2) Gruppentreffer
  const matchingGroups = groups.filter((g) => norm(g.name ?? '').includes(q));
  const matchedGroupIds = new Set(matchingGroups.map(g => g.id));

  // 3) Gruppen-Mitglieder parallel holen & GroupRows bauen
  const groupRows: GroupRow[] = await Promise.all(
    matchingGroups.map(async (g): Promise<GroupRow> => {
      const members = await fetchGroupMembers(g.id); // nutzt deinen Cache
      return { group: g, members };
    })
  );

  // 4) Personen aus Gruppen in personRowsById mergen (groups: Group[])
  for (const { group, members } of groupRows) {
    for (const mp of members) {
      const person = personsById.get(mp.id) ?? mp;

      let row = personRowsById.get(person.id);
      if (!row) {
        row = { person, groups: [] };
        personRowsById.set(person.id, row);
      }
      if (!row.groups.some(gr => gr.id === group.id)) {
        row.groups.push(group);
      }
    }
  }

  // 5) In Items umwandeln + Scores vergeben
  const personItems: SearchItem[] = [...personRowsById.values()].map(row => ({
    kind: 'person',
    row,
    score: scorePerson(row.person, row.groups, q, matchedGroupIds),
  }));

  const groupItems: SearchItem[] = groupRows.map(row => ({
    kind: 'group',
    row,
    score: scoreText(row.group.name, q),
  }));

  // 6) Vereinigen & sortieren (höchster Score zuerst)
  const items = [...personItems, ...groupItems]
    .filter(i => i.score > 0) // wirklich passende Ergebnisse
    .sort((a, b) =>
      b.score - a.score ||
      // bei Gleichstand: Personen vor Gruppen
      (a.kind === b.kind ? 0 : a.kind === 'person' ? -1 : 1) ||
      // weitere Tie-Breaker: kürzerer Name zuerst
      (a.kind === 'person'
        ? ((a.row.person.lastName ?? '').length + (a.row.person.firstName ?? '').length) -
          ((b as any).row.person?.lastName ?? '').length - ((b as any).row.person?.firstName ?? '').length
        : (a as any).row.group.name.length - (b as any).row.group.name.length)
    );

  lastRenderedItems = items;
  renderSearch(lastRenderedItems);
}, 250);



searchInput.addEventListener('input', runSearch);

// Export
exportBtn.addEventListener('click', async () => {
  
  const groupTypeId = Number(groupTypeSelect.value || '') || 0;
  const name        = (groupNameInput.value || '').trim();

  const mainUserRoleId    = Number(mainUserRoleGeneratorSelect.value || '');
  const otherUsersRoleId  = Number(otherUserRoleGeneratorSelect.value || '');

  exportBtn.disabled = true;

  // kleine Helfer
  const pickFrontendUrl = (g: any): string | undefined =>
    g?.frontendUrl || g?._links?.frontend?.href || g?._links?.self?.href;

  const pickErrorText = (e: any) =>
    e?.response?.data?.translatedMessage ||
    e?.response?.data?.message ||
    e?.message ||
    'Unbekannter Fehler';

  try {
    if (!name) throw new Error('Bitte einen Gruppennamen eingeben.');
    if (!groupTypeId) throw new Error('Bitte einen Gruppentyp auswählen.');
    if (!Number.isFinite(mainUserRoleId)   || mainUserRoleId   <= 0) throw new Error('Bitte eine gültige Rolle für dich auswählen.');
    if (!Number.isFinite(otherUsersRoleId) || otherUsersRoleId <= 0) throw new Error('Bitte eine gültige Rolle für die anderen auswählen.');

    // 1) Gruppe erstellen
    const groupPayload = {
      campusId: 0,
      force: true,
      groupTypeId,
      name,
      parentGroupId: 0,
      roleId: mainUserRoleId,
      groupStatusId: 1,             // wichtig: als Zahl senden
      visibility: 'hidden' as const,
    };
    const createdGroup = await churchtoolsClient.post<Group>('/groups', groupPayload);

    // 2) Tag setzen (Fehler hier ignorieren, damit die UX sauber bleibt)
    try { await churchtoolsClient.post(`/tags/group/${createdGroup.id}`, { name: 'Chat Gruppe' }); } catch {}

    // 3) Andere Mitglieder hinzufügen
    const otherMembers = [...selected.values()].filter(p => p.id !== mainUser.id);
    const addResults = await Promise.all(otherMembers.map(async (p) => {
      try {
        await churchtoolsClient.put(
          `/groups/${createdGroup.id}/members/${p.id}`,
          { groupTypeRoleId: otherUsersRoleId, groupMemberStatus: 'active' }
        );
        return { ok: true, id: p.id };
      } catch (e: any) {
        // 409 = bereits Mitglied -> nicht als "hinzugefügt" zählen
        const status = e?.status ?? e?.response?.status;
        return { ok: status === 409, already: status === 409, id: p.id };
      }
    }));
    const addedCount = addResults.filter(r => r.ok && !r.already).length;

    // 4) Chat optional starten
    let chatActivated = false;
    if (chatCheckbox.checked) {
      try {
        await churchtoolsClient.post(`/groups/${createdGroup.id}/chat`, {
          enabled: true,
          triggerChatInviteMail: true,
        });
        chatActivated = true;
      } catch { chatActivated = false; }
    }

    // 5) Nutzerfreundliche Zusammenfassung
    const frontUrl = pickFrontendUrl(createdGroup) ?? `${window.location.origin}/groups/${createdGroup.id}`;
    const parts = [
      `Gruppe "${createdGroup.name}" wurde erstellt`,
      `${addedCount} ${addedCount === 1 ? 'Person' : 'Personen'} hinzugefügt`,
      chatCheckbox.checked ? (chatActivated ? 'und der Chat aktiviert' : '— Chat konnte nicht aktiviert werden') : ''
    ].filter(Boolean);

    outputArea.value = `${parts.join(', ')}. Du findest deine Gruppe hier: ${frontUrl}`;

  } catch (err: any) {
    outputArea.value = `❌ ${pickErrorText(err)}`;
  } finally {
    exportBtn.disabled = false;
  }
});

// Initiale Auswahl anzeigen
renderSelection();
})();
