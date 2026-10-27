# Plan: adopt Zag.js for keyboard and screen reader behavior

Status: accordion pilot run 2026-10-23 and backed out by the stop rule. The hand-rolled baseline passed every check in 11 lines against Zag's 68, so sidebar A ships the hand-rolled arrow keys and Zag is not installed. Don't continue to tabs or the combobox on this pilot's evidence; see "Pilot result".

## Pilot result, 2026-10-23

The pilot pinned `@zag-js/vanilla` and `@zag-js/accordion` at 1.45.0, since 1.46.0 was under two weeks old. It replaced sidebar A's pool folders with Zag's accordion and kept one machine alive across nav updates (commit 890b4a6, reverted in 6d0a14a). The hand-rolled baseline is a keydown handler on the native `summary` elements (6bbeefe). `npm run a11y` now carries the judge's keyboard pass and runs it against Chromium's accessibility tree.

| Check | Zag | Hand-rolled |
| --- | --- | --- |
| Down, Up, End, Home between headers | pass | pass |
| Enter opens, Space closes | pass, announced as `button`, expanded | pass, announced as `DisclosureTriangle`, expanded |
| axe-core on the main screens | no new violations | no new violations |
| Three open folders across five nav updates | pass | pass |
| Document and window listeners after 1 and after 50 nav updates | 15 and 15 | 15 and 15 |
| `dist/index.html`, gzip -9 | +9,458 bytes (budget 10 KB) | +174 bytes |
| Glue lines added outside `node_modules` | 68 | 11 |

The stop rule backs out when the baseline does the job in under a third of the glue code: 11 is under 68 / 3. Zag also lost the native disclosure's open and close animation, since its content hides with `hidden`.

What the pilot learned, for any later machine:

- Keeping one machine alive across `innerHTML` replacements works, with one fix. A replaced trigger loses focus without a blur event, so the machine kept walking the arrows from the old header until `bind` sent `TRIGGER.BLUR`. Every machine that tracks focus needs the same reset.
- The vanilla scope needs `getRootNode` pointed at the live element, or Pop out breaks it.
- Two items in this plan were already done before the pilot. The shortcuts plugin already returns early on `e.defaultPrevented`, and `test/pack/css.test.js` already rejects a selector with no class, attribute-only ones included.
- The build is 1.33 MB, 873 KB gzipped, mostly inlined pack media, not 253 KB. Size budgets should be in bytes added, as above.
- The `brand / deep dive, 2 pools, no room` axe screen flags `link-in-text-block` on the time meter's help link in about two runs of three, before and after the pilot. It is flaky on main and unrelated to the folders.

The case for Zag rests on the combobox, where the hand-written edge cases are hard. That case is untested by this pilot; judge it on its own if sidebar D or C wins the trial.

## Goal

Some widgets in the kit behave like the real ARIA pattern only in part. The phone Question and Assess buttons look like tabs but announce as toggle buttons. Sidebar D's filter and C's browse dialog make you Tab through every result. The sidebar's pool folders open and close but don't move between headers with the arrow keys.

Zag.js is Chakra's library of headless UI state machines. Each machine implements one WAI-ARIA pattern: keyboard handling, focus moves, and ARIA attributes. You supply the markup and the styles. The goal is to use Zag only where it gives a keyboard or screen reader user something native HTML doesn't, and to keep native HTML everywhere else.

## What Zag is, as of 2026-10-23

- **Version.** 1.46.0, published 2026-10-11. Releases come every few weeks, and all packages share one version number. A 2.0 is in prerelease (`2.0.0-next.3`, 2026-09-14), so a major upgrade is coming.
- **Plain DOM adapter.** `@zag-js/vanilla` exists and ships with every release. It first appeared at 1.32.0 on 2026-01-02 and has had 32 releases since. The zagjs.com docs and its `llms.txt` cover React, Solid, Vue and Svelte only. The vanilla adapter is documented by its source and by the vanilla-ts folder under examples in the zag repo, which has an example for 44 machines.
- **Stability.** 1.44.0 changed how the vanilla adapter applies `style`, from a string to an object, in a minor release. Expect small breaking changes, and pin exact versions.
- **License.** MIT, for the adapter, the core and every machine.
- **Repo.** `chakra-ui/zag`, about 5,200 stars, 15 open issues, last push 2026-10-22, not archived.

## How it fits our render pattern

The vanilla adapter exports four things: `VanillaMachine`, `normalizeProps`, `spreadProps` and `mergeProps`. A widget works like this:

