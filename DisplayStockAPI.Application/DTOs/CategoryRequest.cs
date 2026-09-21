using System.ComponentModel.DataAnnotations;

namespace DisplayStockAPI.Models;

public sealed class CategoryRequest
{
    [Required, StringLength(80, MinimumLength = 1)]
    public string Name { get; init; } = string.Empty;
}
