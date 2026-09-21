using System.ComponentModel.DataAnnotations;

namespace DisplayStockAPI.Models;

public sealed class DisplayProductRequest
{
    [Required, StringLength(120, MinimumLength = 1)]
    public string Name { get; init; } = string.Empty;

    [Required, StringLength(80, MinimumLength = 1)]
    public string Brand { get; init; } = string.Empty;

    [Range(typeof(decimal), "0", "999999999")]
    public decimal Price { get; init; }

    [Range(0, int.MaxValue)]
    public int Quantity { get; init; }

    [Required, StringLength(80, MinimumLength = 1)]
    public string Category { get; init; } = string.Empty;
}
