const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { randomBytes, pbkdf2Sync } = require('node:crypto');
const assert = require('node:assert/strict');
const password = randomBytes(24).toString('base64');
const salt = randomBytes(16);
const server = spawn('dotnet', ['tests/auth-build/DisplayStockAPI.dll', '--urls', 'http://localhost:5082'], {
  env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', Auth__Username: 'auth-test',
    Auth__PasswordHash: salt.toString('base64') + '.' + pbkdf2Sync(password, salt, 600000, 32, 'sha256').toString('base64'),
    Database__Initialize: 'false' }, stdio: ['ignore','pipe','pipe']
});
let browser;
(async () => {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Servidor de prueba no inició')), 20000);
    server.stdout.on('data', data => { if (data.toString().includes('Now listening')) { clearTimeout(timeout); resolve(); } });
    server.on('exit', code => { clearTimeout(timeout); reject(Error('Servidor terminó: '+code)); });
  });
  browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: 'http://localhost:5082' });
  const api = context.request;
  for (const path of ['products','categories','products/movements','products/reports','auth/me'])
    assert.equal((await api.get('/api/'+path)).status(), 401, path);
  assert.equal((await api.post('/api/products', {data:{}})).status(),401);
  assert.equal((await api.get('/health')).status(),200);
  assert.equal((await api.post('/api/auth/login', {data:{username:'auth-test',password}})).status(),400);
  const token = (await (await api.get('/api/auth/csrf')).json()).token;
  assert.equal((await api.post('/api/auth/login', {headers:{'X-CSRF-TOKEN':token},data:{username:'auth-test',password:'wrong'}})).status(),401);
  const page = await context.newPage();
  await page.goto('/'); assert.ok(page.url().endsWith('/login.html'));
  await page.goto('/swagger'); assert.ok(page.url().endsWith('/login.html'));
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'tests/artifacts/login-mobile.png'});
  await page.getByLabel('Usuario', {exact:true}).fill('auth-test');
  await page.getByLabel('Contraseña', {exact:true}).fill(password);
  await page.getByRole('button', {name:'Ingresar al inventario'}).click();
  await page.waitForURL('http://localhost:5082/');
  await page.locator('#overview .stat').first().waitFor();
  assert.equal((await api.get('/api/products')).status(),200);
  const cookie = (await context.cookies()).find(c=>c.name==='StockApp.Session');
  assert.ok(cookie.httpOnly); assert.equal(cookie.sameSite,'Strict');
  assert.equal((await api.post('/api/auth/logout')).status(),400);
  await page.getByRole('button',{name:'Cerrar sesión'}).click();
  await page.waitForURL('**/login.html');
  assert.equal((await api.get('/api/products')).status(),401);
  const csrf = (await (await api.get('/api/auth/csrf')).json()).token;
  let limited = false;
  for(let i=0;i<12;i++) {
    if((await api.post('/api/auth/login',{headers:{'X-CSRF-TOKEN':csrf},data:{username:'auth-test',password:'wrong'}})).status()===429) {limited=true;break;}
  }
  assert.ok(limited,'Límite de intentos');
  console.log('PASS: API privada, login, contraseña incorrecta, CSRF, cookie HttpOnly, logout móvil, Swagger privado y límite de intentos. Inventario sin modificaciones.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
