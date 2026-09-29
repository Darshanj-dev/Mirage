// Live end-to-end check on the real chatbot sites (npm run e2e).
// Loads the built extension into your installed Chrome (fresh temporary profile), types the demo
// prompt with fictional data, presses Enter, and checks:
//   1. MIRAGE stops the send and shows the review panel (and how long that took),
//   2. Protect & send sends the protected prompt,
//   3. no outgoing request from the page contains any of the raw values.
// Sites behind a bot check or sign-in are reported as skipped, never worked around.
//
//   npm run build && npm run e2e -- chatgpt gemini perplexity

import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXT = resolve('.output/chrome-mv3');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = resolve('e2e/results');
mkdirSync(OUT, { recursive: true });

const SITES = {
  chatgpt: { url: 'https://chatgpt.com/', box: '#prompt-textarea[contenteditable="true"], textarea#mobile-composer-prompt' },
  gemini: { url: 'https://gemini.google.com/app', box: 'rich-textarea .ql-editor[contenteditable="true"]' },
  perplexity: { url: 'https://www.perplexity.ai/', box: '#ask-input' },
  claude: { url: 'https://claude.ai/new', box: 'div.ProseMirror[contenteditable="true"]' },
  copilot: { url: 'https://copilot.microsoft.com/', box: 'textarea#userInput' },
};

// Fictional values only. Keys are assembled at runtime so the repo holds no key-shaped string.
const RAW = {
  pan: 'BNZPM2501K',
  email: 'priya.demo@example.com',
  phone: '98450 12345',
  awsId: ['AKIA', 'Q7Z3', 'MIRAGEDEMO', '42'].join(''),
  awsSecret: ['mIr4gE', 'Demo', 'Fake', 'Key', '/xQ9', 'zT2v', 'Lp8w', 'Rn5k', 'Hs3j'].join('').padEnd(40, 'Q').slice(0, 40),
};
const PROMPT = [
  "I'm debugging my production application.",
  `AWS_ACCESS_KEY_ID=${RAW.awsId}`,
  `AWS_SECRET_ACCESS_KEY=${RAW.awsSecret}`,
  `My PAN is ${RAW.pan}.`,
  `My email is ${RAW.email}.`,
  `My phone number is ${RAW.phone}.`,
  'Reply in one short sentence.',
].join('\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shadow = (page, fn, ...args) =>
  page.evaluate((src, a) => {
    const root = document.querySelector('mirage-ui')?.shadowRoot;
    return root ? new Function('root', 'args', src)(root, a) : null;
  }, fn, args);

async function runSite(browser, id) {
  const site = SITES[id];
  const page = await browser.newPage();
  const leaks = [];
  const posts = [];
  page.on('request', (req) => {
    const body = req.postData() ?? '';
    if (req.method() !== 'GET' && body) posts.push(req.url());
    const hay = decodeURIComponent(req.url()) + ' ' + body;
    for (const [name, value] of Object.entries(RAW)) {
      if (hay.includes(value) || hay.includes(value.replace(/ /g, ''))) leaks.push(`${name} in ${req.method()} ${req.url().slice(0, 80)}`);
    }
  });
  const result = { site: id, status: 'skipped' };
  if (process.env.TRACE) {
    page.on('response', (r) => { if (r.request().method() !== 'GET') console.error('RESP', r.status(), r.request().method(), r.url().slice(0, 100)); }); // TRACE_NET
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.error('CONSOLE', m.type(), m.text().slice(0, 160)); });
    page.on('pageerror', (e) => console.error('PAGEERROR', String(e).slice(0, 200)));
  }
  try {
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const box = await page.waitForSelector(site.box, { visible: true, timeout: 25000 }).catch(() => null);
    if (!box) {
      result.reason = `no prompt box (title: ${await page.title()}) - bot check or sign-in`;
      await page.screenshot({ path: join(OUT, `${id}-skipped.png`) });
      return result;
    }
    await page.waitForFunction(() => !!document.querySelector('mirage-ui')?.shadowRoot?.querySelector('.mirage-badge'), { timeout: 15000, polling: 100 });
    // Line by line with Shift+Enter, like a person: rich editors drop programmatic newlines.
    await page.evaluate((sel) => document.querySelector(sel).focus(), site.box);
    for (const [i, line] of PROMPT.split('\n').entries()) {
      if (i > 0) {
        await page.keyboard.down('Shift');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Shift');
      }
      await page.evaluate((text) => document.execCommand('insertText', false, text), line);
    }
    await sleep(800);
    const badge = await shadow(page, "return root.querySelector('.mirage-badge')?.getAttribute('aria-label')");
    await page.screenshot({ path: join(OUT, `${id}-1-typed.png`) });

    const t0 = Date.now();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !!document.querySelector('mirage-ui')?.shadowRoot?.querySelector('.mirage-panel'), { timeout: 8000, polling: 50 });
    result.panelMs = Date.now() - t0;
    result.panel = await shadow(
      page,
      "const p = root.querySelector('.mirage-panel'); return { title: p.querySelector('.mirage-panel__title')?.textContent, level: p.querySelector('.mirage-level')?.textContent, items: [...p.querySelectorAll('.mirage-tag, .mirage-item__name')].map(e => e.textContent), aiSees: p.querySelector('.mirage-prompt')?.textContent };",
    );
    result.badge = badge;
    await page.screenshot({ path: join(OUT, `${id}-2-review.png`) });
    const leaksBeforeSend = leaks.length;

    await shadow(page, "root.querySelector('.mirage-btn--primary').click(); return true;");
    if (process.env.TRACE) {
      for (let i = 0; i < 20; i++) {
        await sleep(300);
        const snap = await page.evaluate((sel) => {
          const box = document.querySelector(sel);
          const root = document.querySelector('mirage-ui')?.shadowRoot;
          const btn = document.querySelector('button[data-composer-submit], button[data-testid="send-button"]');
          return { box: box ? ('value' in box ? box.value : box.innerText).slice(0, 60) : null, panel: root?.querySelector('.mirage-panel__title')?.textContent ?? null, btn: btn ? btn.getAttribute('aria-label') + ' disabled=' + btn.disabled + ' aria-disabled=' + btn.getAttribute('aria-disabled') : null };
        }, site.box);
        console.error(i, JSON.stringify(snap));
      }
    }
    await sleep(9000);
    await page.screenshot({ path: join(OUT, `${id}-3-sent.png`) });
    // Sent means the protected message is in the conversation: a removed-secret placeholder is
    // never put back, so it shows up outside the prompt box only if the site sent it.
    result.sent = await page.evaluate((sel) => {
      const box = document.querySelector(sel);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.data.includes('AWS_ACCESS_KEY_REMOVED') && !box?.contains(n)) return true;
      }
      return false;
    }, site.box);
    result.sentRequests = posts.length;
    result.leaks = leaks;
    result.leaksBeforeSend = leaksBeforeSend;
    result.status = leaks.length === 0 && result.panel?.items?.length && result.sent ? 'pass' : 'fail';
  } catch (err) {
    result.status = 'error';
    result.reason = String(err.message ?? err).slice(0, 200);
    await page.screenshot({ path: join(OUT, `${id}-error.png`) }).catch(() => {});
  }
  return result;
}

