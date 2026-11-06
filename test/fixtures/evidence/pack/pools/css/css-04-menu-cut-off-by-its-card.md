---
id: css-04
title: "Menu cut off by its card"
minutes: 8
tier: core
competencies: [craft]
---

## Ask

A teammate says the Sort menu inside this card is cut off at the card's edge, and that raising its `z-index` to 9999 did nothing. How would you debug it?

```css
.page { position: relative; z-index: 1; }
.card { position: relative; overflow: hidden; }
.menu { position: absolute; top: 100%; z-index: 9999; }
```

## Look for

### junior

- Names `overflow: hidden` on the card as what clips the menu
- Checks the rules in devtools instead of guessing

### mid

- Explains the page's `z-index` creates a stacking context capping the menu
- Moves the menu out of the clip, and names the trade-off #judgment
- Says what the fix does to keyboard focus #communication

### senior

- Compares a portal and the popover API, with costs #judgment
- Proposes one shared overlay so the bug stops coming back #judgment

## Follow-ups

- Why didn't raising the z-index help?
- How would you check your fix with a keyboard?

## Stretch

### mid

- The menu now covers the page header. What would you check next?

### senior

- This is the third bug like it this quarter. What would you change for the team?
