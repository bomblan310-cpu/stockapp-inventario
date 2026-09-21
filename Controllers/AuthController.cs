using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using DisplayStockAPI.Application;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace DisplayStockAPI.Controllers;

[ApiController, Route("api/auth")]
public class AuthController(IAdministratorCredentials credentials, IAntiforgery antiforgery) : ControllerBase
{
    [AllowAnonymous, HttpGet("csrf")]
    public IActionResult Csrf() => Ok(new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });

    [AllowAnonymous, HttpPost("login"), EnableRateLimiting("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        if (!credentials.Verify(request.Username, request.Password))
            return Unauthorized(new { message = "Usuario o contraseña incorrectos." });
        var identity = new ClaimsIdentity(new[] {
            new Claim(ClaimTypes.Name, request.Username), new Claim(ClaimTypes.Role, "Administrator"),
            new Claim("credential-version", credentials.Version)
        }, CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity), new AuthenticationProperties { IsPersistent = false });
        return Ok(new { username = request.Username });
    }

    [HttpGet("me")]
    public IActionResult Me() => Ok(new { username = User.Identity!.Name });

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }
}

public sealed record LoginRequest(
    [Required, StringLength(80)] string Username,
    [Required, StringLength(256)] string Password);
