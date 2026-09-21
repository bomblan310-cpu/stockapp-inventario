using System.ComponentModel.DataAnnotations;

namespace DisplayStockAPI.Models;

public sealed class StockAdjustmentRequest
{
    [StringLength(300)]
    public string Reason { get; init; } = "";

    [Range(1, int.MaxValue)]
    public int Quantity { get; init; }
}
