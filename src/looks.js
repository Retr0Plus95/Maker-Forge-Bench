// Your parts (0.8 design §2): what a board part really looks like, as you fitted it. The same
// fields can come from the project file's board section or from your own choices. No page code:
// unit-tested in Node.

/** What each kind of part can look like: field → the allowed values (a [min, max] pair for a number). */
export const LOOK_OPTIONS = {
  dip: { holder: ['socket', 'strips', 'none'] },
  res: { colour: ['beige', 'blue'] },
  elec: { H: [5, 40] },
  cer: { style: ['disc', 'dipped'] },
  led: { colour: ['red', 'green', 'yellow', 'blue', 'white'] },
  header: { female: [true, false] },
  to220: { facing: ['down', 'up', 'left', 'right'] },
};

/** Only the look fields that suit a part of this type, with allowed values: anything else is dropped. */
export function cleanLook(type, raw) {
  const out = {};
  const options = Object.hasOwn(LOOK_OPTIONS, type) ? LOOK_OPTIONS[type] : null;
  if (!options || !raw || typeof raw !== 'object') return out;
  for (const [field, allowed] of Object.entries(options)) {
    if (!Object.hasOwn(raw, field)) continue;
    const v = raw[field];
    const range = allowed.length === 2 && allowed.every((a) => typeof a === 'number');
    if (range ? typeof v === 'number' && Number.isFinite(v) && v >= allowed[0] && v <= allowed[1] : allowed.includes(v)) out[field] = v;
  }
  return out;
}