1. Create a machine: `new VanillaMachine(accordion.machine, { id, ...props })`.
2. Get its API: `accordion.connect(machine.service, normalizeProps)`. The API returns attribute objects such as `getItemTriggerProps({ value })`.
3. Apply them to existing elements: `spreadProps(el, attrs)` sets the ARIA attributes, ids and `data-*` state, and adds the event listeners.
4. Re-apply on change: `machine.subscribe(render)`, then `machine.start()`. Every state change calls `render` again, which spreads fresh attributes onto the same elements.

That maps onto our pattern of components that return an HTML string plus a `bind(el)`. The string renders the elements and their classes. `bind` creates or reuses the machine and spreads its attributes. The ARIA attributes appear only after `bind`, so tests have to run `bind` in the test DOM, not just inspect the string.

The catch is our render loop. `main.js` replaces `main` with `innerHTML` on every render, and each sidebar variant's `render` and `bind` run again on every nav update. Every element a machine was bound to is thrown away each time. There are two ways to handle that:

- **Recreate the machine on every render.** Stop the old one, start a new one, and feed it the open state from our own store, the way sidebar D keeps `openPools` today. It's simple, but it needs a cleanup step the variants don't have yet.
- **Keep one machine alive and re-spread after each render.** The machine keeps its state. After `innerHTML` replaces the elements, `bind` calls the same `render` that spreads attributes onto the new nodes. Zag finds elements by deterministic ids (machine id plus item value) and tracks spread attributes per node, so fresh nodes should just work.

The pilot tries the second approach first, since it keeps state in one place. It is not proven yet.

## Widgets, ranked by value

For each widget: what native HTML gives us today, what Zag would add, its size, and the risk. Sizes were measured with esbuild 0.25 (minified, then gzip -9) and include the vanilla runtime, about 6.9 KB gzipped, which is shared and counted once. For scale, today's build is 253 KB, 92 KB gzipped.

| Rank | Widget | Today | What Zag adds | Size (gzip) | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | Combobox: sidebar D's filter, C's browse dialog | A search input that filters a list of links. You Tab through every result. | Real combobox and listbox roles, `aria-activedescendant`, arrow keys through results, Enter to open, Escape to clear | 33.7 KB | Most user value, highest cost. Second wave. |
| 2 | Tabs: phone Question and Assess | Two buttons with `aria-pressed`, announced as toggle buttons | `tablist`, `tab` and `tabpanel` roles, roving tabindex, arrow keys, Home and End | 12.3 KB | Real semantics fix at low cost. First after the pilot. |
| 3 | Accordion: sidebar All questions and pool folders | Native `details` and `summary`: Enter and Space toggle, announced as expanded or collapsed | Up and Down between headers, Home and End | 9.7 KB | The ARIA pattern marks these keys optional. A modest gain, but the cheapest and most contained. The pilot. |
| 4 | Toggle group: layout, sidebar, theme and scheme switchers | `role="group"` with `aria-pressed` buttons, a valid pattern | Roving tabindex and arrow keys between options | 10.3 KB | Small gain. Only if a machine is already in the bundle. |
| 5 | Popover and tooltip: hints, shortcut help | Native `popover`, opened by `interestfor` or `commandfor` (ADR 010) | Positioning and hover delays through floating-ui | 31.4 KB and 22.5 KB | Native already covers it. Skip. |
| 6 | Dialog: C's browse | Native `dialog` with `closedby="any"` and command invokers: focus trap, Escape, inert page | Scroll lock and finer control over where focus returns | 20.5 KB | Native already covers it. Skip. |
| 7 | Radio group and checkbox: review form, Look for, pool picker | Native inputs in option rows | A machine wrapped around a hidden native input | 12.4 KB and 11.6 KB | Would regress form behavior and the brand styling of the real inputs. Skip. |

All nine machines together add 57.3 KB gzipped, about 62% on top of today's build. Only the first four are worth considering, about 45 KB gzipped together.

## How it coexists with the rest of the kit

