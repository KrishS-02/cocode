$adminUser = "demo_user"
$adminPass = "password123"
$inviteUser = "viking"
$invitePass = "password123"

function Test-Execution {
    param($user, $token, $envId, $code)
    $headers = @{ Authorization = "Bearer $token" }
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8080/api/execute" -Method Post -Body (@{ code = $code; environmentId = $envId } | ConvertTo-Json) -Headers $headers -ContentType "application/json"
        Write-Output "   SUCCESS: $user parsed. Output: $response"
    } catch {
        Write-Output "   FAILURE: $user blocked. Status: $($_.Exception.Response.StatusCode)"
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            Write-Output "   Body: $($reader.ReadToEnd())"
        }
    }
}

# 1. Login Admin
Write-Output "1. Logging in as Admin ($adminUser)..."
try {
    $adminLogin = Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method Post -Body (@{ username = $adminUser; password = $adminPass } | ConvertTo-Json) -ContentType "application/json"
    $adminToken = $adminLogin.token.Trim()
    Write-Output "   Admin Token Length: $($adminToken.Length)"
} catch {
    Write-Output "   Login Failed: $($_.Exception.Message)"
    exit
}

# 2. Create Environment
Write-Output "2. Creating Environment..."
try {
    $adminHeaders = @{ Authorization = "Bearer $adminToken" }
    $env = Invoke-RestMethod -Uri "http://localhost:8080/api/environments" -Method Post -Body (@{ name = "Restricted Env"; description = "Test Execution" } | ConvertTo-Json) -Headers $adminHeaders -ContentType "application/json"
    $envId = $env.id
    Write-Output "   Environment ID: $envId"
} catch {
    Write-Output "   Environment Creation Failed: $($_.Exception.Message)"
    exit
}

# 3. Invite User Viking as EDITOR
Write-Output "3. Inviting Viking as EDITOR..."
try {
    Invoke-RestMethod -Uri "http://localhost:8080/api/environments/$envId/permissions" -Method Post -Body (@{ usernameOrEmail = $inviteUser; accessLevel = "EDITOR" } | ConvertTo-Json) -Headers $adminHeaders -ContentType "application/json" | Out-Null
    Write-Output "   Invited."
} catch {
    Write-Output "   Invite Failed: $($_.Exception.Message)"
}

# 4. Login as Viking
Write-Output "4. Logging in as Viking ($inviteUser)..."
try {
    $vikingLogin = Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method Post -Body (@{ username = $inviteUser; password = $invitePass } | ConvertTo-Json) -ContentType "application/json"
    $vikingToken = $vikingLogin.token.Trim()
    Write-Output "   Viking Token Length: $($vikingToken.Length)"
} catch {
    Write-Output "   Viking Login Failed: $($_.Exception.Message)"
    exit
}

# 5. Viking attempts to execute code (Should FAIL with 403)
Write-Output "5. Viking (EDITOR) attempts execution..."
Test-Execution -user "Viking" -token $vikingToken -envId $envId -code "print('Viking Run')"

# 6. Admin attempts to execute code (Should SUCCEED)
Write-Output "6. Admin ($adminUser) attempts execution..."
Test-Execution -user "Admin" -token $adminToken -envId $envId -code "print('Admin Run')"

# 7. Promote Viking to ADMIN
Write-Output "7. Promoting Viking to ADMIN..."
try {
    Invoke-RestMethod -Uri "http://localhost:8080/api/environments/$envId/permissions" -Method Post -Body (@{ usernameOrEmail = $inviteUser; accessLevel = "ADMIN" } | ConvertTo-Json) -Headers $adminHeaders -ContentType "application/json" | Out-Null
    Write-Output "   Promoted."
} catch {
    Write-Output "   Promotion Failed: $($_.Exception.Message)"
}

# 8. Viking attempts to execute code (Should SUCCEED)
Write-Output "8. Viking (ADMIN) attempts execution..."
Test-Execution -user "Viking" -token $vikingToken -envId $envId -code "print('Viking Admin Run')"
