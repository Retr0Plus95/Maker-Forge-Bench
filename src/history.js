// Undo and redo for every change a person makes (design §6a). No page code.
// An action is { label, apply(), revert() }: apply makes the change, revert takes it back.

export function createHistory(limit = 200) {
  const done = [];
  const undone = [];
  const listeners = new Set();

  const state = () => ({
    canUndo: done.length > 0,
    canRedo: undone.length > 0,
    undoLabel: done.length ? done[done.length - 1].label : null,
    redoLabel: undone.length ? undone[undone.length - 1].label : null,
  });
  const tell = () => {
    const s = state();
    for (const fn of listeners) fn(s);
  };

  return {
    /** Makes the change and records it. If apply() throws, nothing is recorded. */
    do(action) {
      action.apply();
      done.push(action);
      if (done.length > limit) done.shift();
      undone.length = 0;
      tell();
    },
    undo() {
      const action = done.pop();
      if (!action) return null;
      action.revert();
      undone.push(action);
      tell();
      return action.label;
    },
    redo() {
      const action = undone.pop();
      if (!action) return null;
      action.apply();
      done.push(action);
      tell();
      return action.label;
    },
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    clear() {
      done.length = 0;
      undone.length = 0;
      tell();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
