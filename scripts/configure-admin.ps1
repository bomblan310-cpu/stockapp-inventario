param([switch]$ForRender)
$ErrorActionPreference = 'Stop'
$adminName = Read-Host 'Usuario administrador'
if ([string]::IsNullOrWhiteSpace($adminName) -or $adminName.Length -gt 80) { throw 'Usuario requerido (máximo 80 caracteres).' }
$secret = Read-Host 'Contraseña nueva (mínimo 12 caracteres)' -AsSecureString
$confirm = Read-Host 'Repite la contraseña' -AsSecureString
$plain = [System.Net.NetworkCredential]::new('', $secret).Password
$confirmation = [System.Net.NetworkCredential]::new('', $confirm).Password
if ($plain.Length -lt 12 -or $plain.Length -gt 256 -or $plain -cne $confirmation) { throw 'Usa entre 12 y 256 caracteres y confirma la misma contraseña.' }
$salt = New-Object byte[] 16
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($salt)
$derive = [System.Security.Cryptography.Rfc2898DeriveBytes]::new($plain, $salt, 600000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
$encoded = [Convert]::ToBase64String($salt) + '.' + [Convert]::ToBase64String($derive.GetBytes(32))
$derive.Dispose(); $rng.Dispose(); $plain = $null; $confirmation = $null
if ($ForRender) {
  Write-Host 'Configura estas variables privadas en Render (no las publiques):'
  Write-Host "Auth__Username=$adminName"
  Write-Host "Auth__PasswordHash=$encoded"
} else {
  @{ 'Auth:Username' = $adminName; 'Auth:PasswordHash' = $encoded } | ConvertTo-Json -Compress | dotnet user-secrets set --project "$PSScriptRoot/../DisplayStockAPI.csproj"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo guardar la configuración.' }
  Write-Host 'Administrador configurado. Reinicia la aplicación para aplicar el cambio.'
}
