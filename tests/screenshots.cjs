const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto('http://localhost:5080');
    await page.locator('#overview .stat').first().waitFor();
    await page.screenshot({ path: 'tests/artifacts/inicio.png', fullPage: true });
    await page.locator('nav a[href="#productos"]').click();
    await page.locator('#productos:not([hidden])').waitFor();
    await page.screenshot({ path: 'tests/artifacts/productos.png', fullPage: true });
    await page.locator('#productos a[href="#nuevo"]').click();
    await page.locator('#nuevo:not([hidden])').waitFor();
    await page.screenshot({ path: 'tests/artifacts/cargar-producto.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'tests/artifacts/formulario-movil.png', fullPage: true });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('Desbordamiento móvil');
    console.log('Capturas verificadas en escritorio y móvil; sin modificar el inventario.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
