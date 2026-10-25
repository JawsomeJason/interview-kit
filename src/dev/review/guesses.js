// HELP.md marks a reason nothing on record backs with `<!-- guess: <the sentence, word for word> -->` after the block
// that holds it. Marked keeps it as an HTML comment, so the page shows nothing. Returns entry id -> its guessed sentences,
// in page order. Shared by the dev Help review and `npm run review:pending`, so it imports nothing.
export const helpGuesses = (text) => new Map(text.split(/^(?=### )/m).flatMap((chunk) => {
  const id = chunk.match(/^### .+? \{#([\w-]+)\}/)?.[1];
  const quotes = [...chunk.matchAll(/<!-- guess: (.+?) -->/g)].map((m) => m[1]);
  return id && quotes.length ? [[id, quotes]] : [];
}));
