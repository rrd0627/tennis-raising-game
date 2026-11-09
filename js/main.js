import { loadManifest } from './art.js';
import { start } from './ui.js';
import { loadStadium } from './stadium.js';

loadManifest().finally(start);
loadStadium();   // 경기장 모델은 첫 경기 전까지 미리 받아 둔다
