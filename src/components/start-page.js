import { esc } from '../esc.js';

const radios = (name, options, picked) => options.map((o) => `<label class="start-option"><input type="radio" name="${name}" value="${esc(o.id)}"${o.id === picked ? ' checked' : ''}>
  <b>${esc(o.name)}</b>${o.about ? `<small class="start-about">${esc(o.about)}</small>` : ''}</label>`).join('');
const roundsOf = (pack, role) => role.rounds.map((id) => pack.rounds.find((r) => r.id === id)).filter(Boolean);

// The setup page: who, which role and round, then Start. Below it the Saving check and Recent interviews.
// .start-bar and .start-sessions are placeholders session.js swaps for the store's bar and the session list.
export const startPage = {
  render: ({ pack, wantsName, previous, slot }) => `<main class="main start" tabindex="-1"><h1 class="start-title">Start an interview</h1>
  <div class="start-bar"></div>
  ${previous ? '<p class="undo-toast" role="status">Started a new interview. <button type="button" class="undo-toast-button start-undo">Undo</button></p>' : ''}
  <form class="start-form">
    ${wantsName ? '<label class="start-field">Your name, as your colleagues will see it <input class="start-input start-name" name="name" required maxlength="80" autocomplete="name"></label>' : ''}
    <label class="start-field">Who are you meeting? <input class="start-input start-candidate" name="candidate" required maxlength="120" autocomplete="off" spellcheck="false" placeholder="Candidate name"></label>
    <fieldset class="start-group"><legend class="start-legend">Which role?</legend>${radios('role', pack.roles, pack.roles[0]?.id)}</fieldset>
    <fieldset class="start-group start-rounds"><legend class="start-legend">Which round?</legend>${radios('round', roundsOf(pack, pack.roles[0]), pack.roles[0]?.rounds[0])}</fieldset>
    <button type="submit" class="start-go">Start interview</button>
    ${slot('setup.join')}
  </form>
  <section class="start-check" aria-labelledby="start-check-title"><h2 id="start-check-title" class="start-subtitle">Before the interview</h2>
    <p class="start-saving" role="status">Checking that notes save…</p>${slot('setup.test')}</section>
  <div class="start-sessions"></div></main>`,

  bind(el, { pack, start, undo }) {
    const form = el.querySelector('.start-form');
    form.addEventListener('change', ({ target }) => {
      if (target.name !== 'role') return;
      const role = pack.roles.find((r) => r.id === target.value);
      el.querySelector('.start-rounds').innerHTML = `<legend class="start-legend">Which round?</legend>${radios('round', roundsOf(pack, role), role.rounds[0])}`;
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      start({ roleId: data.get('role'), roundId: data.get('round'), candidate: data.get('candidate').trim(), name: data.get('name')?.trim() });
    });
    el.querySelector('.start-undo')?.addEventListener('click', undo);
  },
};
