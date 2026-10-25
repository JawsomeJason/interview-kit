// Trial headers, switched in Try layouts. After the maintainer picks one, delete the other letters here and their files.
// Each variant default-exports { label, render(ctx), bind(el, ctx) }. A header shows in two spots, and render and bind
// run once per spot whenever the app shell is built (once per round) and again when the header pick changes:
// - spot 'header': the bar above the columns on wide screens. render returns one <header class="app-header">.
// - spot 'drawer': the top of the phone drawer (the ☰ menu), which is also what Pop out shows, since its window
//   uses the phone layout. render returns one element with class sidebar-round.
// Layout CSS shows and hides the two spots by those classes, and the sync build appends its link into them.
// bind(el, ctx) gets the element render produced, and wires it up.
// ctx = { spot, round, parts, deepDiveMinutes, candidate, startedAt, clock(), plan(), route, onRoute(fn), schemeToggle, links, buttons,
//   newInterview() }:
// - round: { id, name, minutes, deepDiveMinutes }; round.deepDiveMinutes is the round's default, not the plan.
// - parts: the pack's { intro, outro }, each { name, minutes } (and its Markdown body).
// - deepDiveMinutes: the deep dive's minutes as planned now on the Deep dive page. When they change, the header
//   renders and binds again with the new value.
// - plan(): the run of show the sidebar timeline shows, read fresh on each call so it follows the Deep dive minutes:
//   [{ id: 'intro' | 'round' | 'deep-dive' | 'outro', name, start, minutes }], in order, start in minutes from the
//   round's start. A header that shows what comes next should read this rather than add up the parts itself.
// - route and onRoute(fn): the hash the header renders for, and a subscription that calls fn(hash) on each route
//   the app takes after that. The header is not redrawn on a route change, so a header that changes with the page
//   follows this. Don't listen for hashchange: Chromium fires none for the app's routes (the router intercepts them
//   with the Navigation API), and in Pop out the route is the tab's, not the window's. A new mount drops the old
//   subscriptions.
// - candidate: the name so far. Render it with candidateField() from ../candidate-field.js; every .candidate-field
//   saves as it's typed and stays in step with the others, with no binding of its own.
// - startedAt (epoch ms) and clock(): the interview clock as text, "12:40", or "−4:12" counting down to a start
//   ahead. Any element with a data-clock attribute is filled with clock() every second, no timer needed.
// - schemeToggle and links: markup for the Light/Dark/Auto toggle and the What's new and Help links, already wired.
// - buttons: [{ label, onClick }] that plugins add, such as Pop out. Render each as a <button class="header-button">
//   and set its onClick in bind; Pop out's own window hides .header-button.
// - newInterview(): clears the name, ticks, notes and clock and goes back to the setup page with this round picked
//   and the name field focused, with Undo.
// The skip link, the phone top bar with its ☰ menu and the Try layouts corner sit outside the header.
import a from './a.js';
import b from './b.js';
import c from './c.js';
import d from './d.js';

export const HEADERS = { a, b, c, d };
