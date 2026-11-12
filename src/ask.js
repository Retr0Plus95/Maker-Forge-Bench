// Ask Claude (design §7.8): the short context block every route sends. No page code.

export const DEFAULT_QUESTION = 'What does this part do, and what should I watch out for when soldering it?';

/**
 * @param {{ project?: string|null, revision?: string|null, sheet?: string|null, part?: object|null,
 *           onSheets?: string[], nearbyText?: string[] }} ctx
 * @param {string} question  empty for the default question
 */
export function contextText(ctx, question) {
  const asked = question && question.trim() ? question.trim() : DEFAULT_QUESTION;
  const lines = [`Question: ${asked}`];
  if (ctx.project) lines.push(`Project: ${ctx.project}${ctx.revision ? ` (${ctx.revision})` : ''}`);
  const part = ctx.part;
  if (part) {
    const what = [part.value, part.type].filter(Boolean).join(' ');
    lines.push(`Part: ${part.ref}${what ? `, ${what}` : ''}`);
    if (part.role) lines.push(`Role: ${part.role}`);
    if (part.orientation) lines.push(`Orientation: ${part.orientation}`);
    if (part.note) lines.push(`Note: ${part.note}`);
  }
  if (ctx.onSheets && ctx.onSheets.length) lines.push(`On sheets: ${ctx.onSheets.join(', ')}`);
  if (ctx.sheet && ctx.nearbyText && ctx.nearbyText.length) lines.push(`Nearby on ${ctx.sheet}: ${ctx.nearbyText.join(', ')}`);
  return lines.join('\n');
}
