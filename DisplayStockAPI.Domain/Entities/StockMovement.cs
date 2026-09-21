namespace DisplayStockAPI.Models;

public sealed class StockMovement
{
    public long Id { get; init; }
    public string Brand { get; init; } = "";
    public string Reason { get; init; } = "";
    public required Guid ProductId { get; init; }
    public required string ProductName { get; init; }
    public required string Type { get; init; } // "Added", "Used", "Restocked"
    public required int Quantity { get; init; }
    public required int ResultingStock { get; init; }
    public required DateTime TimestampUtc { get; init; }
}
