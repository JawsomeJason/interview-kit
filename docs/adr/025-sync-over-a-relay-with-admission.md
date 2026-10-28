---
status: experimental
date: 2026-10-27
---

# Sync a room's logs over public relays, upgrading to direct links, with admission and sealed messages

## Context and Problem Statement

ADR 013 tried live shadow sync: two laptops paired by pasting a WebRTC code each way, sharing ticks live, with no relay. It never connected across two networks, since two networks often have no direct path without a relay, and live ticks contradict the blind evidence of ADR 022. Interviewers in one room still need the shared plan live (the candidate, passions, minutes, pools and asked cards), and each other's evidence once both have decided. How do copies of the kit on different networks replicate the logs, with no server of our own and nothing readable in transit?

## Considered Options

* Replicate the per-author logs over three public keyless MQTT relays over `wss://` at once, at least one on port 443, upgrading each pair to a WebRTC data channel when one opens; join by a link or QR code, let joiners in by hand, and seal every relayed message.
* Keep manual WebRTC pairing codes with no relay (ADR 013). Rejected: measured to fail across networks, and a paste each way is two steps too many.
* A hosted realtime service. Rejected: it would hold hiring data, and the free tiers measured pause or shut down.
* Relay only, with no direct link. Rejected for now: public relays rate-limit busy rooms. The relay against direct latency is measured so the question can return with numbers.

## Decision Outcome

Chosen option: "Relays first, direct when possible, with admission", because a room works as soon as two people reach a relay, which covers VPNs, strict NATs and cellular, and the relay sees only sealed frames.

* The replica is a pure state machine over `hello`, addressed `pull` and paged `events` messages, tested over an in-memory link that drops, duplicates and reorders. Private events are served only where the gate of ADR 022 passes; the core applies the gate, never the plugin.
* Invite makes a link key, a session key and an inviter signing key. The link carries the link key and the signing key's fingerprint, so someone holding the link can knock and wait but sees nothing until a member lets them in, and cannot answer a knock themselves: a joiner accepts an admit only from a key the inviter signed. The session key reaches each admitted member wrapped by ECDH. Change the link shuts an old link out and makes a new signing key, so a member left out holds a cert the new link no longer matches and must knock where every member sees it. Only the inviter lets a returning member back in without a knock, and each rekey checks out only against the signing key it replaces, so an old one cannot be replayed.
* One window syncs an interview: a second window on the same interview waits, as the store's read-only window does, and Take over moves sync with the writing.
* Every relayed message is AES-GCM sealed with its topic's key and bound to its topic. Relay operators see topics, sizes, timing and addresses, and store nothing. A pack may add TURN servers for networks that drop UDP.
* Every phase has a time limit that turns into a message with one next step, and Test connection checks the meeting point and the direct path before an interview.
* Sync is the `sync` plugin (ADR 024). Without it the kit works alone, and Share my evidence still merges a debrief.

This stays `experimental` until it connects across real networks with the targets met: first sync under 2 seconds, reconnect under 3 seconds, and no lost evidence across chaos runs. Supersedes ADR 013.

### Consequences

* Good, because colleagues on different networks join from one link, and nothing about the candidate is readable off their laptops.
* Good, because the logs already merge, so sync is replication and needs no CRDT library.
* Bad, because public relays can rate-limit, change terms or go away, so the relay list is pack data and needs watching.
* Bad, because an admitted member is trusted: one who means harm could forge a decision, or ask for a private stream under a colleague's id, to see evidence early. The kit keeps outsiders out, not colleagues.
