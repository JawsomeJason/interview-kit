import Ajv2020 from 'ajv/dist/2020.js';
import { closest, slug } from './doc.js';

// What an author calls a lowered field that came from a section rather than a frontmatter key.
const SECTIONS = {
  ask: '"## Ask"', brief: '"## Brief"', lookFor: '"## Look for"', followUps: '"## Follow-ups"', stretch: '"## Stretch"',
  decisions: '"## Decisions"', blocks: 'A "##" block', reviewMd: '"## Review"', segments: 'run:', levels: 'A "## <level>" heading', nudges: 'Nudge lines',
};
const TYPES = { integer: ['a whole number', '10'], number: ['a number', '10'], string: ['text', '"some text"'], array: ['a list', '[a, b]'], object: ['"key: value" lines', 'name: value'], boolean: ['true or false', 'true'] };
const ID = '^[a-z][a-z0-9-]*$';

const label = (key) => (key === undefined ? 'This file' : SECTIONS[key] ?? `${key}:`);

function message(e) {
  const key = e.instancePath.split('/').slice(1).reverse().find((s) => !/^\d+$/.test(s));
  const name = label(key);
  const value = JSON.stringify(e.data);
  const ps = e.parentSchema ?? {};
  switch (e.keyword) {
    case 'required': {
      const k = e.params.missingProperty;
      return SECTIONS[k] ? `${SECTIONS[k]} is missing.\n  Add it.` : `${k}: is missing.\n  Add "${k}:" to the frontmatter.`;
    }
    case 'additionalProperties': {
      const k = e.params.additionalProperty;
      const guess = closest(k, Object.keys(ps.properties ?? {}), 3);
      return `"${k}" is not a key here.\n  ${guess ? `Did you mean "${guess}"?` : `Keys: ${Object.keys(ps.properties ?? {}).join(', ')}.`}`;
    }
    case 'type': {
      const [what, example] = TYPES[[e.params.type].flat()[0]];
      return `${name} must be ${what}.\n  Write ${what}, such as ${example}.`;
    }
    case 'enum': return `${name} ${value} is not one of the choices.\n  Use one of: ${e.params.allowedValues.join(', ')}.`;
    case 'const': return `${name} ${value} is not allowed.\n  Use ${JSON.stringify(e.params.allowedValue)}.`;
    case 'minimum':
    case 'maximum': return `${name} ${value} is out of range.\n  Use a number from ${ps.minimum ?? 'any'} to ${ps.maximum ?? 'any'}.`;
    case 'pattern': return ps.pattern === ID
      ? `${name} ${value} is not lowercase letters, digits and hyphens.\n  Use "${slug(e.data) || 'id'}".`
      : `${name} ${value} does not match ${ps.pattern}.\n  Fix the value.`;
    case 'minItems': return `${name} has ${e.data.length}; the least is ${e.params.limit}.\n  Add more.`;
    case 'maxItems': return `${name} has ${e.data.length}; the most is ${e.params.limit}.\n  Cut it down.`;
    case 'minLength': return `${name} is empty.\n  Write some text.`;
    case 'uniqueItems': return `${name} lists ${JSON.stringify(e.data[e.params.j])} twice.\n  Keep one.`;
    case 'dependentRequired': return `${label(e.params.property)} needs ${label(e.params.missingProperty)} as well.\n  Add it.`;
    default: return `${name} ${e.message}.\n  Fix the value.`;
  }
}

// Compiles every schema once; the returned check reports a lowered file's schema errors at their source lines.
export function validator(schemas) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, verbose: true });
  for (const s of schemas) ajv.addSchema(s);
  return (sink, schemaId, json, lines) => {
    const check = ajv.getSchema(schemaId);
    if (check(json)) return;
    const seen = new Set();
    for (const e of check.errors) {
      if (seen.has(e.instancePath)) continue;
      seen.add(e.instancePath);
      let ptr = e.instancePath;
      while (ptr && lines[ptr] === undefined) ptr = ptr.slice(0, ptr.lastIndexOf('/'));
      sink.error(lines[ptr] ?? 1, message(e));
    }
  };
}
