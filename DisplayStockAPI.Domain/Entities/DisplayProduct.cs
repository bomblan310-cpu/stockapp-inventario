namespace DisplayStockAPI.Models;

public sealed class DisplayProduct
{
    public bool CanDelete { get; set; }
    public bool CanVoid { get; set; }
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Brand { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public int Quantity { get; set; }
    public string Category { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public bool IsOutOfStock => Quantity == 0;
    public bool IsLowStock => Quantity is 1 or 2;
}
