// Pop out: moves the whole app into a small always-on-top window (Document Picture-in-Picture), with the elapsed
// time, to keep over a fullscreen call, and back to the tab when that window closes. Remove it by deleting its line in src/plugins/index.js.
import './popout.css';

// The window gets the page's <html> attributes (scheme, theme) and body class (layout), kept in step as they change.
function mirror(doc) {
  const page = document.documentElement;
  for (const { name } of [...doc.documentElement.attributes]) if (!page.hasAttribute(name)) doc.documentElement.removeAttribute(name);
  for (const { name, value } of page.attributes) doc.documentElement.setAttribute(name, value);
  doc.body.className = `${document.body.className} popout-window`;
}

export default function popout(api, pip = globalThis.documentPictureInPicture) {
  if (!pip) return;
  let win = null;
  api.headerButton('Pop out', async () => {
    if (win) return;
    // Phone-sized, so the window shows the phone layout.
    const w = await pip.requestWindow({ width: 400, height: 700 });
    const doc = w.document;
    for (const sheet of document.styleSheets) {
      const style = doc.createElement('style');
      style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
      doc.head.append(style);
    }
    mirror(doc);
    const observer = new MutationObserver(() => mirror(doc));
    observer.observe(document.documentElement, { attributes: true });
    observer.observe(document.body, { attributes: true });
    // The router follows the tab's address; a link followed inside the window would change only the window's own.
    doc.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link || e.defaultPrevented) return;
      e.preventDefault();
      location.hash = link.getAttribute('href');
    });
    document.body.insertAdjacentHTML('afterbegin', `<p class="popout-note">The kit is in the Pop out window.
      <button type="button" class="popout-back">Bring it back</button></p>`);
    const note = document.body.firstElementChild;
    note.querySelector('.popout-back').onclick = () => w.close();
    w.addEventListener('pagehide', () => {
      observer.disconnect();
      api.moveApp(document.body, note);
      note.remove();
      win = null;
    });
    api.moveApp(doc.body);
    // The elapsed time, pinned over the app. The window's own timer: it stays visible, so it isn't throttled
    // like the hidden tab behind the call.
    doc.body.insertAdjacentHTML('beforeend', '<p class="popout-time" title="Time since the interview started, or until it starts"></p>');
    const time = doc.body.lastElementChild;
    const tick = () => { time.textContent = api.session().elapsed; };
    tick();
    w.setInterval(tick, 1000);
    win = w;
  });
}
