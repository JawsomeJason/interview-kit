// Hash routing. Where the Navigation API exists, each hash change is intercepted so the render can run inside
// the navigation (and a view transition). `render` gets the new hash; focus and scroll stay manual because render handles both.
// hashchange still covers what the Navigation API misses: browsers without it, and WebKit, which fires no navigate
// event for a fragment typed into the address bar. A hash the navigate handler already took is not rendered twice
// (Firefox fires hashchange after an intercepted back or forward).
export function onRoute(render, win = globalThis) {
  let taken = null;
  win.addEventListener('hashchange', () => {
    if (win.location.hash !== taken) render(win.location.hash);
    taken = null;
  });
  win.navigation?.addEventListener('navigate', (e) => {
    if (!e.hashChange || !e.canIntercept) return;
    const hash = new URL(e.destination.url).hash;
    taken = hash;
    e.intercept({ focusReset: 'manual', scroll: 'manual', handler: async () => render(hash) });
  });
}
