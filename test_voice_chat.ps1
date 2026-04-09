# Test Voice Chat Signaling and Text Chat
$baseUrl = "http://localhost:8080"
$wsUrl = "ws://localhost:8080/ws/signal"
$username = "User$(Get-Random -Minimum 1000 -Maximum 9999)"
$email = "$username@example.com"
$password = "password123"

# 1. Register
$registerPayload = @{
    username = $username
    email = $email
    password = $password
} | ConvertTo-Json

try {
    Write-Host "Registering user: $username"
    $regResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method Post -Body $registerPayload -ContentType "application/json"
    Write-Host "Registered."
} catch {
    # Ignore if already exists (400)
    Write-Host "Registration skipped/failed (might exist): $_"
}

# 2. Login
$loginPayload = @{
    username = $username
    password = $password
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body $loginPayload -ContentType "application/json"
    $token = $loginResponse.token
    $userId = $loginResponse.user.id
    Write-Host "Logged in. Token obtained."
} catch {
    Write-Host "Login failed: $_"
    exit
}

# 3. Get/Create Environment
try {
    $envPayload = @{ name = "VoiceTestEnv"; description = "Testing Voice" } | ConvertTo-Json
    $env = Invoke-RestMethod -Uri "$baseUrl/api/environments" -Method Post -Body $envPayload -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" }
    $envId = $env.id
} catch {
    Write-Host "Error creating environment: $_"
    exit
}

Write-Host "Using Environment ID: $envId"

# 4. Connect to WebSocket
Add-Type -AssemblyName System.Net.WebSockets.Client
Add-Type -AssemblyName System.Net.WebSockets
$ws = New-Object System.Net.WebSockets.ClientWebSocket

$uri = New-Object System.Uri("$wsUrl/$envId`?token=$token")
$cancellationToken = [System.Threading.CancellationToken]::None

try {
    $ws.ConnectAsync($uri, $cancellationToken).Wait()
    Write-Host "Connected to Signaling WebSocket."
} catch {
    Write-Host "Failed to connect to WS: $_"
    exit
}

# 5. Send Chat Message
$msg = @{
    type = "CHAT"
    content = "Hello WebRTC"
    senderName = $username
} | ConvertTo-Json -Compress

$buffer = [System.Text.Encoding]::UTF8.GetBytes($msg)
$segment = New-Object System.ArraySegment[byte] -ArgumentList $buffer
$ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cancellationToken).Wait()
Write-Host "Sent CHAT message."

# 6. Receive Message
$rcvBuffer = New-Object byte[] 1024
$rcvSegment = New-Object System.ArraySegment[byte] -ArgumentList $rcvBuffer
$result = $ws.ReceiveAsync($rcvSegment, $cancellationToken).Result
$rcvMsg = [System.Text.Encoding]::UTF8.GetString($rcvBuffer, 0, $result.Count)

Write-Host "Received: $rcvMsg"

if ($rcvMsg -match "Hello WebRTC") {
    Write-Host "SUCCESS: Chat message verified."
} else {
    Write-Host "FAILURE: Did not receive expected output."
}

$ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $cancellationToken).Wait()
