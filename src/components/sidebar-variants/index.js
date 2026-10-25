// Trial sidebars, switched in the header. After the maintainer picks one, delete the other letters here
// and their files. Each variant default-exports { label, render(ctx), bind?(el, ctx) }:
// render returns the markup for .sidebar-body and bind wires it up; both run on every nav update with
// ctx = { round, parts, dd, picked, done, pools, questions, question, route, navigate(hash) }.
// A <details> with an id keeps its open state across updates.
import a from './a.js';
import b from './b.js';
import c from './c.js';
import d from './d.js';

export const SIDEBARS = { a, b, c, d };
