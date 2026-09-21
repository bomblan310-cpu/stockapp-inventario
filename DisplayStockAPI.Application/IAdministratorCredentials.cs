namespace DisplayStockAPI.Application;

public interface IAdministratorCredentials
{
    bool Verify(string username, string password);
    string Version { get; }
}