- **CSS layers and tokens.** Zag is headless and ships no CSS. It sets `data-scope`, `data-part` and `data-state` on elements. Our elements keep their classes, and state styles become `.class[data-state="open"]` in place of `.class[open]`. That stays inside the class-only rule. `test/pack/css.test.js` strips attribute selectors before it looks for element selectors, so a bare `[data-part="trigger"]` would pass the test today while breaking the rule in `AGENTS.md`. Add a check that rejects a selector made only of attributes.
- **Keyboard shortcuts plugin.** It binds `ArrowLeft` and `ArrowRight` to previous and next question, and ignores keys only in text fields. A focused Zag tab handles the same arrows and calls `preventDefault()`. The plugin doesn't check that, so one key press would switch the tab and change the question. Fix: `handleKey` returns early when `e.defaultPrevented` is set. Zag's listener sits on the element and runs first, so the order already works. The combobox input counts as a text field and is already skipped.
- **Brand theme.** A pack's brand theme, in the pack's `theme/` folder, styles the sidebar's chevron disclosures off `[open]` on the `details` elements, for example `.all-questions-pool[open] > :first-child::after`. Each adopted widget moves those rules to `[data-state="open"]` in the component CSS and the brand theme, in the same commit.
- **Don't overcomplicate.** Zag adds a runtime dependency family: the adapter, `core`, `store`, `types`, `utils`, `dom-query`, `anatomy` and one package per machine. It earns its place only where it replaces a pattern we would otherwise hand-write and test ourselves. Adopting it at all calls for an ADR.

## Order

1. **Pilot the accordion in sidebar A.** Add `@zag-js/vanilla` and `@zag-js/accordion` at exact versions. Replace the pool folders' `details` with Zag's accordion, keeping one machine alive across nav updates. Move the chevron styles to `[data-state]`. Add `if (e.defaultPrevented) return` to the shortcuts plugin.
2. **Build a hand-rolled baseline beside it.** On a scratch branch, add Up, Down, Home and End to the existing `summary` elements with a small keydown handler. The judge compares the two.
3. **Run the judge** (below) and decide to continue or back out.
4. **If it continues:** write the ADR. Then do tabs for the phone view, then the combobox for sidebar D, or C if that variant wins the sidebar trial. Each is one commit with its own tests, so any one can be reverted.
5. **Toggle group** only if the arrow keys on the switchers turn out to be worth the bytes once the runtime is already in the bundle.

## The judge for the pilot

A script, `npm run a11y` extended with a keyboard pass, reports:

- **Keyboard.** From the first pool header, Down moves focus to the next header, End to the last and Home to the first. Enter and Space toggle. Each check passes or fails.
- **axe-core.** No new violations on the main screens compared with the commit before the pilot.
- **State across renders.** Open three folders, move through five questions, and the same three are still open.
- **No leaks.** After 50 nav updates, the number of document-level listeners is the same as after 1.
- **Bundle.** The gzipped size of `dist/index.html` before and after. Budget: 10 KB.
- **Glue code.** Lines added outside `node_modules`, compared with the hand-rolled baseline.

**Continue** if every keyboard and axe check passes, state survives renders, nothing leaks, the bundle stays inside budget, and the maintainer finds the sidebar better in a real interview. **Back out** if any check fails without a small fix, or if the hand-rolled baseline does the same job in under a third of the glue code. Backing out is reverting one commit and removing two dependencies.

## Rejected alternatives

- **Hand-rolled ARIA patterns everywhere.** Fine for the accordion's arrow keys, which is why the pilot measures a hand-rolled baseline. For a combobox, the edge cases of the pattern (active descendant, typeahead, screen reader announcements across browsers) are where hand-written code goes wrong, and Zag has already met them.
- **React Aria.** Its hooks need React, and the kit has no framework (ADR 001).
- **Radix UI.** React only.
- **Ark UI.** Chakra's component layer on top of Zag, with wrappers for React, Solid, Vue and Svelte only. The vanilla adapter is the part of that stack a plain JavaScript app can use.
- **Native only.** Today's state. It already covers dialogs, popovers, hints and form inputs well, which is why those stay native. It does not give phone tabs their roles, or the search a listbox you can arrow through.

## Open questions

- Does keeping one machine alive across `innerHTML` replacements hold up in practice? The pilot is the test.
- Which sidebar wins the trial? Settled in 0.10.0: C won, and its All questions dialog got a hand-written combobox (`src/components/question-search.js`). Judge Zag against that.
- Is 2.0 close enough to wait for? Moving from 1.x to 2.0 soon after adopting would mean a second migration.
- Should the ARIA attributes also render into the HTML string for the first paint, through the adapter's `toStyleString` and a string form of the props? Probably not: `bind` runs straight after the render.

## Out of scope

- Restyling any widget beyond moving its state selectors to `[data-state]`.
- Machines the kit has no use for today, such as select, menu or date picker.
