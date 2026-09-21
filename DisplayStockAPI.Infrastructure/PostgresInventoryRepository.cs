using Dapper;
using Npgsql;
using DisplayStockAPI.Application;
using DisplayStockAPI.Models;

namespace DisplayStockAPI.Infrastructure;

public sealed class PostgresInventoryRepository(NpgsqlDataSource source) : IInventoryRepository
{
    private const string ProductColumns = "id::uuid AS Id, name AS Name, brand AS Brand, price AS Price, quantity AS Quantity, category AS Category, created_at_utc AS CreatedAtUtc, updated_at_utc AS UpdatedAtUtc, (quantity=0 AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.product_id=display_products.id)) AS CanDelete, ((SELECT count(*) FROM stock_movements m WHERE m.product_id=display_products.id)=1 AND EXISTS(SELECT 1 FROM stock_movements m WHERE m.product_id=display_products.id AND m.type='Added' AND m.quantity=display_products.quantity)) AS CanVoid";
    private const string MovementColumns = "id AS Id, product_id::uuid AS ProductId, product_name AS ProductName, brand AS Brand, reason AS Reason, type AS Type, quantity AS Quantity, resulting_stock AS ResultingStock, timestamp_utc AS TimestampUtc";
    private const string Filter = " WHERE (CAST(@From AS timestamptz) IS NULL OR timestamp_utc >= @From) AND (CAST(@To AS timestamptz) IS NULL OR timestamp_utc < @To) AND (CAST(@ProductId AS text) IS NULL OR product_id = @ProductId) AND (CAST(@Type AS text) IS NULL OR type = @Type) ";
    public IReadOnlyList<DisplayProduct> GetProducts()
    {
        using var c = source.OpenConnection();
        return c.Query<DisplayProduct>($"SELECT {ProductColumns} FROM display_products WHERE NOT archived ORDER BY name").ToArray();
    }
    public DisplayProduct? Get(Guid id)
    {
        using var c = source.OpenConnection();
        return c.QuerySingleOrDefault<DisplayProduct>($"SELECT {ProductColumns} FROM display_products WHERE id = @Id AND NOT archived", new { Id = id.ToString() });
    }
    public DisplayProduct Create(DisplayProductRequest r)
    {
        using var c = source.OpenConnection();
        using var tx = c.BeginTransaction();
        EnsureCategory(c, tx, r.Category.Trim());
        var p = new DisplayProduct { Name = r.Name.Trim(), Brand = r.Brand.Trim(), Price = r.Price, Quantity = r.Quantity, Category = r.Category.Trim() };
        c.Execute("INSERT INTO display_products (id,name,brand,price,quantity,category,created_at_utc,updated_at_utc) VALUES (@Id,@Name,@Brand,@Price,@Quantity,@Category,@CreatedAtUtc,@UpdatedAtUtc)", Parameters(p), tx);
        if (p.Quantity > 0) Record(c, tx, p, "Added", p.Quantity, "Carga inicial");
        p.CanDelete = p.Quantity == 0;
        p.CanVoid = p.Quantity > 0;
        tx.Commit();
        return p;
    }
    public DisplayProduct? Update(Guid id, DisplayProductRequest r)
    {
        using var c = source.OpenConnection();
        using var tx = c.BeginTransaction();
        var p = c.QuerySingleOrDefault<DisplayProduct>($"SELECT {ProductColumns} FROM display_products WHERE id=@Id AND NOT archived FOR UPDATE", new { Id = id.ToString() }, tx);
        if (p is null) return null;
        // Editing descriptive fields must never overwrite a concurrent stock movement.
        EnsureCategory(c, tx, r.Category.Trim());
        p.Name = r.Name.Trim(); p.Brand = r.Brand.Trim(); p.Category = r.Category.Trim(); p.Price = r.Price; p.UpdatedAtUtc = DateTime.UtcNow;
        c.Execute("UPDATE display_products SET name=@Name, brand=@Brand, price=@Price, category=@Category, updated_at_utc=@UpdatedAtUtc WHERE id=@Id", Parameters(p), tx);
        Record(c, tx, p, "Updated", 0, "Edición de datos del producto");
        tx.Commit();
        return p;
    }
    public bool Archive(Guid id)
    {
        using var c = source.OpenConnection();
        return c.Execute("UPDATE display_products SET archived=true, updated_at_utc=now() WHERE id=@Id AND NOT archived AND quantity=0", new { Id = id.ToString() }) == 1;
    }
    public bool Delete(Guid id)
    {
        using var c = source.OpenConnection();
        using var tx = c.BeginTransaction();
        // All movements lock this same product row before writing history.
        var p = c.QuerySingleOrDefault<DisplayProduct>("SELECT quantity AS Quantity FROM display_products WHERE id=@Id AND NOT archived FOR UPDATE", new { Id = id.ToString() }, tx);
        if (p is null || p.Quantity != 0) return false;
        var deleted = c.Execute("DELETE FROM display_products WHERE id=@Id AND NOT EXISTS (SELECT 1 FROM stock_movements WHERE product_id=@Id)", new { Id = id.ToString() }, tx) == 1;
        tx.Commit();
        return deleted;
    }
    public bool Move(Guid id, int quantity, bool outgoing, string reason)
    {
        using var c = source.OpenConnection();
        using var tx = c.BeginTransaction();
        var p = c.QuerySingleOrDefault<DisplayProduct>($"SELECT {ProductColumns} FROM display_products WHERE id=@Id AND NOT archived FOR UPDATE", new { Id = id.ToString() }, tx);
        if (p is null || (outgoing ? p.Quantity < quantity : p.Quantity > int.MaxValue - quantity)) return false;
        p.Quantity += outgoing ? -quantity : quantity;
        p.UpdatedAtUtc = DateTime.UtcNow;
        c.Execute("UPDATE display_products SET quantity=@Quantity, updated_at_utc=@UpdatedAtUtc WHERE id=@Id", Parameters(p), tx);
        Record(c, tx, p, outgoing ? "Used" : "Restocked", quantity, reason);
        tx.Commit();
        return true;
    }
    public bool VoidLoad(Guid id, string reason)
    {
        using var c = source.OpenConnection();
        using var tx = c.BeginTransaction();
        var key = new { Id = id.ToString() };
        var p = c.QuerySingleOrDefault<DisplayProduct>($"SELECT {ProductColumns} FROM display_products WHERE id=@Id AND NOT archived FOR UPDATE", key, tx);
        if (p is null) return false;
        // Recheck history after taking the row lock, including concurrent writes.
        var history = c.Query<StockMovement>($"SELECT {MovementColumns} FROM stock_movements WHERE product_id=@Id", key, tx).ToArray();
        if (history.Length != 1 || history[0].Type != "Added" || history[0].Quantity != p.Quantity) return false;
        var quantity = p.Quantity;
        p.Quantity = 0;
        c.Execute("UPDATE display_products SET quantity=0, archived=true, updated_at_utc=now() WHERE id=@Id", key, tx);
        Record(c, tx, p, "Voided", quantity, reason);
        tx.Commit();
        return true;
    }
    public MovementPage GetMovements(MovementQuery q)
    {
        using var c = source.OpenConnection();
        // A single snapshot keeps count and page consistent.
        using var tx = c.BeginTransaction(System.Data.IsolationLevel.RepeatableRead);
        var parameters = QueryParameters(q);
        var total = c.ExecuteScalar<long>("SELECT count(*) FROM stock_movements" + Filter, parameters, tx);
        var rows = c.Query<StockMovement>($"SELECT {MovementColumns} FROM stock_movements" + Filter + "ORDER BY timestamp_utc DESC, id DESC LIMIT @PageSize OFFSET @Offset", parameters, tx).ToArray();
        tx.Commit();
        return new(rows, total, q.Page, q.PageSize);
    }
    public MovementTotals GetTotals(MovementQuery q)
    {
        using var c = source.OpenConnection();
        return c.QuerySingle<MovementTotals>("SELECT count(*) AS Count, COALESCE(sum(quantity) FILTER (WHERE type IN ('Added','Restocked') AND NOT EXISTS(SELECT 1 FROM stock_movements v WHERE v.product_id=stock_movements.product_id AND v.type='Voided')),0)::bigint AS Entries, COALESCE(sum(quantity) FILTER (WHERE type='Used'),0)::bigint AS Exits FROM stock_movements" + Filter, QueryParameters(q));
    }
    public IReadOnlyList<string> GetCategories()
    {
        using var c = source.OpenConnection();
        return c.Query<string>("SELECT name FROM display_categories ORDER BY name").ToArray();
    }
    public bool AddCategory(string name)
    {
        using var c = source.OpenConnection();
        // Serialize category writes, including checks for case-insensitive duplicates.
        using var tx = c.BeginTransaction();
        c.Execute("LOCK TABLE display_categories IN SHARE ROW EXCLUSIVE MODE", transaction: tx);
        var added = c.Execute("INSERT INTO display_categories(name) SELECT @Name WHERE NOT EXISTS(SELECT 1 FROM display_categories WHERE lower(name)=lower(@Name))", new { Name = name }, tx) == 1;
        tx.Commit();
        return added;
    }
    public bool DeleteCategory(string name)
    {
        using var c = source.OpenConnection();
        using var tx = c.BeginTransaction();
        c.Execute("LOCK TABLE display_categories IN SHARE ROW EXCLUSIVE MODE", transaction: tx);
        var deleted = c.Execute("DELETE FROM display_categories WHERE name=@Name AND NOT EXISTS(SELECT 1 FROM display_products WHERE category=@Name AND NOT archived)", new { Name = name }, tx) == 1;
        tx.Commit();
        return deleted;
    }
    private static void EnsureCategory(NpgsqlConnection c, NpgsqlTransaction tx, string name)
    {
        if (c.QuerySingleOrDefault<string>("SELECT name FROM display_categories WHERE name=@Name FOR SHARE", new { Name = name }, tx) is null)
            throw new InventoryException("La categoría no existe. Créala primero en Categorías.");
    }
    private static object Parameters(DisplayProduct p) => new { Id = p.Id.ToString(), p.Name, p.Brand, p.Price, p.Quantity, p.Category, p.CreatedAtUtc, p.UpdatedAtUtc };
    private static object QueryParameters(MovementQuery q) => new { From = q.From?.UtcDateTime, To = q.To?.UtcDateTime, ProductId = q.ProductId?.ToString(), q.Type, q.PageSize, Offset = (long)(q.Page - 1) * q.PageSize };
    private static void Record(NpgsqlConnection c, NpgsqlTransaction tx, DisplayProduct p, string type, int quantity, string reason)
        => c.Execute("INSERT INTO stock_movements (product_id,product_name,brand,type,quantity,resulting_stock,reason,timestamp_utc) VALUES (@ProductId,@Name,@Brand,@Type,@Quantity,@Stock,@Reason,@Timestamp)",
            new { ProductId = p.Id.ToString(), p.Name, p.Brand, Type = type, Quantity = quantity, Stock = p.Quantity, Reason = reason, Timestamp = DateTime.UtcNow }, tx);
}
