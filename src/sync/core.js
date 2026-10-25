// Pairing codes: base64url of the session description, prefixed so a wrong paste is caught.
const PREFIX = 'IK1.';

export const encodeCode = ({ type, sdp }) =>
  PREFIX + btoa(JSON.stringify({ type, sdp })).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

export function decodeCode(code) {
  const text = code.trim();
  if (!text.startsWith(PREFIX)) throw new Error("That isn't an interview-kit code. It should start with IK1.");
  return JSON.parse(atob(text.slice(PREFIX.length).replaceAll('-', '+').replaceAll('_', '/')));
}

// Items the shadow ticked that I haven't: the only thing the marker shows.
export const peerMarks = (mine, peer, id) => (peer[id] ?? []).filter((i) => !(mine[id] ?? []).includes(i));

// The only thing sent to the shadow: ticks. Notes, done and the candidate stay on this laptop.
export const peerMessage = (state) => JSON.stringify({ ticks: state.ticks ?? {} });
