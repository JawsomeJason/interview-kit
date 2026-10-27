---
id: review-a-pr
name: Review a teammate's PR
minutes: 35
competencies: [craft]
---

## Brief

The candidate reviews a small PR that adds a quantity stepper to a shop's cart. It is typed, its tests pass, and its description claims it is "fully accessible". Watch what they notice, in what order, and whether they can show it in the running app.

The findings are on the right. Mark what they find, and give a nudge only when they are stuck. A nudge you gave is recorded, so a finding that follows it reads as seen after a nudge.

## Paste to the candidate

Sandbox: https://example.com/your-sandbox

A teammate opened the PR at `/pr/`. Try the app, then review it the way you would review a teammate's. Note your comments in `REVIEW.md` and mark what you would block on. About 10 minutes.

## Run

1. **Ask them to keep AI tools off.** Paste the sandbox link and ask them to share their screen.
2. **Say:** "Don't fix it. Question what looks off, say why, and say who it hurts."
3. After about 10 minutes **ask:** "Which would you block on, and why that one first?"
4. **Say:** "Show me that in the running app." Ask what they expect to happen, then let them try.
5. If time allows, **ask the stretch prompts** for the level you are evaluating at.

## Look for

### junior

- **Plus and minus are divs, not buttons.** No focus, no role, and the glyph is the name. {#divs}
  - Show it: Click the field and press Tab. Focus skips the controls.
  - Nudge: Try the page without the mouse.
  - Nudge: Press Tab from the field. Where does focus go?
- **Typing in the field is broken.** Typing `15` leaves `1.00`, and Backspace cannot clear it. {#typing}
  - Why: Every shopper who types a quantity hits it first.
  - Show it: Select all in the field and type `15`.
  - Fallback: hide
  - Nudge: Have you typed in the field yet?
  - Nudge: Select the whole value and type a new number. What do you see?

### mid

- **The error is not linked to the field.** No `aria-invalid`, no `aria-describedby`, no live region. {#error-link}
  - Nudge: What does a screen reader announce when the error appears?
  - Nudge: Open the accessibility pane on the input. What does it say about the error?
- **Rebuilds components the design system has.** The field and button are hand-made, though `src/ds` has both. #judgment
  - Good answer: "Most of this component should be deleted and composed from the shared field and button."

### senior

- **Two sources of truth, synced by effects.** `onChange` fires on mount. #judgment
  - Good answer: Make it controlled, and call `onChange` from the event handlers.
- **Money held in floats.** Halving shows `0.13` but places `0.125`. #judgment
  - Fallback: Point at `toFixed(2)` in the diff and ask what the order holds.
  - Good answer: Integer minor units, or a decimal type, with one function that formats.

## Fallback

No running app, because the link is down or the credits ran out? Send `pr.diff` and say so up front. Findings marked to hide drop out while the fallback is on, and a finding with its own fallback line shows that line instead of "Show it".

## Stretch

### junior

- Make the plus and minus controls work for keyboard users. What would you change?

### mid

- Product wants the quantity limited to the stock left. Where does that rule live, and who needs to know?

### senior

- Three components in the shop have this bug. What would you change so it stops happening?
