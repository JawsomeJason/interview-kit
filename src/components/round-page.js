import { md } from '../markdown.js';
import { esc } from '../esc.js';

export const roundPage = (round) => `<h1>${esc(round.name)}</h1>${md.parse(round.body)}`;

// `#/intro` and `#/outro` render a part like the round page; any other route gives null.
export const partPage = (route, parts) => (Object.hasOwn(parts, route.slice(2)) ? roundPage(parts[route.slice(2)]) : null);
