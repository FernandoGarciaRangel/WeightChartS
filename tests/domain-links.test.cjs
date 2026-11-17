const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const root = resolve(__dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const html = read('index.html');
const attr = (tag, key) => tag.match(new RegExp('\\b' + key + '="([^"]*)"'))?.[1];
const production = 'https://peso.garciadev.tech/';
const expectedBackCount = 3;

test('metadados e navegação usam os domínios de produção aprovados', () => {
  const tags = [...html.matchAll(/<(?:link|meta|a)\b[^>]*>/g)].map(m => m[0]);
  const canonical = tags.find(t => attr(t, 'rel') === 'canonical');
  assert.equal(canonical && attr(canonical, 'href'), production);
  const og = tags.find(t => attr(t, 'property') === 'og:url');
  assert.equal(og && attr(og, 'content'), production);
  const backs = tags.filter(t => (attr(t, 'class') || '').split(/\s+/).includes('btn-back'));
  assert.equal(backs.length, expectedBackCount);
  for (const back of backs) assert.equal(attr(back, 'href'), 'https://apps.garciadev.tech/');
  assert.doesNotMatch(html, /apps-hub-beta\.vercel\.app|calculadora-tmb-five\.vercel\.app|refeicao-livre\.vercel\.app|weight-charts\.vercel\.app|bancada\.garciadev\.tech/);
});

test('voltar ao hub mantém localhost estrito e produção como padrão', () => {
  let source;
  if (production.includes('//tmb.')) {
    source = read('app.js').match(/function apontarBackParaHubLocal\(\) \{[\s\S]*?\n  \}/)[0] + '; apontarBackParaHubLocal();';
  } else {
    source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .map(m => m[1]).find(s => s.includes("querySelectorAll('.btn-back')"));
  }
  assert.ok(source, 'script real de navegação encontrado');
  for (const hostname of ['localhost', '127.0.0.1', new URL(production).hostname, 'localhost.evil.com', '127.0.0.1.evil.com']) {
    const links = Array.from({length: expectedBackCount}, () => ({href: 'https://apps.garciadev.tech/'}));
    vm.runInNewContext(source, {location: {hostname}, document: {querySelectorAll: () => links}});
    for (const link of links) assert.equal(link.href, ['localhost', '127.0.0.1'].includes(hostname) ? 'http://localhost:8080/' : 'https://apps.garciadev.tech/');
  }
});

test('Firebase authDomain e caminhos PWA permanecem independentes do domínio público', () => {
  assert.match(html, /authDomain: 'weightcharts-314d1\.firebaseapp\.com'/);
  const manifest = JSON.parse(read('src/manifest.json'));
  assert.equal(manifest.start_url, '/');
  assert.match(read('sw.js'), /const CACHE_VERSION = 'v4';/);
  assert.match(html, /register\('\/sw\.js'\)/);
});
