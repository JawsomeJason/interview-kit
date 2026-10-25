---
id: css-02
pool: css
poolName: "CSS"
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

- Opens the computed styles in dev tools
- Explains specificity and source order
- Avoids reaching for important first

## Follow-ups

- How do cascade layers change this?
- When is important the right call?
