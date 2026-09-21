const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.TEST_BASE_URL || 'http://localhost:5081';
async function request(path, method='GET', body) {
  const response = await fetch(base + '/api/' + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base);
    await page.locator('#overview .stat').first().waitFor();
    await page.locator('nav a[href="#categorias"]').click();
    const category = 'Displays prueba ' + Date.now();
    await page.locator('#categoryForm input').fill(category);
    await page.locator('#categoryForm button').click();
    await page.getByText('Categoría creada.', { exact: true }).waitFor();
    console.log('PASS: categoría en navegador');
    await page.locator('nav a[href="#productos"]').click();
    await page.locator('#productos a[href="#nuevo"]').click();
    await page.locator('#productForm [name="name"]').fill('Display A12');
    await page.locator('#productForm [name="brand"]').fill('Samsung');
    await page.locator('#productForm [name="category"]').selectOption(category);
    await page.locator('#productForm [name="price"]').fill('125,50');
    await page.locator('#productForm [name="quantity"]').fill('10');
    await page.locator('#productForm button[type="submit"]').click();
    await page.getByText('Producto cargado y cantidad inicial registrada.', { exact: true }).waitFor();
    const p = (await request('products')).data.find(p => p.category === category);
    assert(p);
    await page.locator('button[data-action="entry"][data-id="' + p.id + '"]').last().click();
    await page.locator('#entryForm [name="quantity"]').fill('5');
    await page.locator('#entryForm [name="reason"]').fill('Compra factura 123');
    await page.locator('#entryForm button').click();
    await page.getByText('Entrada registrada: 5 unidades. Puedes verla en el historial.', { exact: true }).waitFor();
    await page.locator('nav a[href="#salida"]').click();
    await page.locator('#exitForm [name="productId"]').selectOption(p.id);
    await page.locator('#exitForm [name="quantity"]').fill('3');
    await page.locator('#exitForm [name="reason"]').fill('Venta al cliente');
    await page.locator('#exitForm button').click();
    await page.getByText('Salida registrada: 3 unidades. Puedes verla en el historial.', { exact: true }).waitFor();
    assert.equal((await request('products/' + p.id)).data.quantity, 12);
    await page.locator('nav a[href="#historial"]').click();
    await page.getByRole('cell', { name: 'Venta al cliente', exact: true }).waitFor();
    await page.locator('nav a[href="#reportes"]').click();
    await page.locator('#reportFilters [name="productId"]').selectOption(p.id);
    await page.locator('#reportFilters button').click();
    await page.locator('#reportOutput:not([hidden])').waitFor();
    assert.equal(await page.locator('#reportCards .stat').nth(0).locator('strong').textContent(), '15');
    assert.equal(await page.locator('#reportCards .stat').nth(1).locator('strong').textContent(), '3');
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#exportReport').click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'reporte-inventario.csv');
    const csv = fs.readFileSync(await download.path(), 'utf8');
    assert(csv.includes('Samsung'));
    // Validation and concurrency: never oversell even with simultaneous requests.
    assert.equal((await request('products/' + p.id + '/use', 'POST', { quantity: 13 })).status, 409);
    assert.equal((await request('products/' + p.id + '/use', 'POST', { quantity: -1 })).status, 400);
    assert.equal((await request('products/' + p.id + '/use', 'POST', { quantity: 1.5 })).status, 400);
    assert.equal((await request('products/' + p.id, 'DELETE')).status, 409);
    assert.equal((await request('categories/' + encodeURIComponent(category), 'DELETE')).status, 409);
    const concurrent = await Promise.all([request('products/' + p.id + '/use', 'POST', { quantity: 8, reason: 'Prueba concurrente' }), request('products/' + p.id + '/use', 'POST', { quantity: 8 })]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [204, 409]);
    assert.equal((await request('products/' + p.id)).data.quantity, 4);
    // Stale descriptive edits must not overwrite the updated quantity.
    await request('products/' + p.id, 'PUT', { ...p, quantity: 10, name: 'Display A12 editado' });
    assert.equal((await request('products/' + p.id)).data.quantity, 4);
    // Totals must include records beyond the page limit.
    for (let batch = 0; batch < 21; batch++) {
      const results = await Promise.all(Array.from({ length: 5 }, () => request('products/' + p.id + '/restock', 'POST', { quantity: 1, reason: 'Prueba de paginación' })));
      assert(results.every(r => r.status === 204));
    }
    const report = (await request('products/reports?productId=' + p.id)).data;
    assert.equal(report.movements.entries, 120);
    assert.equal(report.movements.exits, 11);
    const history = (await request('products/movements?productId=' + p.id + '&pageSize=25')).data;
    assert.equal(history.items.length, 25);
    assert.equal(history.total, 110);
    assert.equal((await request('products/reports?from=2026-09-20T00:00:00Z&to=2026-09-01T00:00:00Z')).status, 400);
    await request('products/' + p.id + '/use', 'POST', { quantity: 109 });
    assert.equal((await request('products/' + p.id, 'DELETE')).status, 204);
    assert.equal((await request('products/' + p.id)).status, 404);
    assert.equal((await request('products/movements?productId=' + p.id)).data.total, 111);
    assert.equal((await request('products/reports?productId=' + p.id)).data.movements.entries, 120);
    assert.equal((await request('products', 'POST', { name: ' ', brand: 'B', price: 0, quantity: 0, category })).status, 400);
    // Verify untrusted user text is displayed literally, not executed as HTML.
    const xss = (await request('products', 'POST', { name: '<img src=x onerror="window.injected=1">', brand: 'Marca', category, price: 1, quantity: 0 })).data;
    await page.locator('#refresh').click();
    await page.getByText('Inventario actualizado.', { exact: true }).waitFor();
    await page.locator('nav a[href="#productos"]').click();
    assert.equal(await page.locator('#productRows img').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await request('products/' + xss.id, 'DELETE');
    await page.reload();
    await page.locator('#overview .stat').first().waitFor({ state: 'attached' });
    await page.locator('nav a[href="#inicio"]').click();
    await page.locator('#inicio:not([hidden])').waitFor();
    fs.mkdirSync('tests/artifacts', { recursive: true });
    await page.screenshot({ path: 'tests/artifacts/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('nav a[href="#productos"]').click();
    await page.locator('#productos:not([hidden])').waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: 'tests/artifacts/mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: formularios, entradas/salidas, motivos, CSV, concurrencia, validaciones, paginación, reportes completos, archivado, XSS y móvil.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
