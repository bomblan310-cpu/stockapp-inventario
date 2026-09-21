using System.Security.Cryptography;
using System.Text;
using DisplayStockAPI.Application;

namespace DisplayStockAPI.Infrastructure;

// Single administrator, configured outside source control. No plaintext password is stored.
public sealed class AdministratorCredentials(string username, string passwordHash) : IAdministratorCredentials
{
    public string Version { get; } = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(username + passwordHash)));

    public bool Verify(string suppliedUsername, string password)
    {
        var parts = passwordHash.Split('.');
        if (parts.Length != 2 || string.IsNullOrWhiteSpace(username)) return false;
        try
        {
            var salt = Convert.FromBase64String(parts[0]);
            var expected = Convert.FromBase64String(parts[1]);
            if (salt.Length != 16 || expected.Length != 32) return false;
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, 600_000, HashAlgorithmName.SHA256, 32);
            return CryptographicOperations.FixedTimeEquals(actual, expected) &
                string.Equals(username, suppliedUsername, StringComparison.Ordinal);
        }
        catch (FormatException) { return false; }
    }
}
