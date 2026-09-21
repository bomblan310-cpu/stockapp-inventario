const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const product = { id: '11111111-1111-1111-1111-111111111111', name: 'Display de prueba', brand: 'Samsung', category: 'Displays', price: 125000.5, quantity: 12500 };
  const writes = [];
  // Isolated presentation test; session enforcement is covered by auth.cjs.
  await page.route('http://localhost:5080/', route => route.fulfill({
    contentType: 'text/html', body: require('node:fs').readFileSync('wwwroot/index.html', 'utf8')
  }));
  // Intercept all API calls: these checks never modify the user's database.
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { username: 'Test' } });
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { token: 'mock-token' } });
    if (req.method() !== 'GET') {
      writes.push({ path, body: req.postDataJSON() });
      return route.fulfill({ status: path.endsWith('/use') || path.endsWith('/restock') ? 204 : 200,
        contentType: 'application/json', body: path.endsWith('/use') || path.endsWith('/restock') ? '' : JSON.stringify(product) });
    }
    await route.fulfill({ json: path.endsWith('/categories') ? ['Displays'] : [product] });
  });
  try {
    await page.goto('http://localhost:5080');
    await page.locator('#overview .stat').first().waitFor();
    await page.locator('a[href="#nuevo"]').first().click();
    await page.locator('#nuevo:not([hidden])').waitFor();
    const price = page.locator('#productForm [name="price"]');
    const quantity = page.locator('#productForm [name="quantity"]');
    await price.fill('');
    await price.pressSequentially('125000,50');
    assert.equal(await price.inputValue(), '125.000,50');
    await quantity.fill('12500');
    assert.equal(await quantity.inputValue(), '12.500');
    await price.fill('999999999,99');
    assert.equal(await price.evaluate(e => e.checkValidity()), false);
    await price.fill('-12');
    assert.equal(await price.evaluate(e => e.checkValidity()), false);
    await price.fill('125000,50');
    await quantity.fill('1,5');
    assert.equal(await quantity.evaluate(e => e.checkValidity()), false);
    await quantity.fill('12500');
    await page.locator('#productForm [name="name"]').fill('Display');
    await page.locator('#productForm [name="brand"]').fill('Samsung');
    await page.locator('#productForm [name="category"]').selectOption('Displays');
    await page.locator('#productForm button[type="submit"]').click();
    await page.getByText('Producto cargado y cantidad inicial registrada.', { exact: true }).waitFor();
    assert.equal(writes[0].body.price, 125000.5);
    assert.equal(writes[0].body.quantity, 12500);
    await page.locator('[data-action="edit"]').click();
    await page.locator('#nuevo:not([hidden])').waitFor();
    assert.equal(await price.inputValue(), '125.000,50');
    assert.equal(await quantity.inputValue(), '12.500');
    await page.locator('nav a[href="#salida"]').click();
    await page.locator('#exitForm [name="productId"]').selectOption(product.id);
    const outgoing = page.locator('#exitForm [name="quantity"]');
    await outgoing.fill('13000');
    assert.equal(await outgoing.inputValue(), '13.000');
    assert.equal(await outgoing.evaluate(e => e.checkValidity()), false);
    await outgoing.fill('2500');
    assert((await page.locator('#exitForm .stock-preview').textContent()).includes('10.000'));
    await page.locator('#exitForm button').click();
    await page.getByText('Salida registrada: 2.500 unidades. Puedes verla en el historial.', { exact: true }).waitFor();
    assert.equal(writes[1].body.quantity, 2500);
    await page.locator('nav a[href="#entrada"]').click();
    await page.locator('#entryForm [name="productId"]').selectOption(product.id);
    await page.locator('#entryForm [name="quantity"]').fill('1500');
    await page.locator('#entryForm button').click();
    await page.getByText('Entrada registrada: 1.500 unidades. Puedes verla en el historial.', { exact: true }).waitFor();
    assert.equal(writes[2].body.quantity, 1500);
    console.log('PASS: miles al escribir, coma decimal, edición, límites, entradas/salidas y payloads numéricos sin alterar datos reales.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
