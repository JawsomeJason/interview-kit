import './store-status.css';

const BAR = {
  unsaved: { text: 'Not saved on this laptop. Keep going: your marks stay in this tab. Share my evidence as a file before you close it.', act: 'share', label: 'Share my evidence' },
  conflict: { text: 'This interview changed in another window at the same moment. Reload to carry on. Nothing is lost.' },
  'read-only': { text: 'This interview is open in another window. Record there, or take over here.', act: 'take-over', label: 'Take over' },
  'taken-over': { text: 'Another window took over this interview.' },
};

// The store's warning bar, kept in step with store.status. el is hidden while the store is ok.
export function mountStatus(el, store, { share }) {
  const render = (k) => {
    const bar = BAR[k];
    el.hidden = !bar;
    el.innerHTML = bar ? `<p class="store-status" role="alert">${bar.text}${bar.act
      ? ` <button type="button" class="store-status-button" data-act="${bar.act}">${bar.label}</button>` : ''}</p>` : '';
  };
  store.onStatus(render);
  render(store.status);
  el.addEventListener('click', ({ target }) => {
    const act = target.closest('.store-status-button')?.dataset.act;
    if (act === 'take-over') store.takeOver();
    if (act === 'share') share();
  });
}