if (!existsSync(join(EXT, 'manifest.json'))) {
  console.error('Build first: npm run build');
  process.exit(1);
}
const ids = process.argv.slice(2).filter((a) => SITES[a]);
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  pipe: true,
  enableExtensions: true,
  userDataDir: mkdtempSync(join(tmpdir(), 'mirage-e2e-')),
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1400,900'],
  defaultViewport: { width: 1400, height: 900 },
  protocolTimeout: 60000,
});
const extId = await browser.installExtension(EXT);
if (process.env.REVEAL === 'hover') {
  // Settings page: turn off "Show real details in replies".
  const opts = await browser.newPage();
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await opts.waitForSelector('.card');
  await opts.evaluate(() => {
    const row = [...document.querySelectorAll('.row')].find((r) => r.textContent.includes('Show real details'));
    row.querySelector('.switch').click();
  });
  await new Promise((r) => setTimeout(r, 500));
  await opts.close();
}
const results = [];
for (const id of ids.length ? ids : ['chatgpt', 'gemini', 'perplexity']) results.push(await runSite(browser, id));
if (process.env.SHOTS) {
  // Popup and settings page, for the README.
  const shot = await browser.newPage();
  await shot.setViewport({ width: 372, height: 640 });
  await shot.goto(`chrome-extension://${extId}/popup.html`);
  await new Promise((r) => setTimeout(r, 800));
  await shot.screenshot({ path: join(OUT, 'popup.png') });
  await shot.setViewport({ width: 900, height: 1500 });
  await shot.goto(`chrome-extension://${extId}/options.html`);
  await new Promise((r) => setTimeout(r, 800));
  await shot.screenshot({ path: join(OUT, 'settings.png'), fullPage: true });
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.status === 'fail' || r.status === 'error') ? 1 : 0);
