// A level's place relative to the focus: the focus is the checklist, one below is placement, anything
// lower is basics and anything higher is headroom.
const BY_OFFSET = { 0: 'main', [-1]: 'placement' };

export function layerOf(ladder, focus, level) {
  const offset = ladder.findIndex((l) => l.id === level) - ladder.findIndex((l) => l.id === focus);
  return offset > 0 ? 'above' : BY_OFFSET[offset] ?? 'basics';
}

// Evaluating at is private: only the interviewer's own log can move it off the role's hiring level.
export const focusOf = (role, events) => events.findLast((e) => e.t === 'focus')?.level ?? role.hiring;

export const isRequired = (focus, prompt) => prompt.level === focus;
