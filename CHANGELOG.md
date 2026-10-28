# What's new

## 1.0.0 · 2026-10-27

### Look for rows by level

![Look for on a question, evaluating at Mid: two of the three numbered Mid rows marked seen, the Junior rows below for placement and Senior folded away](media/mark.mp4)

- Each question lists what to look for by level. The rows at the level you are evaluating at come first, numbered 1 to 9. The level below sits under them, so you can place someone who is under the bar. Higher levels, and levels well below, fold away and say how many of their rows you marked.
- The role you pick sets that level. Evaluating at changes it for you alone, and colleagues never see your choice before the debrief.
- Press a row, or its number, to mark it seen, and press again to clear it. Alt with the number marks it not seen.
- Some rows carry nudges, gentlest first. Gave it, or Shift with the row's number, records one, and a row you mark after it reads seen after a nudge. Reading a nudge records nothing, and Take back undoes one.
- A stretch prompt reads Ask this at its own level and at every level above it. Mark done with one still to ask says so and lets you carry on.

### No scores

- Weak, Solid and Strong are gone, and the kit never adds anything up. The summary, Decide and Copy summary show each row with a dot for what happened: seen, seen after a nudge, not seen, not marked or not asked. A row nobody asked about never reads as a failure.

### Decide on your own, then compare

