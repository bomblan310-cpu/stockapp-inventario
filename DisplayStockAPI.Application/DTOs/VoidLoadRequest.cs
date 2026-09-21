using System.ComponentModel.DataAnnotations;
namespace DisplayStockAPI.Models;
public sealed class VoidLoadRequest
{
    [Required, StringLength(300)]
    public string Reason { get; set; } = "";
}
