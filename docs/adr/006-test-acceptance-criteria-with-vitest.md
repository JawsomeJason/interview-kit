---
status: accepted
date: 2026-10-22
---

# Test each acceptance criterion with Vitest, red first

## Context and Problem Statement

Agents make most changes here. A change can quietly break the pick rule, a question file's shape or the CSS rules. The checks must be fast enough to run before every commit. What kind of tests does the kit keep?

## Considered Options

* Basic Vitest tests, one per acceptance criterion, written to fail first.
* No tests. Rejected: changes would be checked only by clicking through, and the pick rule would break silently.
* Deep or browser-driven test suites. Rejected for now: slower and more upkeep than a kit this size needs.

## Decision Outcome

Chosen option: "One basic Vitest test per acceptance criterion", because it catches logic and content mistakes without a browser.

Every feature or fix starts with a test per acceptance criterion. The test runs and fails, then the code makes it pass. Tests call public functions and compare against literal expected values.

Three guard tests cover rules rather than features. `content.test.js` checks the shape of every question and round file; format 2 replaced it with `test/pack/pack.test.js`. `test/pack/css.test.js` checks the CSS rules from ADR 011 and that the company name stays out of the code. `test/build/plugins.test.js` checks that a build without the sync plugin contains no sync code.

`npm test` and `npm run build` both pass before anyone reports work as done.

### Consequences

* Good, because content edits in `pools/` and `rounds/` need no new test.
* Bad, because layout and visual regressions are not caught. They are checked by eye.
