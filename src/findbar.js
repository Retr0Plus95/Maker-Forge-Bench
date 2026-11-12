// Find part (design §7.3): the search box, its results, and moving from match to match.
import { search } from './search.js';

/**
 * @param {object} o
 * @param {HTMLInputElement} o.input
 * @param {HTMLElement} o.results
 * @param {() => object[]} o.entries  every sheet in tab order: { sheet, kind: 'svg'|'image'|'error'|'loading', labels? }
 * @param {(label: object) => Promise<boolean>} o.goTo  shows the label's sheet, zooms to it and rings it
 * @param {() => void} o.clearRing
 * @param {(label: object) => void} o.ringIfShown  rings a label without moving the view, if its sheet is showing
 * @param {(text: string) => void} o.setStatus
 */
export function createFindBar({ input, results, entries, goTo, clearRing, ringIfShown, setStatus }) {
  let query = '';
  let matches = [];
  let index = -1;
  let sheetLabels = new Map();

  const note = (text) => {
    const p = document.createElement('span');
    p.className = 'note';
    p.textContent = text;
    return p;
  };

  function run() {
    query = input.value.trim();
    matches = [];
    index = -1;
    clearRing();
    results.replaceChildren();
    if (!query) {
      setStatus('');
      return;
    }
    const list = entries();
    sheetLabels = new Map(list.map((e) => [e.sheet.id, e.sheet.label]));
    if (list.some((e) => e.kind === 'loading')) {
      results.append(note('Reading sheets…'));
      return;
    }
    const found = search(list.filter((e) => e.kind === 'svg').flatMap((e) => e.labels), query);
    matches = [...found.bySheet.values()].flat();
    for (const [id, labels] of found.bySheet) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${sheetLabels.get(id)}: ${labels.length}`;
      button.addEventListener('click', () => jump(matches.indexOf(labels[0])));
      results.append(button);
    }
    setStatus(found.total ? '' : `No “${query}” on any sheet.`);
    const pictures = list.filter((e) => e.kind === 'image').map((e) => e.sheet.label);
    if (pictures.length) results.append(note(`Pictures can't be searched: ${pictures.join(', ')}`));
    for (const e of list) {
      if (e.kind === 'svg' && e.labels.length === 0) {
        results.append(note(`${e.sheet.label}: its text is drawn as shapes, so Find part can't read it.`));
      }
    }
  }

  async function jump(i) {
    if (!matches.length) return;
    index = ((i % matches.length) + matches.length) % matches.length;
    const shownIndex = index;
    const match = matches[shownIndex];
    if (await goTo(match) && index === shownIndex) {
      setStatus(`${query}: ${shownIndex + 1} of ${matches.length}, on ${sheetLabels.get(match.sheetId)}`);
    }
  }

  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prev();
      else next();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.value = '';
      run();
    }
  });

  const next = () => jump(index + 1);
  const prev = () => jump(index < 0 ? matches.length - 1 : index - 1);

  return {
    next,
    prev,
    /**
     * Search again, for example once every sheet has been read or a sheet changed.
     * keep: stay on the same match number, and ring it again if its sheet is showing.
     */
    refresh(keep = false) {
      if (!input.value.trim()) return;
      const previous = keep ? index : -1;
      run();
      if (previous >= 0 && previous < matches.length) {
        index = previous;
        const match = matches[index];
        ringIfShown(match);
        setStatus(`${query}: ${index + 1} of ${matches.length}, on ${sheetLabels.get(match.sheetId)}`);
      }
    },
    focus() {
      input.focus();
      input.select();
    },
  };
}
