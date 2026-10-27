---
id: css-03
title: "Dark mode colors"
minutes: 5
tier: stretch
---

## Ask

How would you add a dark color scheme to a site?

The site has about forty hard-coded hex colors spread across its stylesheets, a logo on a white
background, and a few charts drawn in canvas. Users should get the scheme their system asks for,
and be able to switch it by hand.

## Look for

### mid

- Uses color-scheme and prefers-color-scheme
- Keeps colors in custom properties
- Checks contrast in both schemes

## Follow-ups

- How would a user override the system setting?
- What does light-dark() do?
