"use strict";
const form = document.getElementById("loginForm");
document.getElementById("showPassword").onchange = event => {
  form.elements.password.type = event.target.checked ? "text" : "password";
};
form.onsubmit = async event => {
  event.preventDefault();
  const error = document.getElementById("loginError"), button = form.querySelector("button");
  error.hidden = true; button.disabled = true; button.textContent = "Verificando…";
  try {
    const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
    if (!csrfResponse.ok) throw new Error("No se pudo iniciar el acceso. Inténtalo de nuevo.");
    const { token } = await csrfResponse.json();
    const response = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": token },
      body: JSON.stringify({ username: form.elements.username.value.trim(), password: form.elements.password.value })
    });
    if (response.status === 429) throw new Error("Demasiados intentos. Espera un minuto antes de volver a ingresar.");
    if (!response.ok) throw new Error(response.status === 401 ? "Usuario o contraseña incorrectos." : "No se pudo ingresar. Recarga la página e inténtalo de nuevo.");
    location.replace("/");
  } catch (e) { error.textContent = e.message || "No se pudo conectar al servidor."; error.hidden = false; }
  finally { button.disabled = false; button.textContent = "Ingresar al inventario →"; }
};
