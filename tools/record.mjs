// Records the deployed board in use: open-board, ack-incident, watch-board, and the row-shift misclick.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, renameSync } from 'node:fs';
const [url, out = 'recordings/step1', locale = 'en-US', timezoneId = 'America/Hermosillo'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ locale, timezoneId, viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
// A visible pointer and a caption line, so a viewer can follow (Playwright video has no cursor).
await ctx.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #d0021b;border-radius:50%;background:rgba(208,2,27,.25);pointer-events:none;left:-50px;top:-50px;transition:transform .08s';
    document.body.append(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => (c.style.transform = 'scale(.6)'), true);
    addEventListener('mouseup', () => (c.style.transform = ''), true);
    const cap = document.createElement('div');
    cap.id = '__cap';
    cap.style.cssText = 'position:fixed;z-index:99998;left:0;right:0;bottom:0;padding:8px 16px;font:14px system-ui;background:#111;color:#fff;opacity:.88;pointer-events:none';
    cap.textContent = 'recording · sched-prod incident board';
    document.body.append(cap);
  });
});
const page = await ctx.newPage();
const t0 = Date.now();
const ts = () => { const s = Math.floor((Date.now() - t0) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const events = [];
const note = (flow, what, extra = {}) => { const e = { at: ts(), flow, what, ...extra }; events.push(e); console.log(JSON.stringify(e)); };
const acks = [];
page.on('console', (m) => { const t = m.text(); if (t.startsWith('ack ')) { const [, id, ackedAt, receipt] = t.split(' '); acks.push({ at: ts(), id, ackedAt, receipt }); } });
const caption = (t) => page.evaluate((t) => { const c = document.getElementById('__cap'); if (c) c.textContent = t; }, t).catch(() => {});
const rows = () => page.locator('[data-testid="incident-row"]');
const ids = () => rows().evaluateAll((els) => els.map((e) => e.dataset.id));

// open-board
await page.goto(url);
note('open-board', 'page requested; loader showing', { loader: await page.locator('[data-testid=loader]').count() });
await rows().first().waitFor();
note('open-board', 'incidents on screen, loader gone', { loader: await page.locator('[data-testid=loader]').count(), rows: await rows().count(), top: (await ids())[0] });
await caption('open-board: incidents loaded, newest first; times in viewer local time (' + timezoneId + ')');
await page.mouse.move(640, 300, { steps: 10 });
await page.waitForTimeout(2500);
await page.evaluate(() => document.querySelector('[data-testid=build-sha]').scrollIntoView({ block: 'center' }));
await caption('build sha in footer: ' + (await page.locator('[data-testid=build-sha]').textContent()));
note('open-board', 'footer build sha shown', { sha: await page.locator('[data-testid=build-sha]').textContent() });
await page.waitForTimeout(2500);
await page.evaluate(() => scrollTo(0, 0));

// ack-incident: careful click, right after a refresh with a fresh arrival, on the bottom row
await caption('ack-incident: Ack the oldest incident (bottom row)');
const n0 = await rows().count();
await page.waitForFunction((n) => document.querySelectorAll('[data-testid=incident-row]').length > n, n0);
const target1 = (await ids()).at(-1);
const btn1 = page.locator(`[data-id="${target1}"] [data-testid=ack]`);
const bb1 = await btn1.boundingBox();
await page.mouse.move(bb1.x + bb1.width / 2, bb1.y + bb1.height / 2, { steps: 15 });
await page.mouse.click(bb1.x + bb1.width / 2, bb1.y + bb1.height / 2);
await page.locator(`[data-id="${target1}"] [data-testid=acked]`).waitFor();
note('ack-incident', 'acked the intended row', { aimed: target1, acked: target1 });
await caption(`ack-incident: ${target1} acked`);
await page.waitForTimeout(2500);

// watch-board: hands off, new incidents arrive on top
await caption('watch-board: hands off — new incidents arrive on top without a reload');
await page.mouse.move(1150, 120, { steps: 10 });
const before = await ids();
const nW = before.length;
await page.waitForFunction((n) => document.querySelectorAll('[data-testid=incident-row]').length > n, nW, { timeout: 20000 });
const after = await ids();
note('watch-board', 'new incident on top without reload', { newTop: after[0], rowsBefore: nW, rowsAfter: after.length, ackedStillMarked: await page.locator(`[data-id="${target1}"] [data-testid=acked]`).count() });
await page.waitForTimeout(3000);

// ack-incident, the way on-call works: aim at a row's Ack, read for a moment, click. A new incident lands meanwhile.
const aimedId = (await ids())[2];
await caption(`ack-incident: on-call aims at Ack on ${aimedId} (3rd row)…`);
const bb2 = await page.locator(`[data-id="${aimedId}"] [data-testid=ack]`).boundingBox();
const x = bb2.x + bb2.width / 2, y = bb2.y + bb2.height / 2;
await page.mouse.move(x, y, { steps: 15 });
note('ack-incident', 'pointer on Ack of aimed row', { aimed: aimedId });
const nA = await rows().count();
await page.waitForFunction((n) => document.querySelectorAll('[data-testid=incident-row]').length > n, nA, { timeout: 20000 });
await page.waitForTimeout(250); // human reaction: the click was already on its way
const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid=incident-row]')?.dataset.id, [x, y]);
await page.mouse.click(x, y);
await page.waitForFunction(() => window.__x !== 1 && true);
await page.locator(`[data-id="${under}"] [data-testid=acked]`).waitFor();
const ackMoment = ts();
note('ack-incident', 'a new incident pushed the rows down just before the click; the click acked a different incident', { aimed: aimedId, acked: under, aimedStillOpen: await page.locator(`[data-id="${aimedId}"] [data-testid=ack]`).count() });
await caption(`MISS: aimed at ${aimedId}, but a new row landed on top first — the click acked ${under}`);
await page.locator(`[data-id="${under}"]`).hover().catch(() => {});
await page.waitForTimeout(5000);
await caption('end of recording');
await page.waitForTimeout(1500);
const sha = await page.locator('meta[name=build]').getAttribute('content');
const videoPath = await page.video().path();
await ctx.close();
await b.close();
renameSync(videoPath, `${out}/board.webm`);
writeFileSync(`${out}/events.json`, JSON.stringify({ url, locale, timezoneId, sha, startedAt: new Date(t0).toISOString(), events, acks, ackMoment }, null, 2));
console.log('done', out);
