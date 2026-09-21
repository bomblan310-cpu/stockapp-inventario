"use strict";
// Spanish/Paraguayan display: 1.250.000,50. API values remain numbers.
window.InventoryNumbers = (() => {
  function read(input) {
    const text = input.value.trim();
    const pattern = input.dataset.number === "decimal"
      ? /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/
      : /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/;
    return pattern.test(text) ? Number(text.replace(/\./g, "").replace(",", ".")) : NaN;
  }
  function validate(input) {
    const value = read(input);
    let error = "";
    if (input.value !== "" && !Number.isFinite(value))
      error = input.dataset.number === "decimal" ? "Usa puntos para miles y coma para decimales. Ejemplo: 125.000,50." : "Escribe una cantidad entera. Ejemplo: 1.500.";
    else if (Number.isFinite(value) && (value < Number(input.dataset.min) || value > Number(input.dataset.max)))
      error = "Ingresa un valor entre " + Number(input.dataset.min).toLocaleString("es-PY") + " y " + Number(input.dataset.max).toLocaleString("es-PY") + ".";
    input.setCustomValidity(error);
    return !error;
  }
  function format(input) {
    const text = input.value;
    // Leave invalid values visible so validation can explain them.
    if (!/^[\d.]+(?:,\d{0,2})?$/.test(text) || (input.dataset.number !== "decimal" && text.includes(","))) {
      validate(input); return;
    }
    const caret = input.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/\./g, "").length;
    const parts = text.replace(/\./g, "").split(",");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    input.value = parts.join(",");
    let position = 0, count = 0;
    while (position < input.value.length && count < before) {
      if (input.value[position] !== ".") count++;
      position++;
    }
    input.setSelectionRange(position, position);
    validate(input);
  }
  function set(input, value) {
    const decimals = input.dataset.number === "decimal" ? 2 : 0;
    input.value = new Intl.NumberFormat("es-PY", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
    validate(input);
  }
  document.querySelectorAll("[data-number]").forEach(input => {
    input.addEventListener("input", () => format(input));
    input.addEventListener("blur", () => {
      if (input.dataset.number === "decimal" && input.value.endsWith(",")) input.value = input.value.slice(0, -1);
      validate(input);
    });
    // Reject ambiguous pasted values instead of changing their numeric meaning.
    input.addEventListener("paste", event => {
      const text = event.clipboardData.getData("text").trim();
      if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) {
        event.preventDefault();
        input.setCustomValidity("Usa el formato 1.000,50 para precios o 1.000 para cantidades.");
        input.reportValidity();
      }
    });
    input.form?.addEventListener("reset", () => input.setCustomValidity(""));
  });
  return { read, set, validate };
})();
