---
status: accepted
date: 2026-10-22
---

# Record architecture decisions in the MADR minimal format

## Context and Problem Statement

The kit was rebuilt from scratch after the first version grew too complex. The decisions made during the rebuild live only in commit messages and chat. A later reader, person or agent, needs to know what won and what lost, so a rejected idea does not creep back in. Each record must stay short and must name at least one real rejected alternative. Which format fits a small solo repo like this?

## Considered Options

* MADR 4.0.0, minimal template.
* Michael Nygard's format (Title, Status, Context, Decision, Consequences). Rejected: it has no section for alternatives, so they end up folded into Context or left out.
* Y-statements ("In the context of …, facing …, we decided for … and neglected …, to achieve …, accepting …"). Rejected: they name the losing options but pack everything into one long sentence, with no room to say why each option lost.
* MADR 4.0.0, full template. Rejected: decision drivers, confirmation and a pros-and-cons section per option are more than a decision in this repo needs.

## Decision Outcome

Chosen option: "MADR 4.0.0, minimal template", because it is the only short format with a section for the options that lost.

How this repo uses it:

* One file per decision, `docs/adr/<NNN>-<kebab-title>.md`, numbered from 000. Numbers are never reused.
* Frontmatter holds `status` and `date`. A status is `proposed`, `accepted`, `experimental` or `superseded by NNN`. MADR leaves the status list open, so `experimental` is a local addition: built behind a flag or on trial, and not yet relied on.
* Sections are Context and Problem Statement, Considered Options, Decision Outcome and Consequences.
* Each rejected option in Considered Options carries a short reason. This borrows the "neglected" clause from Y-statements and replaces MADR's longer pros-and-cons section.
* A decision with no real rejected alternative is not an ADR. It becomes a rule in `AGENTS.md` or is not written down.
* When a decision changes, a new ADR records the change and marks the old one superseded. The old record's text stays as it was.
* `docs/adr/README.md` is the log.

### Consequences

* Good, because each record fits on one screen and says what lost and why.
* Bad, because the minimal template has no decision drivers section, so a concern shared by several options repeats in each option's reason.

## More Information

* Michael Nygard, [Documenting Architecture Decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions) (2011).
* [MADR](https://adr.github.io/madr/), version 4.0.0 (2024-09-17), and its [minimal template](https://github.com/adr/madr/blob/4.0.0/template/adr-template-minimal.md).
* [ADR templates](https://adr.github.io/adr-templates/) on adr.github.io, which compares MADR, Nygard and Y-statements.
* Olaf Zimmermann, [Architectural Decisions: The Making Of](https://www.ozimmer.ch/practices/2020/04/27/ArchitectureDecisionMaking.html), the origin of Y-statements.
