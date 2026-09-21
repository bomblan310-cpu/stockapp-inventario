using Dapper;
using Npgsql;
using Microsoft.Extensions.Configuration;
using DisplayStockAPI.Infrastructure;
using DisplayStockAPI.Models;
using DisplayStockAPI.Application;

var config = new ConfigurationBuilder().AddUserSecrets("DisplayStockAPI-local").Build();
using var source = DatabaseSetup.CreateSource(config.GetConnectionString("DisplayStock") ?? config["DATABASE_URL"] ?? "");
var testConnectionString = config.GetConnectionString("DisplayStock")!;
using var connection = source.OpenConnection();
var schema = "delete_check_" + Guid.NewGuid().ToString("N");
connection.Execute($"CREATE SCHEMA {schema}");
try
{
    var builder = new NpgsqlConnectionStringBuilder(testConnectionString) { SearchPath = schema };
    using var isolated = NpgsqlDataSource.Create(builder.ConnectionString);
    DatabaseSetup.Initialize(isolated, Path.Combine(Directory.GetCurrentDirectory(), "Database"));
    var repo = new PostgresInventoryRepository(isolated);
    DisplayProduct Make(int quantity) => repo.Create(new DisplayProductRequest { Name="Prueba aislada", Brand="Test", Category="Monitores", Price=10, Quantity=quantity });
    void Check(bool condition, string name) { if (!condition) throw new Exception(name); }
    var blank = Make(0);
    var initial = Make(5);
    Check(repo.Get(initial.Id)!.CanVoid, "Carga inicial anulable");
    var service = new InventoryService(repo);
    try { service.VoidLoad(initial.Id,"  "); throw new Exception("Aceptó motivo vacío"); }
    catch (InventoryException) { }
    Check(service.VoidLoad(initial.Id,"Carga por error"), "Anulación");
    Check(repo.Get(initial.Id) is null && !repo.VoidLoad(initial.Id,"Reintento"), "Retirado y no duplicable");
    var audit = repo.GetMovements(new MovementQuery { ProductId=initial.Id });
    Check(audit.Total==2 && audit.Items.Any(m=>m.Type=="Voided" && m.Quantity==5 && m.ResultingStock==0 && m.Reason=="Carga por error"),"Auditoría conservada");
    var totals = repo.GetTotals(new MovementQuery { ProductId=initial.Id });
    Check(totals.Entries==0 && totals.Exits==0,"Anulación no infla reportes");
    var moved = Make(5); repo.Move(moved.Id,1,true,"Salida");
    Check(!repo.VoidLoad(moved.Id,"Error"),"No anular con salidas");
    var received = Make(5); repo.Move(received.Id,1,false,"Entrada");
    Check(!repo.VoidLoad(received.Id,"Error"),"No anular con entradas");
    var amended = Make(5); repo.Update(amended.Id,new DisplayProductRequest {Name="Editado",Brand="Test",Category="Monitores",Price=1,Quantity=5});
    Check(!repo.VoidLoad(amended.Id,"Error"),"No anular con ediciones");
    var competing = Make(5);
    var voidTask = Task.Run(()=>repo.VoidLoad(competing.Id,"Error concurrente"));
    var entryTask = Task.Run(()=>repo.Move(competing.Id,1,false,"Entrada concurrente"));
    await Task.WhenAll(voidTask,entryTask);
    Check(voidTask.Result != entryTask.Result,"Anulación y movimiento no triunfan juntos");
    Console.WriteLine("PASS: anulación de 5 unidades, motivo, historial, reportes y concurrencia.");
    Check(repo.Get(blank.Id)!.CanDelete, "Producto sin movimientos eliminable");
    Check(repo.Delete(blank.Id) && repo.Get(blank.Id) is null, "Eliminación definitiva");
    Check(!repo.Delete(blank.Id), "ID inexistente rechazado");
    var stocked = Make(2);
    Check(!repo.Delete(stocked.Id), "Stock protegido");
    repo.Move(stocked.Id,2,true,"Salida de prueba");
    Check(!repo.Get(stocked.Id)!.CanDelete && !repo.Delete(stocked.Id), "Historial protegido aun con cero stock");
    Check(repo.Archive(stocked.Id), "Archivo permitido");
    Check(repo.GetMovements(new MovementQuery { ProductId=stocked.Id }).Total==2,"Historial conservado");
    var edited = Make(0);
    repo.Update(edited.Id,new DisplayProductRequest { Name="Editado", Brand="Test",Category="Monitores",Price=1,Quantity=0 });
    Check(!repo.Delete(edited.Id),"Ediciones cuentan como historial");
    var racing = Make(0);
    var deleteTask = Task.Run(()=>repo.Delete(racing.Id));
    var moveTask = Task.Run(()=>repo.Move(racing.Id,1,false,"Prueba concurrente"));
    await Task.WhenAll(deleteTask,moveTask);
    Check(deleteTask.Result != moveTask.Result,"Movimiento y eliminación no pueden triunfar juntos");
    Console.WriteLine("PASS: eliminación, stock, historial, archivo y concurrencia. Datos reales intactos.");
}
finally
{
    // Exact generated test schema only; never the user's public schema.
    connection.Execute($"DROP SCHEMA {schema} CASCADE");
}
