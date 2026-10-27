---
id: css-02
title: "Specificity clash"
minutes: 5
tier: core
---

## Ask

Two rules set the same color and the wrong one wins. How do you find out why?

```css
/* components/button.css */
.card .actions button {
  color: var(--color-muted);
  padding: 0.5rem 1rem;
}

/* pages/checkout.css */
.primary-action {
  color: var(--color-accent);
  font-weight: 600;
}

/* utilities.css */
button:where(.primary-action) {
  color: inherit;
}
```

```html
<div class="card">
  <div class="actions">
    <button class="primary-action">Pay now</button>
  </div>
</div>
```

The button renders muted. Walk through which rule wins and why.

## Look for

### mid

- Opens the computed styles in dev tools
- Explains specificity and source order
- Avoids reaching for important first

## Follow-ups

- How do cascade layers change this?
- When is important the right call?
