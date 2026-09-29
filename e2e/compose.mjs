// Live check of Private Compose (npm run e2e:compose): writes the fictional demo prompt in
// MIRAGE's panel, inserts it into the chatbot, sends, and checks that the raw values never
// appeared in the chatbot's page (DOM) nor in any request.
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXT = resolve('.output/chrome-mv3');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SITES = {
  chatgpt: { url: 'https://chatgpt.com/', box: '#prompt-textarea[contenteditable="true"], textarea#mobile-composer-prompt' },
  gemini: { url: 'https://gemini.google.com/app', box: 'rich-textarea .ql-editor[contenteditable="true"]' },
};
const RAW = ['AKIA' + 'Q7Z3MIRAGEDEMO42', 'BNZPM2501K', 'priya.demo@example.com'];
const PROMPT = `I'm debugging my server. AWS_ACCESS_KEY_ID=${RAW[0]} My PAN is ${RAW[1]}. Email ${RAW[2]}. Reply with one word: ok.`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false, pipe: true, enableExtensions: true,
  userDataDir: mkdtempSync(join(tmpdir(), 'mirage-compose-')), args: ['--no-first-run', '--window-size=1400,900'],
  defaultViewport: { width: 1400, height: 900 }, protocolTimeout: 60000,
});
const extId = await browser.installExtension(EXT);
const results = [];
for (const id of process.argv.slice(2).filter((a) => SITES[a]).length ? process.argv.slice(2) : ['chatgpt', 'gemini']) {
  const site = SITES[id];
  const r = { site: id };
  const page = await browser.newPage();
  const leaks = [];
  page.on('request', (req) => { const hay = req.url() + ' ' + (req.postData() ?? ''); for (const v of RAW) if (hay.includes(v)) leaks.push(v); });
  try {
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!(await page.waitForSelector(site.box, { visible: true, timeout: 25000 }).catch(() => null))) { r.status = 'skipped (no prompt box: sign-in or bot check)'; results.push(r); continue; }
    await sleep(2500);
    // The panel, opened as a page aimed at the chatbot tab (the side panel itself needs a user click).
    const panel = await browser.newPage();
    await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
    const chatTabId = await panel.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url?.startsWith(u))?.id, site.url);
    await panel.goto(`chrome-extension://${extId}/sidepanel.html?tab=${chatTabId}`);
    await panel.waitForSelector('.compose__input');
    await panel.type('.compose__input', PROMPT, { delay: 0 });
    await sleep(400);
    r.panelItems = await panel.$$eval('.compose__items li span:first-child', (els) => els.map((e) => e.textContent));
    // As with the real side panel, the chat tab stays in front while the panel acts.
    await page.bringToFront();
    await panel.evaluate(() => document.querySelector('.btn--primary').click());
    await sleep(3000);
    r.panelStatus = await panel.$eval('.compose__status', (e) => e.textContent).catch(() => null);
    r.panelDraftCleared = (await panel.$eval('.compose__input', (e) => e.value)) === '';
    const box = await page.evaluate((sel) => { const b = document.querySelector(sel); return b ? ('value' in b ? b.value : b.innerText) : ''; }, site.box);
    r.boxHasPlaceholders = box.includes('«PAN_1»') && box.includes('AWS_ACCESS_KEY_REMOVED');
    r.rawInPageDom = await page.evaluate((raw) => raw.filter((v) => document.documentElement.outerHTML.includes(v)).length, RAW);
    await page.evaluate((sel) => document.querySelector(sel).focus(), site.box);
    await page.keyboard.press('Enter');
    await sleep(8000);
    r.sent = await page.evaluate((sel) => { const b = document.querySelector(sel); return !b || ('value' in b ? b.value : b.innerText).trim().length === 0 || !('value' in b ? b.value : b.innerText).includes('PAN_1'); }, site.box);
    r.rawInRequests = leaks.length;
    r.rawInPageDomAfterSend = await page.evaluate((raw) => raw.filter((v) => document.documentElement.outerHTML.includes(v)).length, RAW);
    r.status = r.boxHasPlaceholders && r.rawInPageDom === 0 && r.rawInRequests === 0 && r.rawInPageDomAfterSend === 0 && r.sent ? 'pass' : 'fail';
  } catch (e) { r.status = 'error: ' + String(e.message).slice(0, 150); }
  results.push(r);
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
