using DisplayStockAPI.Application;
using DisplayStockAPI.Models;
using Microsoft.AspNetCore.Mvc;
namespace DisplayStockAPI.Controllers;

[ApiController, Route("api/categories")]
public sealed class CategoriesController(InventoryService service) : ControllerBase
{
    [HttpGet] public IActionResult All() => Ok(service.Categories());
    [HttpPost] public IActionResult Create(CategoryRequest request)
        => service.AddCategory(request.Name) ? StatusCode(201, new { name = request.Name.Trim() }) : Conflict("La categoría ya existe.");
    [HttpDelete("{name}")] public IActionResult Delete(string name)
        => service.DeleteCategory(name) ? NoContent() : Conflict("La categoría está en uso o ya no existe.");
}
