using Dapper;
using Npgsql;
namespace DisplayStockAPI.Infrastructure;

public static class DatabaseSetup
{
    public static NpgsqlDataSource CreateSource(string connection)
    {
        if (connection.StartsWith("postgres://") || connection.StartsWith("postgresql://"))
        {
            var uri = new Uri(connection);
            var auth = uri.UserInfo.Split(':', 2);
            var b = new NpgsqlConnectionStringBuilder {
                Host = uri.Host, Port = uri.Port > 0 ? uri.Port : 5432,
                Username = Uri.UnescapeDataString(auth[0]),
                Password = auth.Length > 1 ? Uri.UnescapeDataString(auth[1]) : "",
                Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
                SslMode = SslMode.Require
            };
            connection = b.ConnectionString;
        }
        if (string.IsNullOrWhiteSpace(connection)) throw new InvalidOperationException("Configura ConnectionStrings__DisplayStock o DATABASE_URL.");
        return NpgsqlDataSource.Create(connection);
    }
    public static void Initialize(NpgsqlDataSource source, string directory)
    {
        using var c = source.OpenConnection();
        using var tx = c.BeginTransaction();
        c.Execute("SELECT pg_advisory_xact_lock(19873254)", transaction: tx);
        c.Execute("CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY)", transaction: tx);
        foreach (var path in Directory.GetFiles(directory, "*.sql").Order())
        {
            var name = Path.GetFileName(path);
            if (c.ExecuteScalar<bool>("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=@name)", new { name }, tx)) continue;
            c.Execute(File.ReadAllText(path), transaction: tx);
            c.Execute("INSERT INTO schema_migrations VALUES (@name)", new { name }, tx);
        }
        tx.Commit();
    }
}
