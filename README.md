# StockApp

Inventario con PostgreSQL, ASP.NET Core y Swagger. Interfaz en español, sin dependencias de CDN.

## Uso

- **Productos → Cargar producto**: nombre, marca, categoría, precio y cantidad inicial. La cantidad inicial genera un movimiento.
- **Productos → Editar**: cambia los datos y precio; conserva la cantidad actual.
- **Registrar entrada / Registrar salida**: selecciona producto, cantidad entera y motivo opcional. Guarda cantidad e historial en una transacción. No permite salidas superiores al stock.
- **Historial**: filtra por fechas, producto y tipo. Muestra fecha local, marca, motivo y stock resultante. Paginación de 25 filas.
- **Reportes**: suma unidades de todo el período consultado, incluyendo cargas iniciales como entradas. CSV compatible con Excel e impresión/Guardar como PDF desde el navegador.
- El reporte muestra también el inventario **actual**, separado de los movimientos históricos. Su valor es cantidad por precio registrado; no es ganancia ni costo contable.
- **Categorías**: crea categorías y elimina las que no tienen productos activos.
- **Archivar**: solo con stock cero. Conserva todos los movimientos. Los movimientos de archivados siguen incluidos en historial y reportes de todos los productos.
- Reposición: umbral fijo de 2 unidades.

## Arquitectura

El proyecto raíz **DisplayStockAPI.csproj** es la API y el punto de composición.

    API (Controllers, Program, wwwroot)
      → Application (InventoryService, DTOs, IInventoryRepository)
        → Domain (DisplayProduct, StockMovement)
      → Infrastructure (implementación PostgreSQL y migraciones)
        → Application / Domain

Los controladores dependen del servicio de aplicación. Dapper y Npgsql están en Infrastructure. Domain no depende de infraestructura.

## Ejecutar localmente

Requiere SDK .NET 9 y PostgreSQL. Crear una base vacía si es una instalación nueva.
La conexión local se guarda fuera del repositorio con User Secrets:

    dotnet user-secrets set "ConnectionStrings:DisplayStock" "Host=localhost;Database=displaystock;Username=postgres;Password=TU_CLAVE" --project DisplayStockAPI.csproj
    dotnet run --project DisplayStockAPI.csproj --urls http://localhost:5080

Interfaz: http://localhost:5080
Swagger: http://localhost:5080/swagger

El inventario y Swagger requieren iniciar sesión. No existe registro público. Configurar el administrador local con:

    powershell -ExecutionPolicy Bypass -File scripts/configure-admin.ps1

En Development las migraciones se aplican al inicio. No insertan productos de demostración.
Las migraciones agregan columnas sin borrar registros; schema_migrations registra las ya ejecutadas.
Las credenciales locales no se publican.

## Render

Dockerfile y render.yaml incluyen API y PostgreSQL. Se soportan conexiones Npgsql y URL postgresql://.
El puerto se toma de PORT. Database__Initialize=true aplica migraciones al iniciar.

1. Subir el repositorio sin credenciales.
2. Crear un Blueprint desde render.yaml.
3. En la creación inicial, completar `Auth__Username` y `Auth__PasswordHash`. El hash se genera con `scripts/configure-admin.ps1 -ForRender`.
4. Revisar los planes elegidos en Render antes de aceptar su creación.
5. Verificar `/health`, el login, Swagger y el flujo de productos en la URL generada.

El archivo configura planes gratuitos para demostración. La base gratuita de Render caduca a los 30 días; no usarla como almacenamiento permanente del cliente:
https://render.com/docs/free

La aplicación usa una sesión segura de administrador, protección CSRF y límite de intentos. Docker Desktop estaba detenido durante la verificación local: se verificó `dotnet publish`, pero no se ejecutó la imagen Docker.

## Verificación

    dotnet build DisplayStockAPI.sln
    dotnet publish DisplayStockAPI.csproj -c Release
    npm install
    npx playwright install chromium

Ejecutar las pruebas **contra una base de pruebas separada**, nunca contra datos reales.
Iniciar una segunda instancia en http://localhost:5081 con ConnectionStrings__DisplayStock apuntando a esa base y Database__Initialize=true.

    npm run test:inventory

La prueba crea y archiva sus propios productos en esa instancia. Comprueba formularios reales en Chromium, movimientos, motivos, CSV, rechazos de stock insuficiente, dos salidas concurrentes, edición sin sobrescribir stock, totales fuera de la página visible, archivado con historial y escape de HTML. Las capturas se guardan en tests/artifacts (ignoradas por Git).

La prueba tests/screenshots.cjs solo consulta la instancia local 5080 y guarda capturas de escritorio/móvil.
