import { expect, test } from 'vitest';
import { classify, NAME_STATE, words } from './words.js';

const W = words(['Jason', 'Alex', 'Kim']);

test('every status line from the design classifies, with one name or several, and a stray line does not', () => {
  expect([
    'Connected to Alex', 'Connected to Alex and Kim', 'Connected to Jason, Alex and Kim',
    'Lost Alex, reconnecting… What you record is saved and will catch up.',
    "Can't reach Alex and Kim from this network. Alex and Kim may have closed the kit, or one of you lost the connection. Keep going: everything you record is saved and will catch up.",
    'Reconnected to Kim. Caught up.', 'Catching up with Alex…', 'Looking for Alex…',
    "Alex isn't here yet. You'll connect as soon as Alex opens the interview.",
    "Alex and Kim aren't here yet. You'll connect as soon as they open the interview.",
    "Alex is here but their kit isn't answering. Ask Alex to reload the page.",
    'Alex left at 3:42 PM.', 'Alex left at 3:42 PM. Kim left at 3:43 PM.', 'Kim joined.',
    'Reconnecting to the meeting point… Everything you record is saved and will catch up.',
    "You're offline. Everything you record is saved and will catch up.", 'Back online. Catching up…', 'Connecting…',
    'Waiting for colleagues. Send them the invite link.', 'Trying again…',
    'Alex is using a newer or older kit. Both of you reload the page to get the same version.',
    'Connected to Sam', 'Lost Alex', 'Alex left.',
  ].map((t) => classify(t, W))).toEqual([
    'connected', 'connected', 'connected', 'lost', 'unreachable', 'reconnected', 'catching-up', 'looking', 'not-here', 'not-here',
    'not-answering', 'left', 'left', 'joined', 'relay-lost', 'offline', 'back-online', 'connecting', 'waiting-for-colleagues', 'trying-again', 'newer-kit',
    null, null, null,
  ]);
  expect(['', 'away', 'reconnecting', 'offline since 3:42 PM', 'gone'].map((t) => NAME_STATE.test(t))).toEqual([true, true, true, true, false]);
});
