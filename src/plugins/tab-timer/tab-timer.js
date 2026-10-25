// The interview clock in the tab title (a countdown before the start), so it shows in the tab strip behind a call. Remove it by deleting its line in src/plugins/index.js.
export const tabTitle = ({ round, elapsed }, base) => (round && elapsed ? `${elapsed} · ${round}` : base);

export default function tabTimer(api) {
  const base = document.title;
  const show = () => { document.title = tabTitle(api.session(), base); };
  api.onUpdate(show);
  setInterval(show, 1000);
}
