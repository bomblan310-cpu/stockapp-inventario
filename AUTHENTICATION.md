# Acceso de administrador

No existe registro público ni contraseña predeterminada. Si faltan las credenciales, el acceso permanece cerrado.

## Configuración local

Desde PowerShell en la carpeta del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/configure-admin.ps1
```

El asistente pide usuario y contraseña dos veces (12–256 caracteres). Guarda únicamente el hash con sal aleatoria en los secretos locales de .NET, fuera del repositorio. Reiniciar la aplicación después de configurar o cambiar las credenciales. No reutilizar la contraseña de PostgreSQL.

## Render

Ejecutar el mismo script con `-ForRender`. Configurar los valores generados en las variables privadas `Auth__Username` y `Auth__PasswordHash`, y volver a desplegar. No publicar el hash ni guardarlo en Git. El sitio debe usarse por HTTPS: en producción las cookies son Secure. El health check continúa público y no expone inventario.

La sesión dura un máximo de 8 horas, sin renovación automática, y utiliza cookies HttpOnly/SameSite Strict. Las contraseñas se verifican con PBKDF2-SHA256 (600.000 iteraciones). Cambiar las credenciales invalida las sesiones anteriores al reiniciar. Los reinicios de un contenedor sin claves de Data Protection persistentes pueden requerir iniciar sesión nuevamente. El límite global es de 10 intentos por minuto por proceso; para múltiples réplicas se necesita un limitador compartido. El cierre de sesión borra la cookie del navegador; no es un sistema de revocación centralizada de cookies robadas.

Todas las operaciones de escritura exigen un token CSRF. Swagger requiere sesión: entrar primero en `/login.html`. Consultar `/api/auth/csrf` después de entrar y usar su `token` como `X-CSRF-TOKEN` en las peticiones de escritura. No guardar tokens en localStorage.

## Verificación

```powershell
dotnet build DisplayStockAPI.csproj -o tests/auth-build
node tests/auth.cjs
```

La prueba inicia un servidor local temporal con credenciales aleatorias; comprueba el acceso y lee el inventario existente, sin modificar productos ni movimientos.

El despliegue real y los respaldos de PostgreSQL siguen requiriendo configurar y verificar la cuenta de Render; este cambio no los realiza automáticamente.
