// The start screen (0.7 design §3): shown when there is no dev.py and no link. Paste a GitHub link,
// open a folder on this computer, or start from an example. Built with createElement only.

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

/**
 * o: { message, examples: [{ id, title, about, href }],
 *      onRepo(text) → '' or why it isn't a link, onFolder(files) → '' or why it can't be opened }
 */
export function renderStart(container, o) {
  const why = el('p', { id: 'start-why', className: 'start-why', role: 'alert' }, o.message || '');
  why.hidden = !o.message;
  const say = (text) => {
    why.textContent = text;
    why.hidden = !text;
  };

  const repo = el('input', { id: 'start-repo', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'github.com/owner/name', 'aria-describedby': 'start-repo-hint' });
  const form = el('form', { id: 'start-repo-form', className: 'start-row' },
    el('label', { for: 'start-repo' }, 'Paste a GitHub link'), repo,
    el('button', { id: 'start-repo-open', type: 'submit', className: 'primary' }, 'Open'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    say(o.onRepo(repo.value));
  });

  const folder = el('input', { id: 'start-folder', type: 'file', multiple: '', webkitdirectory: '', className: 'visually-hidden' });
  folder.addEventListener('change', () => {
    const files = folder.files;
    say(files && files.length ? o.onFolder(files) : '');
    folder.value = '';
  });

  const examples = el('ul', { id: 'start-examples', className: 'start-examples' });
  for (const x of o.examples) {
    examples.append(el('li', {}, el('a', { className: 'button-link', href: x.href, 'data-example': x.id }, x.title), el('p', { className: 'hint' }, x.about)));
  }

  container.replaceChildren(el('div', { className: 'start-box' },
    el('h2', { id: 'start-title' }, 'Open a project'),
    el('p', { className: 'hint' }, 'Bench shows a project\'s drawings while you build it: tick parts off, find any part, see the board in 3D.'),
    why,
    el('h3', {}, 'From GitHub'),
    form,
    el('p', { id: 'start-repo-hint', className: 'hint' }, 'A public repo with drawings and, best, a forge-project.json. A link to a folder in it works too.'),
    el('h3', {}, 'From this computer'),
    el('div', { className: 'start-row' }, el('label', { className: 'button-like', for: 'start-folder' }, 'Open a folder', folder)),
    el('p', { className: 'hint' }, "Nothing is uploaded: your browser reads the files. To see changes, open the folder again. With Python, dev.py opens a folder that refreshes by itself."),
    el('h3', {}, 'Examples'),
    examples));
}
