using DisplayStockAPI.Application;
using DisplayStockAPI.Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Antiforgery;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
if (int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var port))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("CSRF", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey,
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Name = "X-CSRF-TOKEN",
        Description = "Inicia sesión en /login.html, ejecuta GET /api/auth/csrf y pega aquí el token para operaciones de escritura."
    });
    options.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        [new Microsoft.OpenApi.Models.OpenApiSecurityScheme { Reference = new Microsoft.OpenApi.Models.OpenApiReference
            { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "CSRF" } }] = Array.Empty<string>()
    });
});
builder.Services.AddSingleton<IAdministratorCredentials>(new AdministratorCredentials(
    builder.Configuration["Auth:Username"] ?? "", builder.Configuration["Auth:PasswordHash"] ?? ""));
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = "StockApp.Session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = false;
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
    options.Events.OnValidatePrincipal = context =>
    {
        if (context.Principal?.FindFirst("credential-version")?.Value !=
            context.HttpContext.RequestServices.GetRequiredService<IAdministratorCredentials>().Version)
            context.RejectPrincipal();
        return Task.CompletedTask;
    };
});
builder.Services.AddAuthorization(options => options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter("administrator", _ =>
        new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var connection = builder.Configuration.GetConnectionString("DisplayStock");
if (string.IsNullOrWhiteSpace(connection)) connection = builder.Configuration["DATABASE_URL"];
builder.Services.AddSingleton(_ => DatabaseSetup.CreateSource(connection ?? ""));
builder.Services.AddScoped<IInventoryRepository, PostgresInventoryRepository>();
builder.Services.AddScoped<InventoryService>();
var app = builder.Build();
if (builder.Configuration.GetValue<bool>("Database:Initialize"))
    DatabaseSetup.Initialize(app.Services.GetRequiredService<Npgsql.NpgsqlDataSource>(), Path.Combine(app.Environment.ContentRootPath, "Database"));
app.Use(async (context, next) =>
{
    try { await next(); }
    catch (InventoryException e)
    {
        context.Response.StatusCode = 400;
        await context.Response.WriteAsJsonAsync(new { message = e.Message });
    }
    catch (Exception e)
    {
        app.Logger.LogError(e, "Error al procesar la solicitud.");
        context.Response.StatusCode = 500;
        await context.Response.WriteAsJsonAsync(new { message = "No se pudo completar la operación. Actualiza los datos antes de volver a intentarlo." });
    }
});
app.UseRouting();
app.UseAuthentication();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "same-origin";
    context.Response.Headers.CacheControl = "no-store";
    var path = context.Request.Path;
    if ((path == "/" || path == "/index.html" || path.StartsWithSegments("/swagger")) && context.User.Identity?.IsAuthenticated != true)
    {
        context.Response.Redirect("/login.html"); return;
    }
    await next();
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthorization();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api") &&
        !HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method) && !HttpMethods.IsOptions(context.Request.Method))
    {
        try { await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context); }
        catch (AntiforgeryValidationException)
        {
            context.Response.StatusCode = 400;
            await context.Response.WriteAsJsonAsync(new { message = "La sesión de seguridad cambió. Recarga la página e inténtalo de nuevo." }); return;
        }
    }
    await next();
});
app.UseSwagger();
app.UseSwaggerUI();
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
app.MapControllers();
app.Run();
