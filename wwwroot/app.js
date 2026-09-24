"use strict";
const $ = id => document.getElementById(id);
let csrfToken = "";
const state = { products: [], categories: [], dashboardMovements: [], page: 1, productPage: 1, history: null, report: null, historyQuery: null, reportQuery: null, ready: false, busy: false };
const titles = { resumen: "Resumen del inventario", productos: "Productos", nuevo: "Cargar producto", entrada: "Registrar entrada", salida: "Registrar salida", historial: "Historial", reportes: "Reportes", categorias: "Categorías" };
const types = { Added: "Carga inicial", Restocked: "Entrada", Used: "Salida", Updated: "Edición de datos", Voided: "Carga anulada" };
const number = new Intl.NumberFormat("es-PY");
const money = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const productPrice = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const productPageSize = 10;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const field = (form, key) => form.elements.namedItem(key);
function message(text, error = false) {
  $("message").textContent = text;
  $("message").className = error ? "error" : "";
  $("message").hidden = false;
}
async function api(path, options = {}) {
  let response;
  try { response = await fetch("/api/" + path, { ...options, headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrfToken } }); }
  catch { throw new Error("Se perdió la conexión. Actualiza el inventario antes de volver a guardar."); }
  if (!response.ok) {
    if (response.status === 401) { location.replace("/login.html"); throw new Error("La sesión venció. Ingresa nuevamente."); }
    const text = await response.text();
    let detail = text;
    try {
      const data = JSON.parse(text);
      detail = typeof data === "string" ? data : data.message || (data.errors && Object.values(data.errors).flat().join(" ")) || data.title;
    } catch { /* The API can return plain text conflicts. */ }
    throw new Error(detail || "No se pudo completar la operación.");
  }
  return response.status === 204 ? null : response.json();
}
function post(body, method = "POST") { return { method, body: JSON.stringify(body) }; }
function stat(label, value, help = "") {
  return '<article class="stat"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(help) + '</small></article>';
}
function options(select, rows, first) {
  const selected = select.value;
  select.innerHTML = '<option value="">' + esc(first) + '</option>' + rows.map(([value, text]) => '<option value="' + esc(value) + '">' + esc(text) + '</option>').join("");
  if (rows.some(([value]) => value === selected)) select.value = selected;
}
function refreshMovementProducts(form) {
  const search = form.querySelector(".movement-product-search").value.trim().toLocaleLowerCase();
  const products = state.products.filter(p => !search || (p.name + " " + p.brand).toLocaleLowerCase().includes(search));
  const rows = products.map(p => [p.id, p.name + " · " + p.brand + " (" + number.format(p.quantity) + " disponibles)"]);
  options(field(form, "productId"), rows, products.length ? "Seleccionar producto" : "No hay coincidencias");
  form.querySelector(".movement-search-count").textContent = search ? number.format(products.length) + (products.length === 1 ? " producto encontrado" : " productos encontrados") : "";
  preview(form);
}
function dateValue(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function queryFrom(form) {
  const from = field(form, "from").value, to = field(form, "to").value;
  if (!from || !to || from > to) throw new Error("Selecciona un período válido: Desde debe ser anterior o igual a Hasta.");
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00"); end.setDate(end.getDate() + 1);
  const q = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
  const product = field(form, "productId").value;
  if (product) q.set("productId", product);
  const type = field(form, "type")?.value;
  if (type) q.set("type", type);
  return q.toString();
}
async function reload() {
  const chartFrom = new Date(); chartFrom.setHours(0, 0, 0, 0); chartFrom.setDate(chartFrom.getDate() - 6);
  const chartTo = new Date(); chartTo.setHours(0, 0, 0, 0); chartTo.setDate(chartTo.getDate() + 1);
  const chartQuery = new URLSearchParams({ from: chartFrom.toISOString(), to: chartTo.toISOString(), page: "1", pageSize: "100" });
  const [products, categories, movementPage] = await Promise.all([api("products"), api("categories"), api("products/movements?" + chartQuery)]);
  state.products = products; state.categories = categories;
  state.dashboardMovements = Array.isArray(movementPage?.items) ? movementPage.items : [];
  state.ready = true;
  options($("productCategory"), categories.map(c => [c, c]), "Todas las categorías");
  const categorySelect = field($("productForm"), "category");
  const selectedCategory = categorySelect.value;
  categorySelect.innerHTML = '<option value="">Seleccionar categoría</option>' + categories.map(c => '<option>' + esc(c) + '</option>').join("");
  categorySelect.value = selectedCategory;
  const productOptions = products.map(p => [p.id, p.name + " · " + p.brand + " (" + number.format(p.quantity) + " disponibles)"]);
  for (const id of ["entryForm", "exitForm"]) refreshMovementProducts($(id));
  for (const id of ["historyFilters", "reportFilters"]) options(field($(id), "productId"), productOptions, "Todos (también movimientos de archivados)");
  render();
  state.report = null; $("reportOutput").hidden = true;
}
function render() {
  const low = state.products.filter(p => p.quantity <= 2);
  const total = state.products.length;
  const units = state.products.reduce((sum, p) => sum + p.quantity, 0);
  const empty = state.products.filter(p => p.quantity === 0).length;
  const gauge = (label, count, tone, help) => {
    const percentage = total ? Math.round(count / total * 100) : 0;
    return '<article class="stat gauge-card ' + tone + '"><span>' + label + '</span><div class="gauge"><svg viewBox="0 0 200 110" aria-hidden="true"><path class="gauge-track" d="M 12 100 A 88 88 0 0 1 188 100"/><path class="gauge-fill" pathLength="100" stroke-dasharray="' + percentage + ' 100" d="M 12 100 A 88 88 0 0 1 188 100"/></svg><strong>' + (total ? percentage + '<small>%</small>' : '—') + '</strong></div><small>' + number.format(count) + ' de ' + number.format(total) + ' productos · ' + help + '</small></article>';
  };
  $("overview").innerHTML = '<article class="stat inventory-total"><span>Unidades en inventario</span><strong>' + number.format(units) + '</strong><small>' + number.format(total) + ' productos registrados</small><div class="stock-symbol" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><a href="#nuevo" class="text-link">Cargar producto ↗</a></article>' +
    gauge('Stock disponible',total-empty,'mint','con unidades') + gauge('Por reponer',low.length,'amber','2 unidades o menos') + gauge('Sin existencias',empty,'silver','stock agotado');
  renderMovementChart();
  renderProducts();
  $("categoryList").innerHTML = state.categories.map(c => {
    const count = state.products.filter(p => p.category === c).length;
    return '<div class="category-item"><div><strong>' + esc(c) + '</strong><br><small class="muted">' + count + ' productos</small></div><button class="secondary" data-action="deleteCategory" data-name="' + esc(c) + '" ' + (count ? 'disabled title="Tiene productos asociados"' : '') + '>Eliminar categoría</button></div>';
  }).join("") || '<p class="empty-state">Crea una categoría para comenzar a cargar productos.</p>';
}
function renderMovementChart() {
  const days = [];
  const formatter = new Intl.DateTimeFormat("es-PY", { weekday: "short", day: "2-digit" });
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - offset);
    days.push({ key: dateValue(date), label: formatter.format(date).replace(".", ""), entries: 0, exits: 0 });
  }
  const byDay = new Map(days.map(day => [day.key, day]));
  for (const movement of state.dashboardMovements) {
    const day = byDay.get(dateValue(new Date(movement.timestampUtc)));
    if (!day) continue;
    if (movement.type === "Added" || movement.type === "Restocked") day.entries += movement.quantity;
    if (movement.type === "Used") day.exits += movement.quantity;
  }
  const totalEntries = days.reduce((sum, day) => sum + day.entries, 0);
  const totalExits = days.reduce((sum, day) => sum + day.exits, 0);
  const maximum = Math.max(1, ...days.flatMap(day => [day.entries, day.exits]));
  const bars = days.map(day => '<div class="movement-day"><div class="movement-bars"><i class="entry" style="height:' + (day.entries ? Math.max(6, day.entries / maximum * 100) : 0) + '%" title="' + number.format(day.entries) + ' unidades que entraron"><b>' + (day.entries ? number.format(day.entries) : '') + '</b></i><i class="exit" style="height:' + (day.exits ? Math.max(6, day.exits / maximum * 100) : 0) + '%" title="' + number.format(day.exits) + ' unidades que salieron"><b>' + (day.exits ? number.format(day.exits) : '') + '</b></i></div><span>' + esc(day.label) + '</span></div>').join("");
  $("movementChart").innerHTML = '<div class="movement-chart-head"><div><p class="eyebrow">ACTIVIDAD RECIENTE</p><h2>Movimientos de los últimos 7 días</h2></div><div class="movement-totals"><span><i class="entry-dot"></i> Entradas <strong>' + number.format(totalEntries) + '</strong></span><span><i class="exit-dot"></i> Salidas <strong>' + number.format(totalExits) + '</strong></span><a href="#historial">Ver historial ↗</a></div></div><div class="movement-plot">' + bars + '</div>' + (totalEntries || totalExits ? '' : '<p class="movement-empty">Todavía no hay entradas ni salidas en este período.</p>');
}
function renderProducts() {
  const search = $("search").value.trim().toLocaleLowerCase();
  const category = $("productCategory").value, availability = $("stockFilter").value;
  const products = state.products.filter(p => (!search || (p.name + " " + p.brand).toLocaleLowerCase().includes(search)) &&
    (!category || p.category === category) && (!availability || (availability === "empty" ? p.quantity === 0 : p.quantity <= 2)));
  const pages = Math.max(1, Math.ceil(products.length / productPageSize));
  state.productPage = Math.min(state.productPage, pages);
  const start = (state.productPage - 1) * productPageSize;
  $("productRows").innerHTML = products.slice(start, start + productPageSize).map(p => '<tr class="' + (p.quantity === 0 ? 'stock-empty-row' : p.quantity <= 2 ? 'stock-low-row' : 'stock-normal-row') + '"><td><strong>' + esc(p.name) + '</strong></td><td>' + esc(p.brand) + '</td><td>' + esc(p.category) +
    '</td><td class="product-price">Gs. ' + productPrice.format(p.price) + '</td><td><span class="badge stock-status ' + (p.quantity === 0 ? "empty" : p.quantity <= 2 ? "low" : "normal") + '"><i></i>' + (p.quantity === 0 ? 'Sin stock' : p.quantity <= 2 ? 'Bajo' : 'Normal') + '<strong>' + number.format(p.quantity) + ' ' + (p.quantity === 1 ? 'unidad' : 'unidades') + '</strong></span></td><td><div class="actions">' +
    '<button class="secondary" data-action="edit" data-id="' + p.id + '">Editar</button><button class="secondary" data-action="entry" data-id="' + p.id + '">Entrada</button><button class="secondary" data-action="exit" data-id="' + p.id + '" ' + (p.quantity ? "" : "disabled") + '>Salida</button>' +
    '</div></td></tr>').join("") || '<tr><td colspan="6" class="empty-state">No hay productos que coincidan. Puedes cargar uno nuevo arriba.</td></tr>';
  $("productCount").textContent = products.length ? number.format(start + 1) + "–" + number.format(Math.min(start + productPageSize, products.length)) + " de " + number.format(products.length) + " productos" : "0 productos";
  $("productPrevious").disabled = state.productPage === 1;
  $("productNext").disabled = state.productPage === pages;
  $("productPages").textContent = "Página " + number.format(state.productPage) + " de " + number.format(pages);
}
function route() {
  let section = location.hash.slice(1) || "resumen";
  if (!titles[section]) section = "resumen";
  document.querySelectorAll(".page").forEach(p => p.hidden = p.id !== section);
  document.querySelectorAll("nav a").forEach(a => {
    const active = a.hash === "#" + (section === "nuevo" ? "productos" : section);
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $("pageTitle").textContent = section === "nuevo" && field($("productForm"), "id").value ? "Editar producto" : titles[section];
  if (state.ready && section === "historial") {
    try {
      state.page = 1; state.historyQuery = queryFrom($("historyFilters")); loadHistory().catch(showError);
    } catch (error) { showError(error); }
  }
}
function showError(error) { message(error.message || "No se pudo completar la operación.", true); }
function resetProduct() {
  $("productForm").reset(); field($("productForm"), "id").value = "";
  field($("productForm"), "quantity").disabled = false;
  $("editHint").hidden = true; $("productFormTitle").textContent = "Cargar producto";
  $("productManage").hidden = true;
  $("productManageActions").replaceChildren();
}
function renderProductManage(p) {
  $("productManage").hidden = !p;
  if (!p) return;
  const action = p.canVoid ? "void" : p.canDelete ? "delete" : p.quantity === 0 ? "archive" : null;
  const labels = { void: "Anular carga", delete: "Eliminar definitivamente", archive: "Archivar producto" };
  $("productManageHelp").textContent = p.canVoid ? "Si lo cargaste por error, puedes anular su carga inicial. No necesitas guardar cambios antes de anular." : p.canDelete ? "Este producto no tiene unidades ni movimientos. Puedes eliminarlo definitivamente." : p.quantity === 0 ? "Puedes retirarlo de la lista activa conservando su historial." : "Para archivar este producto, primero debe quedar sin unidades. Su historial se conserva.";
  $("productManageActions").innerHTML = action ? '<button type="button" class="danger" data-action="' + action + '" data-id="' + p.id + '">' + labels[action] + '</button>' : "";
}
document.querySelectorAll('a[href="#nuevo"]').forEach(a => a.addEventListener("click", resetProduct));
function preview(form) {
  const p = state.products.find(p => p.id === field(form, "productId").value);
  const input = field(form, "quantity"), quantity = InventoryNumbers.read(input) || 0, outgoing = form.id === "exitForm";
  input.dataset.max = p ? String(outgoing ? p.quantity : 2147483647 - p.quantity) : "2147483647";
  InventoryNumbers.validate(input);
  form.querySelector(".stock-preview").textContent = p ?
    "Disponible ahora: " + number.format(p.quantity) + " unidades" + (quantity > 0 ? ". Después del movimiento: " + number.format(p.quantity + (outgoing ? -quantity : quantity)) + "." : ".") :
    "Selecciona un producto para ver su cantidad disponible.";
}
async function saving(form, action) {
  if (state.busy) return;
  state.busy = true;
  const button = form.querySelector('button[type="submit"]') || form.querySelector("button");
  if (button) button.disabled = true;
  try { await action(); } catch (error) { showError(error); }
  finally { state.busy = false; if (button) button.disabled = false; }
}
async function afterSave(text) {
  try { await reload(); message(text); }
  catch { message(text + " No pudimos actualizar la pantalla. Pulsa Actualizar datos; no repitas la operación.", true); }
}
$("productForm").addEventListener("submit", e => {
  e.preventDefault();
  saving(e.currentTarget, async () => {
    const f = $("productForm"), id = field(f, "id").value;
    const body = { name: field(f, "name").value.trim(), brand: field(f, "brand").value.trim(), category: field(f, "category").value,
      price: InventoryNumbers.read(field(f, "price")), quantity: InventoryNumbers.read(field(f, "quantity")) };
    if (!body.name || !body.brand) throw new Error("Completa el nombre y la marca.");
    await api(id ? "products/" + id : "products", post(body, id ? "PUT" : "POST"));
    resetProduct(); location.hash = "productos";
    await afterSave(id ? "Datos del producto actualizados." : "Producto cargado y cantidad inicial registrada.");
  });
});
for (const id of ["entryForm", "exitForm"]) {
  const form = $(id);
  form.querySelector(".movement-product-search").addEventListener("input", () => refreshMovementProducts(form));
  form.addEventListener("input", () => preview(form));
  field(form, "productId").addEventListener("change", () => preview(form));
  form.addEventListener("submit", e => {
    e.preventDefault();
    saving(form, async () => {
      const productId = field(form, "productId").value, outgoing = id === "exitForm";
      const quantity = InventoryNumbers.read(field(form, "quantity"));
      if (!Number.isInteger(quantity) || quantity < 1) throw new Error("La cantidad debe ser un entero mayor que cero.");
      await api("products/" + productId + (outgoing ? "/use" : "/restock"), post({ quantity, reason: field(form, "reason").value.trim() }));
      field(form, "quantity").value = ""; field(form, "reason").value = "";
      await afterSave((outgoing ? "Salida" : "Entrada") + " registrada: " + number.format(quantity) + " unidades. Puedes verla en el historial.");
    });
  });
}
$("categoryForm").addEventListener("submit", e => {
  e.preventDefault();
  saving(e.currentTarget, async () => {
    const name = field($("categoryForm"), "name").value.trim();
    if (!name) throw new Error("Escribe el nombre de la categoría.");
    await api("categories", post({ name }));
    $("categoryForm").reset(); await afterSave("Categoría creada.");
  });
});
document.addEventListener("click", async e => {
  const button = e.target.closest("[data-action]");
  if (!button || state.busy) return;
  const action = button.dataset.action, p = state.products.find(p => p.id === button.dataset.id);
  try {
    if (action === "edit" && p) {
      const form = $("productForm");
      for (const key of ["id", "name", "brand", "category", "price", "quantity"]) field(form, key).value = p[key];
      for (const key of ["price", "quantity"]) InventoryNumbers.set(field(form, key), p[key]);
      field(form, "quantity").disabled = true; $("editHint").hidden = false;
      renderProductManage(p);
      $("productFormTitle").textContent = "Editar producto"; location.hash = "nuevo"; route();
    } else if ((action === "entry" || action === "exit") && p) {
      const form = $(action === "entry" ? "entryForm" : "exitForm");
      form.querySelector(".movement-product-search").value = "";
      refreshMovementProducts(form);
      field(form, "productId").value = p.id; preview(form); location.hash = action === "entry" ? "entrada" : "salida";
    } else if ((action === "archive" || action === "delete" || action === "void") && p) {
      const deleting = action === "delete";
      $("confirmDialog").querySelector("h2").textContent = deleting ? "Eliminar definitivamente" : "Archivar producto";
      $("confirmDialog").querySelector(".muted").textContent = deleting ? "Este producto no tiene unidades ni movimientos. Se borrará definitivamente y no se podrá recuperar." : "El historial se conserva. Solo puedes archivar productos sin unidades.";
      $("confirmDialog").querySelector('[value="confirm"]').textContent = deleting ? "Eliminar definitivamente" : "Archivar";
      $("confirmDialog").dataset.operation = action;
      $("voidReasonLabel").hidden = action !== "void";
      $("voidReason").required = action === "void";
      $("voidReason").value = "";
      if (action === "void") {
        $("confirmDialog").querySelector("h2").textContent = "Anular carga por error";
        $("confirmDialog").querySelector(".muted").textContent = "Se retirarán las " + number.format(p.quantity) + " unidades y el producto dejará de aparecer en el inventario activo. La carga y su anulación se conservarán en el historial. No se contará como una salida normal.";
        $("confirmDialog").querySelector('[value="confirm"]').textContent = "Anular carga";
      }
      $("confirmText").textContent = (deleting ? '¿Eliminar "' : '¿Archivar "') + p.name + '"?';
      if (action === "void") $("confirmText").textContent = '¿Anular la carga de "' + p.name + '"?';
      $("confirmDialog").dataset.id = p.id;
      $("confirmDialog").returnValue = "cancel";
      $("confirmDialog").showModal();
    } else if (action === "deleteCategory") {
      button.disabled = true;
      await api("categories/" + encodeURIComponent(button.dataset.name), { method: "DELETE" });
      await afterSave("Categoría eliminada.");
    }
  } catch (error) { showError(error); button.disabled = false; }
});
$("confirmDialog").addEventListener("close", async () => {
  if ($("confirmDialog").returnValue !== "confirm" || state.busy) return;
  state.busy = true;
  try {
    const deleting = $("confirmDialog").dataset.operation === "delete";
    if ($("confirmDialog").dataset.operation === "void") {
      await api("products/" + $("confirmDialog").dataset.id + "/void", post({ reason: $("voidReason").value.trim() }));
      await afterSave("Carga anulada. El producto se retiró del inventario y la corrección quedó en el historial.");
      resetProduct(); location.hash = "productos"; route();
      return;
    }
    await api("products/" + $("confirmDialog").dataset.id + (deleting ? "/permanent" : ""), { method: "DELETE" });
    await afterSave(deleting ? "Producto eliminado definitivamente." : "Producto archivado. Su historial se conserva.");
    resetProduct(); location.hash = "productos"; route();
  }
  catch (e) { showError(e); } finally { state.busy = false; }
});
let historyVersion = 0;
async function loadHistory() {
  const version = ++historyVersion;
  $("previous").disabled = $("next").disabled = true;
  const q = new URLSearchParams(state.historyQuery || queryFrom($("historyFilters")));
  q.set("page", String(state.page)); q.set("pageSize", "25");
  const result = await api("products/movements?" + q);
  if (version !== historyVersion) return;
  state.history = result;
  $("historyRows").innerHTML = result.items.map(m => '<tr><td>' + esc(new Date(m.timestampUtc).toLocaleString("es-PY")) + '</td><td>' +
    esc(m.productName) + '<small>' + esc(m.brand || "Marca no registrada") + '</small></td><td><span class="badge ' + (m.type === "Used" ? "low" : "") + '">' + esc(types[m.type] || m.type) +
    '</span></td><td>' + (m.type === "Updated" ? "—" : number.format(m.quantity)) + '</td><td>' + number.format(m.resultingStock) + '</td><td>' + esc(m.reason || "—") + '</td></tr>').join("") ||
    '<tr><td colspan="6" class="empty-state">No hay movimientos en este período.</td></tr>';
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  $("historyCount").textContent = number.format(result.total) + " movimientos · Página " + number.format(result.page) + " de " + number.format(pages);
  $("previous").disabled = result.page <= 1; $("next").disabled = result.page >= pages;
}
$("historyFilters").addEventListener("submit", e => {
  e.preventDefault(); try { state.historyQuery = queryFrom(e.currentTarget); state.page = 1; loadHistory().catch(showError); } catch (error) { showError(error); }
});
$("previous").onclick = () => { state.page--; loadHistory().catch(showError); };
$("next").onclick = () => { state.page++; loadHistory().catch(showError); };
$("reportFilters").addEventListener("submit", e => {
  e.preventDefault();
  saving(e.currentTarget, async () => {
    $("reportOutput").hidden = true; state.report = null;
    const q = queryFrom($("reportFilters"));
    const r = await api("products/reports?" + q);
    state.report = r; state.reportQuery = q;
    state.reportPeriod = field($("reportFilters"), "from").value + " al " + field($("reportFilters"), "to").value;
    $("reportPeriod").textContent = "Período: " + state.reportPeriod;
    $("reportCards").innerHTML = stat("Unidades que entraron", number.format(r.movements.entries), "Excluye cargas anuladas") +
      stat("Unidades que salieron", number.format(r.movements.exits)) + stat("Movimientos registrados", number.format(r.movements.count), "Incluye ediciones de datos") +
      stat("Valor del inventario actual", money.format(r.inventoryValue), "Según los precios registrados");
    $("reportRows").innerHTML = r.products.map(p => '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.brand) + '</td><td>' + number.format(p.quantity) +
      (p.quantity <= 2 ? ' <span class="badge low">Reponer</span>' : "") + '</td><td>' + money.format(p.price) + '</td><td>' + money.format(p.price * p.quantity) + '</td></tr>').join("") ||
      '<tr><td colspan="5" class="empty-state">No hay productos activos para esta selección.</td></tr>';
    $("reportOutput").hidden = false;
  });
});
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
$("exportReport").onclick = () => {
  const r = state.report; if (!r) return;
  const rows = [["Reporte del inventario", state.reportPeriod], ["Unidades entrantes", r.movements.entries], ["Unidades salientes", r.movements.exits], ["Movimientos", r.movements.count],
    [], ["Inventario actual (no saldo histórico)"], ["Producto", "Marca", "Cantidad", "Precio", "Valor"]];
  r.products.forEach(p => rows.push([p.name, p.brand, p.quantity, p.price, (p.price * p.quantity).toFixed(2)]));
  const blob = new Blob(["\ufeff" + rows.map(row => row.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "reporte-inventario.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("printReport").onclick = () => window.print();
$("refresh").onclick = async () => {
  $("refresh").disabled = true;
  try { await reload(); route(); message("Inventario actualizado."); } catch (e) { showError(e); }
  finally { $("refresh").disabled = false; }
};
for (const id of ["search", "productCategory", "stockFilter"]) $(id).addEventListener("input", () => { state.productPage = 1; renderProducts(); });
$("productPrevious").addEventListener("click", () => { state.productPage--; renderProducts(); });
$("productNext").addEventListener("click", () => { state.productPage++; renderProducts(); });
const today = new Date(), monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
for (const id of ["historyFilters", "reportFilters"]) {
  field($(id), "from").value = dateValue(monthStart);
  field($(id), "to").value = dateValue(today);
}
window.addEventListener("hashchange", route);
route();
$("logout").onclick = async () => {
  $("logout").disabled = true;
  try { await api("auth/logout", post({})); location.replace("/login.html"); }
  catch (error) { showError(error); $("logout").disabled = false; }
};
async function startSession() {
  const user = await api("auth/me");
  $("signedInUser").textContent = user.username;
  csrfToken = (await api("auth/csrf")).token;
  await reload(); route();
}
window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
startSession().catch(showError);
