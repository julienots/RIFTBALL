// Renders branding/icon.html to branding/icon-1024.png with the bundled Chromium.
import { chromium } from 'playwright';
import path from 'node:path';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
await p.goto('file://' + path.resolve('branding/icon.html'));
await p.waitForTimeout(500);
await p.screenshot({ path: 'branding/icon-1024.png', omitBackground: true });
await b.close();
