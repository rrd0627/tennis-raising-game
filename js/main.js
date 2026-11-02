import { loadManifest } from './art.js';
import { start } from './ui.js';

loadManifest().finally(start);
