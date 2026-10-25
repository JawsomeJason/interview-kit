import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFeedback } from './review-pending.mjs';

const json = (res, value) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(value));
};

// Dev server only. /__review: POST appends a review form's answer as one JSON line to <dir>/feedback.jsonl, GET returns
// every line so far. /__questions: GET returns the lead's open questions from <dir>/questions.json.
// dir: the pack's .review folder, since the answers are about the pack's cards.
export default (dir) => ({
  name: 'review',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__review', (req, res) => {
      if (req.method === 'GET') return json(res, readFeedback(resolve(dir, 'feedback.jsonl')));
      if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          mkdirSync(dir, { recursive: true });
          appendFileSync(resolve(dir, 'feedback.jsonl'), `${JSON.stringify(JSON.parse(body))}\n`);
          res.statusCode = 204;
        } catch {
          res.statusCode = 400;
        }
        res.end();
      });
    });
    server.middlewares.use('/__questions', (req, res) => {
      const file = resolve(dir, 'questions.json');
      json(res, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []);
    });
  },
});
