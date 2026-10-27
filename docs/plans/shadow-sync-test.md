# Plan: test shadow sync across two laptops

Status: not started. The connection has never succeeded. It stays in `checking` on the maintainer's machine, most likely because of the VPN.

## Goal

Find out whether shadow sync (ADR 013) connects between two real laptops on two different networks. If it does, it can leave `experimental`. If it does not, either add a relay or fall back to compare-after.

## Setup

- Two laptops, each with a fresh `npm run build:sync`, opening `dist-sync/index.html` from disk.
- Different networks: for example, one on home Wi-Fi and one on a phone hotspot. Then repeat with one laptop on the corporate network or VPN.
- Two browsers in the mix, such as Chrome on one laptop and Safari or Firefox on the other.
- A private chat to pass the pairing codes.

## Steps

1. On laptop A, open Shadow sync, click Start, then Copy code, and paste the `IK1.` code into the chat.
2. On laptop B, open Shadow sync, paste A's code, click Join, then Copy reply, and paste the reply into the chat.
3. On laptop A, paste B's reply and click Connect. Both should show Connected.
4. On A, tick two Look-for items on one question and untick one. Check that B shows the muted marker on the right items, and that the marker clears on the untick.
5. Do the same from B to A.
6. Type a note on A. Check that nothing appears on B: notes must never sync.
7. Reload B and pair again. Check that B then shows A's current ticks.

## What to record

For each pair of networks and browsers:

- Whether it connected, and how long pairing took.
- The ICE candidate types on each side (`chrome://webrtc-internals` in Chrome, `about:webrtc` in Firefox). Note whether the connection used host, server-reflexive or relay candidates.
- The network type on each side, and whether a VPN was on.
- Any console errors.

## Pass or fail

- **Pass:** it connects and steps 4 to 7 behave on home Wi-Fi to hotspot, and on at least one pairing that includes the corporate network.
- **Fail:** it never leaves `checking` on any pairing, or works only when both laptops share one network.

## If corporate networks block it

Add a TURN relay to the ICE servers in `src/plugins/sync/sync.js`. Two candidates:

- Cloudflare TURN, at $0.05 per GB outbound. A tick stream uses kilobytes per interview.
- Metered Open Relay, with 20 GB a month free behind an account and API key. It serves ports 80 and 443 with TURNS, which most firewalls allow.

A TURN credential baked into a shared HTML file is effectively public. Use short-lived credentials if the provider offers them. Data channels stay encrypted end to end, so the relay forwards only ciphertext.

## If it still fails

Pick one:

- **Drop to compare-after** (see `compare-after.md`). It needs no network at all, and the research rated it safer for bias anyway. Remove the sync code and its build flag, and mark ADR 013 superseded.
- **A small Cloudflare Worker relay.** A Worker passes tick messages between the two pages over WebSockets. This adds a server the kit has avoided so far, so it needs its own ADR.

## Open questions

- Is a phone hotspot a fair stand-in for a candidate-facing network, or does the test need a second real office?
- If TURN works, does the credential's exposure matter for a kit shared only with interviewers?
