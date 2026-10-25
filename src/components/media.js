import manifest from '../../capture/manifest.json';
import { esc } from '../esc.js';
import './media.css';

// CHANGELOG.md and HELP.md name their screenshots and clips media/<file>, all from src/media/. The build inlines
// each file once as a data URL, so the page stays one offline file even when both pages show the same clip.
const files = Object.fromEntries(Object.entries(import.meta.glob('../media/*', { eager: true, query: '?url', import: 'default' }))
  .map(([path, url]) => [path.replace('../', ''), url]));

// Every capture is 2x, so its CSS size is half its pixels. Width and height hold its room before it loads, so the page
// doesn't shift under a deep link; the ratio lets the CSS cap the width when the height cap binds, without stretching.
const sizes = new Map(Object.values(manifest).flatMap(({ files }) => Object.entries(files)).map(([file, { width, height }]) =>
  [`media/${file}`, ` width="${width / 2}" height="${height / 2}" style="--media-ratio: ${width / height}"`]));

// Marked renderer parts for a page that shows media. A paragraph holding only an image becomes a figure.
// Screenshots are 2x, which only srcset can say (a plain src counts as 1x). A clip's poster is the .webp of the same name.
export const mediaRenderer = ({ lazy }) => ({
  paragraph({ tokens }) {
    return tokens.length === 1 && tokens[0].type === 'image' ? `<figure class="media-figure">${this.parser.parseInline(tokens)}</figure>\n` : false;
  },
  image({ href, text }) {
    const src = esc(files[href] ?? href);
    const size = sizes.get(href) ?? '';
    if (!href.endsWith('.mp4')) return `<img class="media" srcset="${src} 2x" alt="${esc(text)}"${size} decoding="async"${lazy ? ' loading="lazy"' : ''}>`;
    const poster = files[href.replace(/\.mp4$/, '.webp')];
    // Silent, so it may autoplay; under reduced motion it waits for its controls.
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return `<video class="media media-clip" src="${src}"${poster ? ` poster="${esc(poster)}"` : ''} aria-label="${esc(text)}"${size} muted loop playsinline ${
      still ? 'controls' : 'autoplay'}></video>`;
  },
});
