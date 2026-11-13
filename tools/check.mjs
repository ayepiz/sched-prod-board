import { chromium } from 'playwright';
const url = process.argv[2];
const b = await chromium.launch();
for (const [locale, timezoneId] of [['en-NZ','Pacific/Auckland'],['de-DE','Europe/Berlin'],['en-US','America/Phoenix']]) {
  const ctx = await b.newContext({ locale, timezoneId });
  const p = await ctx.newPage();
  const logs = []; p.on('console', m => logs.push(m.text()));
  await p.goto(url);
  const loaderSeen = await p.locator('[data-testid=loader]').count();
  await p.locator('[data-testid=incident-row]').first().waitFor();
  const loaderAfter = await p.locator('[data-testid=loader]').count();
  const r = p.locator('[data-testid=incident-row]').first();
  console.log(locale, timezoneId, 'loader on open:', loaderSeen, 'after:', loaderAfter,
    '| first:', await r.getAttribute('data-id'), await r.locator('time').textContent(), await r.locator('time').getAttribute('datetime'));
  if (locale === 'en-US') {
    const n0 = await p.locator('[data-testid=incident-row]').count();
    const top0 = await r.getAttribute('data-id');
    const last = p.locator('[data-testid=incident-row]').last();
    const lastId = await last.getAttribute('data-id');
    await last.locator('[data-testid=ack]').click();
    await last.locator('[data-testid=acked]').waitFor();
    await p.waitForTimeout(9000);
    const n1 = await p.locator('[data-testid=incident-row]').count();
    const top1 = await p.locator('[data-testid=incident-row]').first().getAttribute('data-id');
    console.log('rows', n0, '->', n1, 'top', top0, '->', top1, '| acked', lastId, 'still acked:', await p.locator(`[data-id="${lastId}"] [data-testid=acked]`).count());
    console.log('sha meta', await p.locator('meta[name=build]').getAttribute('content'), 'footer', await p.locator('[data-testid=build-sha]').textContent());
    console.log('console:', logs.map(l => l.slice(0, 60)).join(' | '));
  }
  await ctx.close();
}
await b.close();