![Decide: the role's two decisions, each with what it means, none picked, then the level you would place them at and your reason](media/decide.webp)

- Decide offers the role's own decisions, each with what it means and none picked for you, the level you would place them at, and a reason.
- Colleagues' evidence opens only once you have both decided. Share my evidence saves yours as a file to send to a colleague directly, and Add a colleague's evidence brings theirs in. A file for another candidate is refused, and a colleague's file never renames your candidate or changes your plan. The debrief puts the rows where you saw different things first, and Replay up to steps through who saw what, and when.
- A colleague's events arriving while you are on Decide keep the decision, level and reason you are writing, and Debrief keeps your place in the replay.
- Second opinion on Decide gives you a packet to paste into an AI chat. It is built from your evidence with no names, decisions or levels, and holds your notes only if you tick the box.

### Plan the deep dive around the candidate

![The deep dive picker: what the candidate specializes in or is excited by, with CSS ticked, which also picks the CSS pool as the main focus](media/passions.webp)

- The deep dive opens by asking what the candidate specializes in, or what excites them. Ticking one also picks its topic, and Add another… takes one no topic covers. What they picked leads your summary.
- A question you have opened stays in the run of show, even when the minutes or the topics change after.

### More than questions

![A finding with its nudges shown, gentlest first: the first one marked as given, and Gave it beside the next](media/nudges.webp)

- A round can run a live exercise as well as scripts and questions: its brief, what to paste to the candidate, findings by level with their nudges, and a fallback for when the live setup is down. The fallback switch is shared with everyone in the interview.
- Your pack decides the levels, the roles, the rounds and the decisions, so the kit fits designers, SREs or any other ladder. A pack written for an earlier version moves over once with `interview-kit migrate`.

### Your interviews stay on this laptop

![The start page: your name as colleagues will see it, who you are meeting, when it starts, the role and the round to run, Start interview, and the check that notes save on this laptop](media/start.webp)

- New interview starts a new session and keeps the last one under Recent interviews, with Undo. Before the interview, the start page checks that notes will save in this browser.
- A decided interview is deleted from this laptop 30 days after its last change, unless your pack sets another number. Five days before, Recent interviews warns you and offers Keep. One with no decision stays until you delete it.
- A note saves when you pause, leave the box or switch away from the tab, and one still being typed when the page reloads comes back.
- Open the same interview in a second window and it is read-only, with Take over. Once the first window closes, the second one takes over by itself. Either way it picks up everything the first window recorded before you record more.
- If the browser stops saving, a bar says so, and your marks stay in the tab until saving works again.

### Interview together through a meeting point

- Menu holds Invite, which makes a link (or a code, when the kit is opened from a file) for your colleagues. Opening it asks for their name and knocks; you see "Alex wants to join" with Let in and Not now, and once they are in, everyone's plan, passions and opened cards stay in step. Marks, notes and decisions stay on each laptop until both of you have decided, then the debrief opens on its own. Everything crosses the meeting point sealed, so the relay sees only sizes and timing. Change the link in Menu shuts out anyone who still has the old one. The pasted-codes shadow sync is gone.
- Once two of you are connected, your kits also open a direct connection to each other in the background and move the sync onto it, which is faster than the meeting point. On a network that blocks direct connections they stay on the meeting point. A pack can name a relay server (`sync.turn` in pack.json) for networks where even that is needed. A direct connection that drops is retried at once, then at 1, 2, 4, 8 and every 15 seconds, and whenever you come back online.
- The header names each colleague with a dot; hover or focus a name to see which step they are on and when you last heard from them, and their initial sits beside that step in the run of show. Click a name to follow their page; any key or click of yours stops it, and scrolling does not. A status line beside the names says what is happening in plain words ("Looking for Alex…", "Lost Alex, reconnecting…"), turns every wait into a message with one next step, and catches up on its own after a drop. Invite shows a QR code when a phone can open the link, Change the link lets you tick who moves to the new one, and Test connection, on the setup page and in Menu, checks the meeting point before the interview.

### Smaller fixes

- The pager above a question stays on one line. A long pool name shortens with an ellipsis, with the full name on hover, and the minutes and the Previous and Next arrows keep their room.
- Tabbing into Notes on a long question brings the whole box into view, focus ring included.

## 0.10.1 · 2026-10-27

- A pack theme can give headings their own color with a `--color-heading` token. Without one, headings keep the body text color.

## 0.10.0 · 2026-10-26

### One layout, picked after real interviews

- Try layouts is gone. The kit keeps one setup page, one header, one sidebar and one question layout, each picked after real interviews. Picks and notes saved during the trials are dropped the next time the kit opens; your Light, Dark or Auto choice and your phone tab stay.
- The theme switch is gone. When your pack has its own theme, the kit always uses it; with none, it uses the default look. Light, Dark and Auto stay in Menu under Colors.
- Copy summary no longer ends with a Setup line.

### See your hour before you start

- Under the round, Your hour lays out the intro, the round, the deep dive and the outro at their clock times from the start you pick, and says when the interview ends. A start on another day names the day.

### Menu holds the rest

- The header keeps the clock, the name and the round in view, and Menu holds the rest: Light, Dark or Auto, What's new, Help, Pop out and New interview. On a phone the drawer lists the same items.

### The question sits in the middle

- On a wide screen the question sits in the middle of the window, with the sidebar right beside it. The dock under the question is only as tall as its Notes, Look for and Follow-ups, so the question gets the rest.
- The sidebar shows what is on now and what comes next, then the rest of the plan, open, with each part's start time.

### Find any question from the keyboard

- Browse all questions opens a search over every question. Type to narrow it, with the matching letters marked; Up and Down move through the matches and Enter opens one. Escape clears the search, then closes it, and focus goes back to the button you started from.

## 0.9.0 · 2026-10-26

### Safer resume suggestions

- `npm run suggest` now also removes, before anything is sent to TypeSafe: UK and French phone numbers written without `+`, in brackets, with a `00` prefix or a bare country code; English and French street addresses; UK postcodes, a French postcode before its city and a US ZIP after its state; social `@handles`, but not npm scopes or CSS at-rules; and each capitalised word of the name on the resume's first line, in any case, also where it is part of an employer's name. When the first line holds no name, such as a contact line, nothing extra is removed.
- `interview-kit` stops with a plain message when the pack's `pack.json` has no format or a format this kit can't read, instead of building an app that fails to load.

## 0.8.0 · 2026-10-24

### Run the kit from a pack's own repo

- A content pack can live in its own repo with the kit installed as a dependency. There, `npm run dev`, `npm run build` and `npm test` run the kit against the pack, the build writes `dist/index.html` in the pack's repo, and the What's new stamp shows the pack's commit.
- Review answers from the dev server's review form now land in the pack's `.review/` folder, beside the cards they are about.
- A card added while `npm run dev` runs shows up with its code blocks highlighted, from a pack in its own repo too, instead of waiting for a restart.
- An Other start time a week out keeps the same clock time across a daylight saving change, instead of shifting by an hour.

## 0.7.6 · 2026-10-23

### The setup page opens on Plan preview

- Until you pick another one in Try layouts, the setup page is C, Plan preview: name, start and round beside the hour's clock times. Copy summary's Setup line says so.

### Try layouts, Help and sidebar fixes

- In the Timeline sidebar (A), Down stops at the last pool and Up at the first instead of wrapping around, and the arrow keys leave Ctrl, Alt, Cmd and Shift combinations to the browser.
- The Try layouts panel stays whole on a short landscape phone, where its top edge was cut off, and on a 320 px screen, where it ran past the right edge.
- In Copy summary, a Try layouts note of more than one line keeps its later lines indented under the first, and the trial tally reads the whole note.
- A Help link or a ?'s More in Help link to the entry you are already on takes you back to it after you scroll away, instead of doing nothing.
- A link to a Help entry lands with the entry at the top of the page, instead of a few hundred pixels below it once the screenshots above load. Screenshots and clips hold their space while they load, so Help and What's new no longer jump.
- Screenshots and clips on Help and What's new fit their column exactly, instead of poking a few pixels past it.
- Escape from a notes box in Try layouts closes the panel and puts you back on the Try layouts button, instead of dropping focus to the page.
- Enter on a match in Browse all questions closes the list when that question is already open, as a click does, instead of leaving it up.
- In the Now and next sidebar (C), Escape in Browse all questions clears the search and shows every question again, as Outline with search does. A second Escape closes it.
- On a phone or tablet, a tap on a ? opens its short answer and keeps it open, so More in Help can be tapped. Hover and keyboard focus still open it on a computer.
- Opening pools in the Outline with search sidebar (D) no longer makes the whole page scroll, and scrolling past the sidebar's end leaves the page where it is.
- On a phone, and in the Pop out window, Try layouts, What's new and Help sit on a solid band across the bottom of the screen, above the tab bar, instead of floating over the setup page's round cards and Start button.

### Phone and keyboard fixes

- On a phone, the menu button and the Question and Assess tabs show their whole focus ring instead of one cut by the screen edge.
- The phone menu scrolls when it holds more than fits, so every row can be reached.
- The Previous and Next arrows in the phone top bar are big enough to tap.
- After you open a question from the list or step with the arrows from the keyboard, focus lands on the new question's title, so Tab carries on from there.
- The build date on What's new is today's local date, not the UTC one.

### Setup page fixes

- Plan preview picks the round you used last time after New interview, as the other setup pages do, and its Start button does nothing until there is a name.
- Quick start picks the same last round as the other setup pages, instead of keeping its own.
- Other time takes a start from a day ago to a week ahead. Until it has one, Start stays off and a short note says why, on every setup page, instead of quietly starting now. Plan preview names the day when the start isn't today.
- One step at a time and Quick start say why Start or Next is off, as the other two pages do.
- After New interview, One step at a time marks last time's round with a Last time tag and puts focus on it when you reach the round step.
- One step at a time's recap shows the start you picked after a layout switch, instead of Now.
- New interview's Undo stays for its full ten seconds while you type the next name or try another setup page.
- Trying another setup page while What's new or Help is open keeps you on that page.
- Back to setup puts the cursor in the name field on every setup page.
- A setup page left open keeps its start times current: every half minute the slots, their "in 7 min" labels and Plan preview's clock times catch up, and the name and the start you picked stay as they were.
- A long name in One step at a time's recap wraps instead of pushing the page sideways on a phone.
- One step at a time's progress bar follows the theme in dark mode, its buttons are at least 24 pixels tall, and "Press Enter to go on." no longer shows on the round step, where Enter does nothing.
- Enter in the name field starts the interview on Calm form and Plan preview too, once Start is on.
- Starting an interview puts keyboard focus on its first page instead of dropping it.
- On a phone-sized screen or in Pop out, New interview's Undo toast sits above the Try layouts corner instead of on top of it.
- Going back in the browser after New interview shows the setup page with a plain address, not the old interview's #/intro.

### Header fixes

- Contextual header (D) changes with the page again in Chrome and Edge: Help and What's new show Back, Deep dive shows New interview, and a question shows the clock.
- Back on the Contextual header's Help and What's new returns to the page you were on, or to Deep dive in a tab opened straight on Help, instead of stepping back out of the kit.
- The Contextual header's More button shows the What's new dot until you open that page, as the Quiet bar and Cockpit headers do.
- The Cockpit header's clock and cue keep time in Pop out while the tab behind your call is in the background, instead of lagging behind.
- In the Quiet bar header on a phone or in Pop out, Escape closes the More menu and puts you back on More, instead of losing your place.
- The Contextual header's More menu opens fully on screen in the phone menu and in Pop out, down to 320px wide, instead of hanging off the left edge.
- The Two clusters header fits the window at any desktop width: a long candidate name and the round shorten with an ellipsis, and on narrower desktops the tools show only their icons.

### Leave a note on each layout you try


- Every group in Try layouts has a notes box for the version you picked, such as Notes on Question layout B. Each version keeps its own note, so you can switch back and forth, and New interview never clears them. Copy summary adds the notes with text under its Setup line, such as "Question layout B: header crowds the pager".
- The Layout trial is now called Question layout, since it only changes the question page. Copy summary and the notes use the new name, and notes you left under the old one move over.

### Start the next interview from one button

- New candidate and Change round are now one New interview button in the header. It clears the name, ticks and notes, then takes you back to the setup page with the same round already picked, and you can undo it for ten seconds. The Deep dive page no longer has its own New candidate button.
- What's new and Help sit beside Try layouts on the setup page, so you can read them before you pick a round.

## 0.7.5 · 2026-10-23

### Arrow keys move between the question folders

- In the Timeline sidebar, Up and Down move between the folders under All questions, and Home and End jump to the first and last. Enter or Space still opens or closes one.

### Set when the interview starts, and the clock counts down to it

- The setup page asks when the interview starts: Now, a quarter hour from half an hour ago to two hours ahead, or any other date and time. Until then the clock in the tab title and in Pop out counts down, such as −4:12, then counts up from the start. New candidate still starts the clock right away.
- Try layouts is on the setup page too, in the same corner, and Copy summary's Setup line names the header and the setup page you used.
- Four setup pages to try from Try layouts: a calm form, one step at a time, a plan preview with the hour's clock times, and a quick one-line start.
- Questions still being checked now show a small Being reviewed badge instead of the before-and-after note, which interviewers couldn't act on. The notes no longer ship in the built file, and the sidebar list says Being reviewed too.
- Code in a question is colored like it is in an editor: keywords, strings, comments, functions and tags each get their own color, readable in light, dark and the brand theme.

### Focus rings and ticks stay whole

- A focus ring at the edge of a scrolling column, such as the sidebar's filter box, now shows in full, and a ticked Look for box no longer pops past its column's edge.

## 0.7.4 · 2026-10-23

### Find out why the kit works the way it does

- A Help page, linked next to What's new, walks you through a round, then explains choices like why there's no score for you to give. Screenshots and short clips show what each answer means.
- Small ? icons beside Look for, Pools, the time total, Copy summary and a few other spots give the short answer, with a link to the rest in Help.

## 0.7.3 · 2026-10-23

### Try layouts from one button in the corner

- The Layout, Sidebar and Theme switchers moved out of the header and the phone menu into one Try layouts button at the bottom left. It sits in the same spot on a laptop, a phone and in Pop out, and your picks are saved as before.

## 0.7.2 · 2026-10-23

### See what each release lets you do, before your next interview

- This page leads each release with what it does for you in an interview, with screenshots of the features. The newest release opens the page in full, and it all still works offline from the one file.

## 0.7.1 · 2026-10-23

### Run the whole interview from a small window over your call

- Pop out now carries the whole kit, so you can pick questions, read hints, tick, take notes and switch rounds from the small window over a call. The elapsed time stays in its top corner. Closing the window brings the kit back to the tab, with nothing lost.

## 0.7.0 · 2026-10-23

### See how full the hour is at a glance

- The time total in the sidebar is a meter, so you can see at a glance how full the hour is.
- The tab title shows the time since you picked the round.
- Pop out: a small always-on-top window with the open question's Look for ticks, Notes and the elapsed time.
- Ticking a Look for item gives a small pop, and a short buzz on phones that support it.
- Long code blocks and the question column fade at the edge only while there's more to scroll.
- Moving to the previous or next question slides the page, and sections open and close smoothly. All motion stays off if your system asks for reduced motion.
- A What's new page (this one), with the version and build of the copy you have. A small dot on its link means there's something you haven't seen yet.

## 0.6.0 · 2026-10-23

### Pick the sidebar that matches how you run the hour


- Four sidebars to try (A to D), switched from the header: the original, a run of show, Now and next, and an outline with search.
- Copy summary ends with the setup you tried: layout, sidebar, theme and color scheme.
- Checkbox and radio lists are easier to read: wrapped lines line up with the text, and rows have more room.
- Layouts switch by text size as well as window size, so a larger default font gets the roomier layout sooner.

## 0.5.0 · 2026-10-23

### Every question you ask covers new ground

- The pick never puts two questions that cover the same ground in one interview. Opening the one left out says which question it overlaps.
- The candidate's name is asked for before you pick a round, shown in the header and drawer, and starts Copy summary.
- Cards still being checked show a Needs check note with what changed, and the sidebar lists them.
- Many question cards were reworded and seven duplicates removed after a review pass.
- Accessibility: a Skip to content control, a clear focus ring everywhere, and buttons that say when they're pressed.

## 0.4.0 · 2026-10-23

### Switch between light and dark, or follow your system

- Light, Dark and Auto color schemes, from icon buttons in the header and the phone drawer.
- Colors come from your browser and system by default.
- A Theme switcher appears when the content pack ships its own brand theme.

## 0.3.0 · 2026-10-22

### Keep the question, your notes and the Look for list in view together


- Two question layouts to choose from in the header: Columns, with Notes and Look for beside the question, and Dock, with them along the bottom.
- The pager and the notes stay put as you move between questions.
- A phone layout: a top bar with the timeline in a drawer, and Question and Assess tabs.
- Keyboard shortcuts on question pages; press ? to see them.

## 0.2.0 · 2026-10-22

### Tick what you hear now, and score it after

- Look for bullets are tick boxes. The score (Weak, Solid or Strong) shows only in the Deep dive list, after the interview.
- Notes and a Mark done button on every question.
- New candidate clears the ticks, notes and done marks, with a short Undo.
- The sidebar is a timeline: Intro, the round, the deep dive with its questions, and Outro, with the time each takes.

## 0.1.0 · 2026-10-22

### Plan and run an interview from one file

- The kit: round scripts and question pools in one HTML file you can open straight from disk.
- The Deep dive planner: set the minutes, check pools in order of focus, and the kit picks questions that fit.
- Copy summary puts the round, the picked questions and your ticks on the clipboard.
