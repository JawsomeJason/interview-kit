---
id: css-02
title: "Specificity clash"
minutes: 5
tier: core
---

## Ask

Two rules set the same color and the wrong one wins. How do you find out why?

```css
.card .title { color: navy; }
.title { color: teal; }
```

## Look for

### junior

- Opens the computed styles in devtools
- Says which rule wins here

### mid

- Explains specificity before source order, with this example
- Fixes it without reaching for `!important` first #judgment

### senior

- Proposes cascade layers or a naming rule to stop repeats #judgment

## Follow-ups

- How do cascade layers change this?
- When is `!important` the right call?
