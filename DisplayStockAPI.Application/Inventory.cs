using DisplayStockAPI.Models;

namespace DisplayStockAPI.Application;

public sealed class InventoryException(string message) : Exception(message);

public sealed class MovementQuery
{
    public DateTimeOffset? From { get; set; }
    public DateTimeOffset? To { get; set; }
    public Guid? ProductId { get; set; }
    public string? Type { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
}
public sealed record MovementPage(IReadOnlyList<StockMovement> Items, long Total, int Page, int PageSize);
public sealed class MovementTotals
{
    public long Entries { get; set; }
    public long Exits { get; set; }
    public long Count { get; set; }
}
public sealed record InventoryReport(MovementTotals Movements, long AvailableUnits, decimal InventoryValue,
    IReadOnlyList<DisplayProduct> Products, IReadOnlyList<DisplayProduct> LowStock);

public interface IInventoryRepository
{
    IReadOnlyList<DisplayProduct> GetProducts();
    DisplayProduct? Get(Guid id);
    DisplayProduct Create(DisplayProductRequest request);
    DisplayProduct? Update(Guid id, DisplayProductRequest request);
    bool Archive(Guid id);
    bool Delete(Guid id);
    bool VoidLoad(Guid id, string reason);
    bool Move(Guid id, int quantity, bool outgoing, string reason);
    MovementPage GetMovements(MovementQuery query);
    MovementTotals GetTotals(MovementQuery query);
    IReadOnlyList<string> GetCategories();
    bool AddCategory(string name);
    bool DeleteCategory(string name);
}

public sealed class InventoryService(IInventoryRepository repository)
{
    public IReadOnlyList<DisplayProduct> Products() => repository.GetProducts();
    public DisplayProduct? Get(Guid id) => repository.Get(id);
    public DisplayProduct Create(DisplayProductRequest request) { Validate(request); return repository.Create(request); }
    public DisplayProduct? Update(Guid id, DisplayProductRequest request) { Validate(request); return repository.Update(id, request); }
    public bool Archive(Guid id) => repository.Archive(id);
    public bool Delete(Guid id) => repository.Delete(id);
    public bool VoidLoad(Guid id, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length > 300)
            throw new InventoryException("Indica el motivo de la anulación (hasta 300 caracteres).");
        return repository.VoidLoad(id, reason.Trim());
    }
    public bool Move(Guid id, StockAdjustmentRequest request, bool outgoing)
    {
        if (request.Quantity < 1) throw new InventoryException("La cantidad debe ser un entero mayor que cero.");
        if ((request.Reason?.Length ?? 0) > 300) throw new InventoryException("El motivo admite hasta 300 caracteres.");
        return repository.Move(id, request.Quantity, outgoing, request.Reason?.Trim() ?? "");
    }
    public MovementPage History(MovementQuery query) { Validate(query); return repository.GetMovements(query); }
    public InventoryReport Report(MovementQuery query)
    {
        Validate(query);
        var products = Products().Where(p => query.ProductId == null || p.Id == query.ProductId).ToArray();
        return new(repository.GetTotals(query), products.Sum(p => (long)p.Quantity),
            products.Sum(p => p.Price * p.Quantity), products, products.Where(p => p.Quantity <= 2).ToArray());
    }
    public IReadOnlyList<string> Categories() => repository.GetCategories();
    public bool AddCategory(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 80) throw new InventoryException("Escribe una categoría de hasta 80 caracteres.");
        return repository.AddCategory(name.Trim());
    }
    public bool DeleteCategory(string name) => repository.DeleteCategory(name);
    private static void Validate(DisplayProductRequest p)
    {
        if (string.IsNullOrWhiteSpace(p.Name) || p.Name.Trim().Length > 120 ||
            string.IsNullOrWhiteSpace(p.Brand) || p.Brand.Trim().Length > 80 ||
            string.IsNullOrWhiteSpace(p.Category) || p.Category.Trim().Length > 80)
            throw new InventoryException("Completa nombre, marca y categoría con valores válidos.");
        if (p.Price < 0 || p.Price > 999999999 || decimal.Round(p.Price, 2) != p.Price || p.Quantity < 0)
            throw new InventoryException("Revisa precio y cantidad. El precio admite dos decimales.");
    }
    private static void Validate(MovementQuery q)
    {
        if (q.From.HasValue && q.To.HasValue && q.From >= q.To) throw new InventoryException("La fecha final debe ser posterior a la inicial.");
        if (q.Type is not null && q.Type is not ("" or "Added" or "Updated" or "Used" or "Restocked" or "Voided"))
            throw new InventoryException("Tipo de movimiento inválido.");
        q.Type = string.IsNullOrEmpty(q.Type) ? null : q.Type;
        q.Page = Math.Clamp(q.Page, 1, 1000000);
        q.PageSize = Math.Clamp(q.PageSize, 1, 100);
    }
}
