---
status: experimental
date: 2026-10-22
---

# Try live shadow sync over a WebRTC data channel, behind a build flag

## Context and Problem Statement

A shadow interviewer sits in on the call from another laptop, possibly on another network. They want to see which Look-for items the lead interviewer ticked. The data is about a job candidate, so it should not pass through a vendor. A live view of the other person's ticks can also bias the shadow's own judgment. Can two copies of the kit share ticks with no server of their own?

## Considered Options

* A peer-to-peer WebRTC data channel, paired by pasting a code each way, included only in flagged builds.
* A hosted realtime service such as PartyKit or Supabase. Rejected: PartyKit's hosted service shuts down on 2026-10-23, Supabase's free tier pauses after a week without use, and either one would hold hiring data.
* Shared state in a claude.ai artifact. Rejected: the data passes through a vendor, and every interviewer needs access to the same organization.
* `BroadcastChannel`. Rejected: it works on one machine only, and its behavior on `file://` differs by browser.
* Live sync in every build. Rejected: it would put a source of bias in front of every interviewer by default.
* Compare ticks after the call instead of live. Not chosen yet. The research rated it safer for bias, but the maintainer chose to try live sync first behind a flag. `docs/plans/compare-after.md` describes it.

## Decision Outcome

Chosen option: "WebRTC with manual pairing codes, behind a build flag", because it needs no server of its own and keeps the data between the two laptops.

* A pairing code is `IK1.` followed by the session description in base64url. ICE gathering finishes before the code is shown, so one paste each way is enough.
* Google's public STUN server finds each side's public address. There is no TURN relay.
* The two people swap codes in a private chat message, such as a Slack DM.
* Only ticks sync, never notes. An item the other person ticked gets a muted marker.
* Sync exists only in builds made with `VITE_SYNC=1` (`npm run dev:sync`, or `npm run build:sync` into `dist-sync/`). A plain build drops the code entirely, and `test/sync.test.js` checks that.

This stays `experimental` until it connects across two real laptops. On the maintainer's machine the channel never left `checking`, with a VPN the likely cause. `docs/plans/shadow-sync-test.md` covers the test.

### Consequences

* Good, because plain builds carry no sync code and no network calls.
* Bad, because without TURN some pairs of networks will never connect, corporate ones most of all.
* Bad, because the STUN server sees both IP addresses, though never the data.
