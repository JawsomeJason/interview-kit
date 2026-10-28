// A level's place relative to the focus: the focus is the checklist, one below is placement, anything
// lower is basics and anything higher is headroom.
const BY_OFFSET = { 0: 'main', [-1]: 'placement' };

export function layerOf(ladder, focus, level) {
  const offset = ladder.findIndex((l) => l.id === level) - ladder.findIndex((l) => l.id === focus);
  return offset > 0 ? 'above' : BY_OFFSET[offset] ?? 'basics';
}

// Evaluating at is private: only the interviewer's own evidence (its folded focus events) moves it off the role's
// hiring level.
export const focusOf = (role, evidence) => evidence.focus ?? role.hiring;

// A stretch prompt is asked of everyone at its level or above: a higher bar includes the lower one's question.
export const isRequired = (ladder, focus, prompt) => ladder.findIndex((l) => l.id === prompt.level) <= ladder.findIndex((l) => l.id === focus);
