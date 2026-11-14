// The side panel in tabs (0.8 design §3): one short row, Guide · Board · Wiring · Checks · Parts,
// each with its count, and All for the long list of every section as before. No page code: unit-tested.

export const PANEL_TABS = Object.freeze([
  { id: 'guide', label: 'Guide', sections: ['steps'], title: 'The build, one step at a time' },
  { id: 'board', label: 'Board', sections: ['myboard'], title: 'Your board: photos and hole names' },
  { id: 'wiring', label: 'Wiring', sections: ['wiring'], title: 'What to wire, line by line' },
  { id: 'checks', label: 'Checks', sections: ['checks', 'continuity'], title: 'Before power: meter checks and the continuity test' },
  { id: 'parts', label: 'Parts', sections: ['checklist'], title: 'Every part, ticked as you solder it' },
  { id: 'all', label: 'All', sections: [], title: 'Every section in one long list' },
]);

const IDS = new Set(PANEL_TABS.map((t) => t.id));

/** A saved tab, checked: anything odd is the guide. */
export const cleanTab = (v) => (typeof v === 'string' && IDS.has(v) ? v : 'guide');

/** The tab a section lives in. */
export function tabOf(section) {
  const tab = PANEL_TABS.find((t) => t.sections.includes(section));
  return tab ? tab.id : 'all';
}

/**
 * The tabs to show and the one that's open. counts: { [tabId]: { done, total } | null };
 * hidden: tab ids with nothing in them now (Board without a photo open). An open tab that has
 * nothing in it shows the first tab that has (the guide, mostly), without forgetting the choice.
 */
export function panelTabs(chosen, counts = {}, hidden = []) {
  const off = new Set(hidden);
  const tabs = PANEL_TABS.filter((t) => !off.has(t.id)).map((t) => {
    const c = counts[t.id];
    const count = c && c.total > 0 ? `${c.done}/${c.total}` : '';
    const words = c && c.total > 0 ? `, ${c.done} of ${c.total} done` : '';
    return { id: t.id, label: t.label, title: t.title, count, aria: `${t.label}${words}`, done: Boolean(c && c.total > 0 && c.done >= c.total) };
  });
  const want = cleanTab(chosen);
  const open = tabs.some((t) => t.id === want) ? want : tabs[0].id;
  return { tabs, open };
}

/** Which sections show for an open tab (All shows every one). */
export function sectionsShown(open, all) {
  if (open === 'all') return [...all];
  const tab = PANEL_TABS.find((t) => t.id === open) || PANEL_TABS[0];
  return all.filter((s) => tab.sections.includes(s));
}
