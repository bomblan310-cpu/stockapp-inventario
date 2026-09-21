using DisplayStockAPI.Application;
using DisplayStockAPI.Models;
using Microsoft.AspNetCore.Mvc;
namespace DisplayStockAPI.Controllers;

[ApiController, Route("api/products")]
public sealed class ProductsController(InventoryService service) : ControllerBase
{
    [HttpGet]
    public IActionResult All([FromQuery] string? category, [FromQuery] bool alertsOnly = false)
        => Ok(service.Products().Where(p => (category == null || p.Category == category) && (!alertsOnly || p.Quantity <= 2)));
    [HttpGet("{id:guid}")]
    public IActionResult Get(Guid id) => service.Get(id) is { } p ? Ok(p) : NotFound();
    [HttpPost]
    public IActionResult Create(DisplayProductRequest request)
    {
        var p = service.Create(request);
        return CreatedAtAction(nameof(Get), new { id = p.Id }, p);
    }
    [HttpPut("{id:guid}")]
    public IActionResult Update(Guid id, DisplayProductRequest request)
        => service.Update(id, request) is { } p ? Ok(p) : NotFound();
    [HttpDelete("{id:guid}")]
    public IActionResult Archive(Guid id) => service.Archive(id) ? NoContent() : Conflict("Solo puedes archivar un producto existente sin unidades disponibles.");
    [HttpDelete("{id:guid}/permanent")]
    public IActionResult Delete(Guid id) => service.Delete(id) ? NoContent() : Conflict("Solo puedes eliminar un producto activo con cero unidades y sin movimientos. Si tiene historial, debes archivarlo cuando su stock sea cero.");
    [HttpPost("{id:guid}/void")]
    public IActionResult Void(Guid id, VoidLoadRequest request) => service.VoidLoad(id, request.Reason)
        ? NoContent() : Conflict("Solo puedes anular un producto activo que conserve únicamente su carga inicial. Actualiza el inventario.");
    [HttpPost("{id:guid}/use")]
    public IActionResult Use(Guid id, StockAdjustmentRequest request)
        => service.Move(id, request, true) ? NoContent() : Conflict("No hay suficiente stock o el producto ya no está disponible.");
    [HttpPost("{id:guid}/restock")]
    public IActionResult Restock(Guid id, StockAdjustmentRequest request)
        => service.Move(id, request, false) ? NoContent() : Conflict("La cantidad supera el límite o el producto ya no está disponible.");
    [HttpGet("movements")]
    public IActionResult History([FromQuery] MovementQuery query) => Ok(service.History(query));
    [HttpGet("reports")]
    public IActionResult Report([FromQuery] MovementQuery query) => Ok(service.Report(query));
}
