import './style.css';
import './themes/system.css';
import './themes/pack.js';
import './layouts/shell.css';
import './layouts/question.css';
import './layouts/phone.css';
import pack from 'virtual:pack';
import * as plugins from 'virtual:plugins';
import { startSession } from './ui/session.js';

// Dev tools (src/dev/) exist only on the dev server; builds drop this import. Tests skip them too, since they fetch
// the dev server's own endpoints.
if (import.meta.env.DEV && import.meta.env.MODE !== 'test') import('./dev/index.js');

startSession(document.getElementById('root'), { pack, plugins, stamp: { version: __APP_VERSION__, sha: __GIT_SHA__ } });
