import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { buildStamp, markSeen, whatsNewLink, whatsNewPage } from '../src/components/whats-new.js';

const stored = new Map();
vi.stubGlobal('localStorage', { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) });
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

test('the build stamp shows the version, a commit and the build date', () => {
  expect(buildStamp()).toMatch(new RegExp(`^<p class="build-stamp">Version ${version.replaceAll('.', '\\.')} · (?:[0-9a-f]{7,}|unknown) · \\d{4}-\\d{2}-\\d{2}</p>$`));
});

test("the What's new link shows a New dot until the page has been seen at this version", () => {
  const before = whatsNewLink().includes('whats-new-dot');
  markSeen();
  expect([before, whatsNewLink().includes('whats-new-dot'), JSON.parse(stored.get('interview-kit-layout')).seenVersion]).toEqual([true, false, version]);
});

// A release candidate, such as 1.0.0-rc.1, writes its notes under the release it leads to.
test('the newest CHANGELOG entry is the package version, or the release a candidate leads to', () => {
  expect(readFileSync('CHANGELOG.md', 'utf8').match(/^## (\d+\.\d+\.\d+) · \d{4}-\d{2}-\d{2}$/m)?.[1]).toBe(version.split('-')[0]);
});

const release = (body) => `# What's new\n\n## 2.0.0 · 2026-01-02\n\n### Newest\n\n${body}\n\n## 1.0.0 · 2026-01-01\n\n### Older\n\n${body}\n`;

test('a media path in the changelog becomes the bundled 2x file in the page, eager in the newest release and lazy below it', () => {
  const imgs = whatsNewPage(release('![A finding and its nudges](media/nudges.webp)')).match(/<img [^>]*>/g);
  expect(imgs).toEqual([
    '<img class="media" srcset="/src/media/nudges.webp 2x" alt="A finding and its nudges" width="317" height="350" style="--media-ratio: 0.9057142857142857" decoding="async">',
    '<img class="media" srcset="/src/media/nudges.webp 2x" alt="A finding and its nudges" width="317" height="350" style="--media-ratio: 0.9057142857142857" decoding="async" loading="lazy">',
  ]);
});

test('an .mp4 renders as a silent looping video that plays inline, with its .webp as the poster', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  expect(whatsNewPage(release('![Marking two rows](media/mark.mp4)')).match(/<video [^>]*>/)[0])
    .toBe('<video class="media media-clip" src="/src/media/mark.mp4" poster="/src/media/mark.webp" aria-label="Marking two rows" width="280" height="436" style="--media-ratio: 0.6422018348623854" muted loop playsinline autoplay>');
});

test('under reduced motion the video waits for its controls instead of autoplaying', () => {
  vi.stubGlobal('matchMedia', (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' }));
  expect(whatsNewPage(release('![Marking two rows](media/mark.mp4)')).match(/<video [^>]*>/)[0])
    .toBe('<video class="media media-clip" src="/src/media/mark.mp4" poster="/src/media/mark.webp" aria-label="Marking two rows" width="280" height="436" style="--media-ratio: 0.6422018348623854" muted loop playsinline controls>');
});

test('each release is a section with its version and headline, the newest marked as the latest', () => {
  const html = whatsNewPage(release('- A change.'));
  expect(html.match(/<section[^>]*>|<h[23][^>]*>[^<]*/g)).toEqual([
    '<section class="release release-latest">', '<h2 class="release-version">2.0.0 · 2026-01-02', '<h3 class="release-headline">Newest',
    '<section class="release">', '<h2 class="release-version">1.0.0 · 2026-01-01', '<h3 class="release-headline">Older',
  ]);
});

test('the page is one article that takes a tab stop, so a keyboard can reach and scroll it', () => {
  expect(whatsNewPage(release('- A change.')).match(/^<article [^>]*>/)[0]).toBe('<article class="whats-new" tabindex="0" aria-label="What\'s new">');
});
