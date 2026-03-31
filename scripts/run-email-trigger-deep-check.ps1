$ErrorActionPreference = 'Stop'
$ConfirmPreference = 'None'

$script:AdminEmail = 'admin@supplychain.local'
$script:AdminPassword = 'Admin@1234'
$script:AdminToken = $null
$script:DealerAEmail = $null
$script:DealerAPassword = $null
$script:DealerAToken = $null

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers,
        [string]$Body
    )

    try {
        if ([string]::IsNullOrWhiteSpace($Body)) {
            $response = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri $Url -Headers $Headers -TimeoutSec 45
        }
        else {
            $response = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri $Url -Headers $Headers -ContentType 'application/json' -Body $Body -TimeoutSec 45
        }

        return [pscustomobject]@{
            Status = [int]$response.StatusCode
            Body   = [string]$response.Content
        }
    }
    catch {
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $respBody = $reader.ReadToEnd()
            return [pscustomobject]@{
                Status = $status
                Body   = $respBody
            }
        }

        return [pscustomobject]@{
            Status = -1
            Body   = $_.Exception.Message
        }
    }
}

function Get-Token {
    param(
        [string]$Email,
        [string]$Password
    )

    $login = Invoke-Api -Method 'POST' -Url 'http://localhost:8001/api/auth/login' -Headers @{} -Body (@{ email = $Email; password = $Password } | ConvertTo-Json -Compress)
    if ($login.Status -ne 200) {
        throw "Login failed for $Email. status=$($login.Status) body=$($login.Body)"
    }

    $loginJson = $login.Body | ConvertFrom-Json
    return [string]$loginJson.accessToken
}

function Refresh-AdminToken {
    $script:AdminToken = Get-Token -Email $script:AdminEmail -Password $script:AdminPassword
    return $script:AdminToken
}

function Get-AdminHeaders {
    if ([string]::IsNullOrWhiteSpace($script:AdminToken)) {
        Refresh-AdminToken | Out-Null
    }

    return @{ Authorization = "Bearer $script:AdminToken" }
}

function Invoke-AdminApi {
    param(
        [string]$Method,
        [string]$Url,
        [string]$Body
    )

    $resp = Invoke-Api -Method $Method -Url $Url -Headers (Get-AdminHeaders) -Body $Body
    if ($resp.Status -eq 401) {
        Refresh-AdminToken | Out-Null
        $resp = Invoke-Api -Method $Method -Url $Url -Headers (Get-AdminHeaders) -Body $Body
    }

    return $resp
}

function Refresh-DealerAToken {
    if ([string]::IsNullOrWhiteSpace($script:DealerAEmail) -or [string]::IsNullOrWhiteSpace($script:DealerAPassword)) {
        throw 'Dealer A credentials are not initialized for token refresh.'
    }

    $script:DealerAToken = Get-Token -Email $script:DealerAEmail -Password $script:DealerAPassword
    return $script:DealerAToken
}

function Get-DealerAHeaders {
    if ([string]::IsNullOrWhiteSpace($script:DealerAToken)) {
        Refresh-DealerAToken | Out-Null
    }

    return @{ Authorization = "Bearer $script:DealerAToken" }
}

function Invoke-DealerAApi {
    param(
        [string]$Method,
        [string]$Url,
        [string]$Body
    )

    $resp = Invoke-Api -Method $Method -Url $Url -Headers (Get-DealerAHeaders) -Body $Body
    if ($resp.Status -eq 401) {
        Refresh-DealerAToken | Out-Null
        $resp = Invoke-Api -Method $Method -Url $Url -Headers (Get-DealerAHeaders) -Body $Body
    }

    return $resp
}

function Get-Notifications {
    param([string]$AdminToken)

    $resp = Invoke-AdminApi -Method 'GET' -Url 'http://localhost:8006/api/notifications' -Body ''
    if ($resp.Status -ne 200) {
        throw "Failed to load notifications. status=$($resp.Status) body=$($resp.Body)"
    }

    $json = $resp.Body | ConvertFrom-Json
    if ($null -eq $json) {
        return @()
    }

    if ($json -is [System.Array]) {
        return $json
    }

    return @($json)
}

function Wait-Notification {
    param(
        [string]$AdminToken,
        [string]$SourceService,
        [string]$EventType,
        [string]$ContainsText,
        [datetime]$AfterUtc,
        [int]$TimeoutSeconds = 120
    )

    $deadline = (Get-Date).ToUniversalTime().AddSeconds($TimeoutSeconds)
    while ((Get-Date).ToUniversalTime() -lt $deadline) {
        $all = Get-Notifications -AdminToken $AdminToken

        $matches = $all | Where-Object {
            $_.sourceService -eq $SourceService -and
            $_.eventType -eq $EventType -and
            ([datetime]$_.createdAtUtc) -ge $AfterUtc.AddSeconds(-2) -and
            (
                [string]::IsNullOrWhiteSpace($ContainsText) -or
                ($_.body -like "*$ContainsText*") -or
                ($_.title -like "*$ContainsText*")
            )
        } | Sort-Object { [datetime]$_.createdAtUtc } -Descending

        if ($matches.Count -gt 0) {
            return $matches[0]
        }

        Start-Sleep -Seconds 2
    }

    return $null
}

function Wait-NotificationStatusById {
    param(
        [string]$AdminToken,
        [string]$NotificationId,
        [int]$TimeoutSeconds = 120
    )

    $deadline = (Get-Date).ToUniversalTime().AddSeconds($TimeoutSeconds)
    while ((Get-Date).ToUniversalTime() -lt $deadline) {
        $resp = Invoke-AdminApi -Method 'GET' -Url "http://localhost:8006/api/notifications/$NotificationId" -Body ''
        if ($resp.Status -eq 200) {
            $n = $resp.Body | ConvertFrom-Json
            if ([int]$n.status -ne 0) {
                return $n
            }
        }

        Start-Sleep -Seconds 2
    }

    return $null
}

function Add-Result {
    param(
        [System.Collections.Generic.List[object]]$Results,
        [string]$Mode,
        [string]$Source,
        [string]$Event,
        [string]$NotificationId,
        [int]$Channel,
        [int]$Status,
        [string]$FailureReason,
        [string]$Notes
    )

    $Results.Add([pscustomobject]@{
        mode          = $Mode
        source        = $Source
        event         = $Event
        notificationId = $NotificationId
        channel       = $Channel
        status        = $Status
        sent          = ($Status -eq 1)
        failureReason = $FailureReason
        notes         = $Notes
    })
}

function Add-ResultFromNotification {
    param(
        [System.Collections.Generic.List[object]]$Results,
        [string]$Mode,
        [string]$Source,
        [string]$Event,
        $Notification,
        [string]$Notes
    )

    if ($null -eq $Notification) {
        Add-Result -Results $Results -Mode $Mode -Source $Source -Event $Event -NotificationId '' -Channel -1 -Status -1 -FailureReason 'Notification not found in timeout window.' -Notes $Notes
        return
    }

    Add-Result -Results $Results -Mode $Mode -Source $Source -Event $Event -NotificationId ([string]$Notification.notificationId) -Channel ([int]$Notification.channel) -Status ([int]$Notification.status) -FailureReason ([string]$Notification.failureReason) -Notes $Notes
}

function Try-UpdateOrderStatus {
    param(
        [string]$OrderId,
        [int]$NewStatus,
        [int]$MaxRetries = 3
    )

    $last = $null
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        $last = Invoke-AdminApi -Method 'PUT' -Url "http://localhost:8003/api/orders/$OrderId/status" -Body (@{ newStatus = $NewStatus } | ConvertTo-Json -Compress)
        if ($last.Status -eq 200) {
            return $last
        }

        # Known transient in Order service during concurrent updates.
        if ($last.Status -eq 500 -and $last.Body -like '*DbUpdateConcurrencyException*' -and $attempt -lt $MaxRetries) {
            Start-Sleep -Seconds 2
            continue
        }

        break
    }

    return $last
}

# Baseline health check
$healthUrls = @(
    'http://localhost:8001/health',
    'http://localhost:8002/health',
    'http://localhost:8003/health',
    'http://localhost:8004/health',
    'http://localhost:8005/health',
    'http://localhost:8006/health'
)

foreach ($u in $healthUrls) {
    $h = Invoke-Api -Method 'GET' -Url $u -Headers @{} -Body ''
    if ($h.Status -lt 200 -or $h.Status -ge 400) {
        throw "Service health failed at $u status=$($h.Status)"
    }
}

$results = [System.Collections.Generic.List[object]]::new()
$stamp = (Get-Date).ToString('yyyyMMddHHmmss')
$utcNow = (Get-Date).ToUniversalTime().ToString('o')

$adminToken = Refresh-AdminToken

# Resolve one real product for order/invoice payloads
$productListResp = Invoke-Api -Method 'GET' -Url 'http://localhost:8002/api/products?page=1&size=1' -Headers @{} -Body ''
if ($productListResp.Status -ne 200) {
    throw "Failed to load products. status=$($productListResp.Status) body=$($productListResp.Body)"
}

$productListJson = $productListResp.Body | ConvertFrom-Json
if ($null -eq $productListJson.items -or $productListJson.items.Count -lt 1) {
    throw 'No products found. At least one product is required for order/invoice tests.'
}

$productId = [string]$productListJson.items[0].productId
$productDetailResp = Invoke-Api -Method 'GET' -Url "http://localhost:8002/api/products/$productId" -Headers @{} -Body ''
if ($productDetailResp.Status -ne 200) {
    throw "Failed to load product detail. status=$($productDetailResp.Status) body=$($productDetailResp.Body)"
}

$product = $productDetailResp.Body | ConvertFrom-Json

$lineProductId = [string]$product.productId
$lineName = [string]$product.name
$lineSku = [string]$product.sku
$lineUnitPrice = [decimal]$product.unitPrice
$lineMinOrderQty = [int]$product.minOrderQty
if ($lineMinOrderQty -lt 1) { $lineMinOrderQty = 1 }

$dealerPasswordInitial = 'Password1!'
$dealerPasswordReset = 'Dealer@1234!'

$emailA = "mohanmutyalu+approve$stamp@gmail.com"
$emailB = "mohanmutyalu+reject$stamp@gmail.com"

$phoneA = ('9' + $stamp.Substring($stamp.Length - 9))
$phoneB = ('8' + $stamp.Substring($stamp.Length - 9))
$gstA = ('29ABCDE' + $stamp.Substring($stamp.Length - 4) + 'F1Z5')
$gstB = ('27ABCDF' + $stamp.Substring($stamp.Length - 4) + 'G1Z6')
$tradeA = ('TRADEA' + $stamp)
$tradeB = ('TRADEB' + $stamp)

# 1) Identity dealer registered + approved flow
$registerAAt = (Get-Date).ToUniversalTime()
$registerABody = @{
    email = $emailA
    password = $dealerPasswordInitial
    fullName = 'Email Trigger Dealer A'
    phoneNumber = $phoneA
    businessName = 'Email Trigger Biz A'
    gstNumber = $gstA
    tradeLicenseNo = $tradeA
    address = 'Address A'
    city = 'Jalandhar'
    state = 'Punjab'
    pinCode = '144001'
    isInterstate = $false
} | ConvertTo-Json -Compress

$registerAResp = Invoke-Api -Method 'POST' -Url 'http://localhost:8001/api/auth/register' -Headers @{} -Body $registerABody
if ($registerAResp.Status -ne 201) {
    throw "Dealer A register failed. status=$($registerAResp.Status) body=$($registerAResp.Body)"
}

$dealerA = $registerAResp.Body | ConvertFrom-Json
$dealerAId = [string]$dealerA.userId

$dealerRegisteredA = Wait-Notification -AdminToken $adminToken -SourceService 'identity' -EventType 'dealerregistered' -ContainsText $emailA -AfterUtc $registerAAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'identity' -Event 'dealerregistered' -Notification $dealerRegisteredA -Notes 'Dealer A registration'

$approveAAt = (Get-Date).ToUniversalTime()
$approveResp = Invoke-AdminApi -Method 'PUT' -Url "http://localhost:8001/api/admin/dealers/$dealerAId/approve" -Body ''
if ($approveResp.Status -ne 200) {
    throw "Dealer A approve failed. status=$($approveResp.Status) body=$($approveResp.Body)"
}

$dealerApproved = Wait-Notification -AdminToken $adminToken -SourceService 'identity' -EventType 'dealerapproved' -ContainsText $dealerAId -AfterUtc $approveAAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'identity' -Event 'dealerapproved' -Notification $dealerApproved -Notes 'Dealer A approved'

# 2) Forgot/reset password flow
$forgotAt = (Get-Date).ToUniversalTime()
$forgotResp = Invoke-Api -Method 'POST' -Url 'http://localhost:8001/api/auth/forgot-password' -Headers @{} -Body (@{ email = $emailA } | ConvertTo-Json -Compress)
if ($forgotResp.Status -ne 200) {
    throw "Forgot password failed. status=$($forgotResp.Status) body=$($forgotResp.Body)"
}

$resetRequested = Wait-Notification -AdminToken $adminToken -SourceService 'identity' -EventType 'passwordresetrequested' -ContainsText $emailA -AfterUtc $forgotAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'identity' -Event 'passwordresetrequested' -Notification $resetRequested -Notes 'Forgot password request'

$otpCode = $null
if ($null -ne $resetRequested) {
    try {
        $otpPayload = ([string]$resetRequested.body) | ConvertFrom-Json
        $otpCode = [string]$otpPayload.otpCode
        if ([string]::IsNullOrWhiteSpace($otpCode)) {
            $otpCode = [string]$otpPayload.OtpCode
        }
    }
    catch {
        $otpCode = $null
    }
}

if ([string]::IsNullOrWhiteSpace($otpCode)) {
    Add-Result -Results $results -Mode 'e2e' -Source 'identity' -Event 'passwordresetcompleted' -NotificationId '' -Channel -1 -Status -1 -FailureReason 'OTP not found in passwordresetrequested payload.' -Notes 'Reset password skipped'
}
else {
    $resetAt = (Get-Date).ToUniversalTime()
    $resetResp = Invoke-Api -Method 'POST' -Url 'http://localhost:8001/api/auth/reset-password' -Headers @{} -Body (@{ email = $emailA; otpCode = $otpCode; newPassword = $dealerPasswordReset } | ConvertTo-Json -Compress)
    if ($resetResp.Status -ne 200) {
        Add-Result -Results $results -Mode 'e2e' -Source 'identity' -Event 'passwordresetcompleted' -NotificationId '' -Channel -1 -Status -1 -FailureReason "Reset API failed status=$($resetResp.Status) body=$($resetResp.Body)" -Notes 'Reset password API'
    }
    else {
        $resetCompleted = Wait-Notification -AdminToken $adminToken -SourceService 'identity' -EventType 'passwordresetcompleted' -ContainsText $emailA -AfterUtc $resetAt
        Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'identity' -Event 'passwordresetcompleted' -Notification $resetCompleted -Notes 'Reset password completed'
    }
}

# 3) Identity dealer rejected flow
$registerBAt = (Get-Date).ToUniversalTime()
$registerBBody = @{
    email = $emailB
    password = $dealerPasswordInitial
    fullName = 'Email Trigger Dealer B'
    phoneNumber = $phoneB
    businessName = 'Email Trigger Biz B'
    gstNumber = $gstB
    tradeLicenseNo = $tradeB
    address = 'Address B'
    city = 'Ludhiana'
    state = 'Punjab'
    pinCode = '141001'
    isInterstate = $false
} | ConvertTo-Json -Compress

$registerBResp = Invoke-Api -Method 'POST' -Url 'http://localhost:8001/api/auth/register' -Headers @{} -Body $registerBBody
if ($registerBResp.Status -ne 201) {
    throw "Dealer B register failed. status=$($registerBResp.Status) body=$($registerBResp.Body)"
}

$dealerB = $registerBResp.Body | ConvertFrom-Json
$dealerBId = [string]$dealerB.userId

$dealerRegisteredB = Wait-Notification -AdminToken $adminToken -SourceService 'identity' -EventType 'dealerregistered' -ContainsText $emailB -AfterUtc $registerBAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'identity' -Event 'dealerregistered' -Notification $dealerRegisteredB -Notes 'Dealer B registration'

$rejectAt = (Get-Date).ToUniversalTime()
$rejectResp = Invoke-AdminApi -Method 'PUT' -Url "http://localhost:8001/api/admin/dealers/$dealerBId/reject" -Body (@{ reason = 'Deep check rejection path' } | ConvertTo-Json -Compress)
if ($rejectResp.Status -ne 200) {
    throw "Dealer B reject failed. status=$($rejectResp.Status) body=$($rejectResp.Body)"
}

$dealerRejected = Wait-Notification -AdminToken $adminToken -SourceService 'identity' -EventType 'dealerrejected' -ContainsText $emailB -AfterUtc $rejectAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'identity' -Event 'dealerrejected' -Notification $dealerRejected -Notes 'Dealer B rejected'

# Login dealer A (prefer reset password, fallback to initial if reset path failed)
$dealerAToken = $null
$dealerAPasswordInUse = $null
$dealerLoginErrors = @()

try {
    $dealerAToken = Get-Token -Email $emailA -Password $dealerPasswordReset
    if (-not [string]::IsNullOrWhiteSpace($dealerAToken)) {
        $dealerAPasswordInUse = $dealerPasswordReset
    }
}
catch {
    $dealerLoginErrors += $_.Exception.Message
}

if ($null -eq $dealerAToken) {
    try {
        $dealerAToken = Get-Token -Email $emailA -Password $dealerPasswordInitial
        if (-not [string]::IsNullOrWhiteSpace($dealerAToken)) {
            $dealerAPasswordInUse = $dealerPasswordInitial
        }
    }
    catch {
        $dealerLoginErrors += $_.Exception.Message
    }
}

if ($null -eq $dealerAToken) {
    throw ("Dealer A login failed with both reset and initial password. Details: " + ($dealerLoginErrors -join ' | '))
}

$script:DealerAEmail = $emailA
$script:DealerAPassword = $dealerAPasswordInUse
$script:DealerAToken = $dealerAToken

# 4) Payment events
$seedAccountResp = Invoke-AdminApi -Method 'POST' -Url "http://localhost:8005/api/payment/dealers/$dealerAId/account" -Body (@{ initialCreditLimit = 2000 } | ConvertTo-Json -Compress)
if ($seedAccountResp.Status -ne 200) {
    throw "Seed dealer account failed. status=$($seedAccountResp.Status) body=$($seedAccountResp.Body)"
}

$creditEventAt = (Get-Date).ToUniversalTime()
$updateLimitResp = Invoke-AdminApi -Method 'PUT' -Url "http://localhost:8005/api/payment/dealers/$dealerAId/credit-limit" -Body (@{ creditLimit = 2500 } | ConvertTo-Json -Compress)
if ($updateLimitResp.Status -ne 200) {
    throw "Update credit limit failed. status=$($updateLimitResp.Status) body=$($updateLimitResp.Body)"
}

$creditEvent = Wait-Notification -AdminToken $adminToken -SourceService 'payment' -EventType 'dealercreditlimitupdated' -ContainsText $dealerAId -AfterUtc $creditEventAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'payment' -Event 'dealercreditlimitupdated' -Notification $creditEvent -Notes 'Payment credit limit updated'

# Keep credit high for order placed flow
$setHighCreditResp = Invoke-AdminApi -Method 'PUT' -Url "http://localhost:8005/api/payment/dealers/$dealerAId/credit-limit" -Body (@{ creditLimit = 100000 } | ConvertTo-Json -Compress)
if ($setHighCreditResp.Status -ne 200) {
    throw "Set high credit limit failed. status=$($setHighCreditResp.Status) body=$($setHighCreditResp.Body)"
}

$invoiceEventAt = (Get-Date).ToUniversalTime()
$invoiceOrderId = [guid]::NewGuid().ToString()
$invoiceReq = @{
    orderId = $invoiceOrderId
    dealerId = $dealerAId
    isInterstate = $false
    paymentMode = 0
    lines = @(
        @{
            productId = $lineProductId
            productName = $lineName
            sku = $lineSku
            hsnCode = '8471'
            quantity = 1
            unitPrice = [decimal]$lineUnitPrice
        }
    )
} | ConvertTo-Json -Depth 6 -Compress

$invoiceResp = Invoke-AdminApi -Method 'POST' -Url 'http://localhost:8005/api/payment/invoices' -Body $invoiceReq
if ($invoiceResp.Status -ne 201) {
    throw "Generate invoice failed. status=$($invoiceResp.Status) body=$($invoiceResp.Body)"
}

$invoiceEvent = Wait-Notification -AdminToken $adminToken -SourceService 'payment' -EventType 'invoicegenerated' -ContainsText $dealerAId -AfterUtc $invoiceEventAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'payment' -Event 'invoicegenerated' -Notification $invoiceEvent -Notes 'Payment invoice generated'

# 5) Order events: orderplaced + dynamic order* + returnrequested + ordercancelled + adminapprovalrequired + orderapproved
$orderCreateAt = (Get-Date).ToUniversalTime()
$orderCreateReq = @{
    paymentMode = 0
    idempotencyKey = [guid]::NewGuid().ToString()
    lines = @(
        @{
            productId = $lineProductId
            productName = $lineName
            sku = $lineSku
            quantity = [int]$lineMinOrderQty
            unitPrice = [decimal]$lineUnitPrice
            minOrderQty = [int]$lineMinOrderQty
        }
    )
} | ConvertTo-Json -Depth 6 -Compress

$orderCreateResp = Invoke-DealerAApi -Method 'POST' -Url 'http://localhost:8003/api/orders' -Body $orderCreateReq
if ($orderCreateResp.Status -ne 201) {
    throw "Create order 1 failed. status=$($orderCreateResp.Status) body=$($orderCreateResp.Body)"
}

$order1 = $orderCreateResp.Body | ConvertFrom-Json
$order1Id = [string]$order1.orderId

$orderPlaced = Wait-Notification -AdminToken $adminToken -SourceService 'order' -EventType 'orderplaced' -ContainsText $order1Id -AfterUtc $orderCreateAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'order' -Event 'orderplaced' -Notification $orderPlaced -Notes 'Dealer order created with sufficient credit'

$readyAt = (Get-Date).ToUniversalTime()
$readyResp = Try-UpdateOrderStatus -OrderId $order1Id -NewStatus 3
if ($readyResp.Status -ne 200) {
    Add-Result -Results $results -Mode 'e2e' -Source 'order' -Event 'orderreadyfordispatch' -NotificationId '' -Channel -1 -Status -1 -FailureReason "Update status API failed status=$($readyResp.Status)" -Notes 'ReadyForDispatch status transition failed'
}
else {
    $orderReady = Wait-Notification -AdminToken $adminToken -SourceService 'order' -EventType 'orderreadyfordispatch' -ContainsText $order1Id -AfterUtc $readyAt
    Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'order' -Event 'orderreadyfordispatch' -Notification $orderReady -Notes 'Order status dynamic event'
}

$transitAt = (Get-Date).ToUniversalTime()
$transitResp = Try-UpdateOrderStatus -OrderId $order1Id -NewStatus 4
if ($transitResp.Status -ne 200) {
    Add-Result -Results $results -Mode 'e2e' -Source 'order' -Event 'orderintransit' -NotificationId '' -Channel -1 -Status -1 -FailureReason "Update status API failed status=$($transitResp.Status)" -Notes 'InTransit status transition failed'
}
else {
    $orderTransit = Wait-Notification -AdminToken $adminToken -SourceService 'order' -EventType 'orderintransit' -ContainsText $order1Id -AfterUtc $transitAt
    Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'order' -Event 'orderintransit' -Notification $orderTransit -Notes 'Order status dynamic event'
}

$deliveredAt = (Get-Date).ToUniversalTime()
$deliveredResp = Try-UpdateOrderStatus -OrderId $order1Id -NewStatus 6
if ($deliveredResp.Status -ne 200) {
    Add-Result -Results $results -Mode 'e2e' -Source 'order' -Event 'orderdelivered' -NotificationId '' -Channel -1 -Status -1 -FailureReason "Update status API failed status=$($deliveredResp.Status)" -Notes 'Delivered status transition failed'
}
else {
    $orderDelivered = Wait-Notification -AdminToken $adminToken -SourceService 'order' -EventType 'orderdelivered' -ContainsText $order1Id -AfterUtc $deliveredAt
    Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'order' -Event 'orderdelivered' -Notification $orderDelivered -Notes 'Order status dynamic event'
}

$returnAt = (Get-Date).ToUniversalTime()
$returnResp = Invoke-DealerAApi -Method 'POST' -Url "http://localhost:8003/api/orders/$order1Id/returns" -Body (@{ reason = 'Deep check return flow' } | ConvertTo-Json -Compress)
if ($returnResp.Status -ne 200) {
    Add-Result -Results $results -Mode 'e2e' -Source 'order' -Event 'returnrequested' -NotificationId '' -Channel -1 -Status -1 -FailureReason "Return API failed status=$($returnResp.Status)" -Notes 'Dealer return request failed'
}
else {
    $returnEvent = Wait-Notification -AdminToken $adminToken -SourceService 'order' -EventType 'returnrequested' -ContainsText $order1Id -AfterUtc $returnAt
    Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'order' -Event 'returnrequested' -Notification $returnEvent -Notes 'Dealer requested return'
}

# separate order for cancel event
$order2CreateAt = (Get-Date).ToUniversalTime()
$order2Req = @{
    paymentMode = 0
    idempotencyKey = [guid]::NewGuid().ToString()
    lines = @(
        @{
            productId = $lineProductId
            productName = $lineName
            sku = $lineSku
            quantity = [int]$lineMinOrderQty
            unitPrice = [decimal]$lineUnitPrice
            minOrderQty = [int]$lineMinOrderQty
        }
    )
} | ConvertTo-Json -Depth 6 -Compress

$order2CreateResp = Invoke-DealerAApi -Method 'POST' -Url 'http://localhost:8003/api/orders' -Body $order2Req
if ($order2CreateResp.Status -ne 201) {
    throw "Create order 2 failed. status=$($order2CreateResp.Status) body=$($order2CreateResp.Body)"
}
$order2 = $order2CreateResp.Body | ConvertFrom-Json
$order2Id = [string]$order2.orderId

$order2Placed = Wait-Notification -AdminToken $adminToken -SourceService 'order' -EventType 'orderplaced' -ContainsText $order2Id -AfterUtc $order2CreateAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'order' -Event 'orderplaced' -Notification $order2Placed -Notes 'Second order for cancel path'

$cancelAt = (Get-Date).ToUniversalTime()
$cancelResp = Invoke-DealerAApi -Method 'POST' -Url "http://localhost:8003/api/orders/$order2Id/cancel" -Body (@{ reason = 'Deep check cancel flow' } | ConvertTo-Json -Compress)
if ($cancelResp.Status -ne 200) {
    Add-Result -Results $results -Mode 'e2e' -Source 'order' -Event 'ordercancelled' -NotificationId '' -Channel -1 -Status -1 -FailureReason "Order cancel API failed status=$($cancelResp.Status) body=$($cancelResp.Body)" -Notes 'Dealer cancel path endpoint failed'
}
else {
    $cancelEvent = Wait-Notification -AdminToken $adminToken -SourceService 'order' -EventType 'ordercancelled' -ContainsText $order2Id -AfterUtc $cancelAt
    Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'order' -Event 'ordercancelled' -Notification $cancelEvent -Notes 'Dealer cancelled order'
}

# on-hold + admin approval path
$setLowCreditResp = Invoke-AdminApi -Method 'PUT' -Url "http://localhost:8005/api/payment/dealers/$dealerAId/credit-limit" -Body (@{ creditLimit = 1 } | ConvertTo-Json -Compress)
if ($setLowCreditResp.Status -ne 200) {
    throw "Set low credit failed. status=$($setLowCreditResp.Status) body=$($setLowCreditResp.Body)"
}

$order3CreateAt = (Get-Date).ToUniversalTime()
$order3Req = @{
    paymentMode = 0
    idempotencyKey = [guid]::NewGuid().ToString()
    lines = @(
        @{
            productId = $lineProductId
            productName = $lineName
            sku = $lineSku
            quantity = [int]($lineMinOrderQty + 3)
            unitPrice = [decimal]$lineUnitPrice
            minOrderQty = [int]$lineMinOrderQty
        }
    )
} | ConvertTo-Json -Depth 6 -Compress

$order3CreateResp = Invoke-DealerAApi -Method 'POST' -Url 'http://localhost:8003/api/orders' -Body $order3Req
if ($order3CreateResp.Status -ne 201) {
    throw "Create order 3 (on-hold path) failed. status=$($order3CreateResp.Status) body=$($order3CreateResp.Body)"
}

$order3 = $order3CreateResp.Body | ConvertFrom-Json
$order3Id = [string]$order3.orderId

$approvalRequiredEvent = Wait-Notification -AdminToken $adminToken -SourceService 'order' -EventType 'adminapprovalrequired' -ContainsText $order3Id -AfterUtc $order3CreateAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'order' -Event 'adminapprovalrequired' -Notification $approvalRequiredEvent -Notes 'Order exceeded credit and moved on-hold'

$approveHoldAt = (Get-Date).ToUniversalTime()
$approveHoldResp = Invoke-AdminApi -Method 'PUT' -Url "http://localhost:8003/api/admin/orders/$order3Id/approve-hold" -Body ''
if ($approveHoldResp.Status -ne 200) {
    Add-Result -Results $results -Mode 'e2e' -Source 'order' -Event 'orderapproved' -NotificationId '' -Channel -1 -Status -1 -FailureReason "Approve on-hold API failed status=$($approveHoldResp.Status) body=$($approveHoldResp.Body)" -Notes 'Admin approve-hold endpoint failed'
}
else {
    $orderApprovedEvent = Wait-Notification -AdminToken $adminToken -SourceService 'order' -EventType 'orderapproved' -ContainsText $order3Id -AfterUtc $approveHoldAt
    Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'order' -Event 'orderapproved' -Notification $orderApprovedEvent -Notes 'Admin approved on-hold order'
}

# 6) Logistics events (create, assign, status update)
$shipmentCreateAt = (Get-Date).ToUniversalTime()
$shipmentCreateReq = @{
    orderId = $order1Id
    dealerId = $dealerAId
    deliveryAddress = 'Logistics Test Address'
    city = 'Jalandhar'
    state = 'Punjab'
    postalCode = '144001'
} | ConvertTo-Json -Compress

$shipmentCreateResp = Invoke-AdminApi -Method 'POST' -Url 'http://localhost:8004/api/logistics/shipments' -Body $shipmentCreateReq
if ($shipmentCreateResp.Status -ne 201) {
    throw "Create shipment failed. status=$($shipmentCreateResp.Status) body=$($shipmentCreateResp.Body)"
}

$shipment = $shipmentCreateResp.Body | ConvertFrom-Json
$shipmentId = [string]$shipment.shipmentId

$shipmentCreated = Wait-Notification -AdminToken $adminToken -SourceService 'logistics' -EventType 'shipmentcreated' -ContainsText $shipmentId -AfterUtc $shipmentCreateAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'logistics' -Event 'shipmentcreated' -Notification $shipmentCreated -Notes 'Shipment created'

$assignAt = (Get-Date).ToUniversalTime()
$assignResp = Invoke-AdminApi -Method 'PUT' -Url "http://localhost:8004/api/logistics/shipments/$shipmentId/assign-agent" -Body (@{ agentId = [guid]::NewGuid().ToString() } | ConvertTo-Json -Compress)
if ($assignResp.Status -ne 200) {
    throw "Assign agent failed. status=$($assignResp.Status) body=$($assignResp.Body)"
}
$shipmentAssigned = Wait-Notification -AdminToken $adminToken -SourceService 'logistics' -EventType 'shipmentassigned' -ContainsText $shipmentId -AfterUtc $assignAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'logistics' -Event 'shipmentassigned' -Notification $shipmentAssigned -Notes 'Shipment assigned'

$statusAt = (Get-Date).ToUniversalTime()
$statusResp = Invoke-AdminApi -Method 'PUT' -Url "http://localhost:8004/api/logistics/shipments/$shipmentId/status" -Body (@{ status = 3; note = 'Deep check in transit update' } | ConvertTo-Json -Compress)
if ($statusResp.Status -ne 200) {
    throw "Shipment status update failed. status=$($statusResp.Status) body=$($statusResp.Body)"
}
$shipmentStatusUpdated = Wait-Notification -AdminToken $adminToken -SourceService 'logistics' -EventType 'shipmentstatusupdated' -ContainsText $shipmentId -AfterUtc $statusAt
Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'logistics' -Event 'shipmentstatusupdated' -Notification $shipmentStatusUpdated -Notes 'Shipment status updated'

# 7) Manual email channel event
$manualAt = (Get-Date).ToUniversalTime()
$manualResp = Invoke-AdminApi -Method 'POST' -Url 'http://localhost:8006/api/notifications/manual' -Body (@{
    recipientUserId = $dealerAId
    title = 'Manual Email Trigger Deep Check'
    body = "Manual email created at $utcNow"
    channel = 1
} | ConvertTo-Json -Compress)

if ($manualResp.Status -ne 201) {
    Add-Result -Results $results -Mode 'e2e' -Source 'notification' -Event 'manual notification with channel=email' -NotificationId '' -Channel -1 -Status -1 -FailureReason "Manual create failed status=$($manualResp.Status) body=$($manualResp.Body)" -Notes 'Manual notification create'
}
else {
    $manualCreated = $manualResp.Body | ConvertFrom-Json
    $manualId = [string]$manualCreated.notificationId
    $manualFinal = Wait-NotificationStatusById -AdminToken $adminToken -NotificationId $manualId
    if ($null -eq $manualFinal) {
        Add-Result -Results $results -Mode 'e2e' -Source 'notification' -Event 'manual notification with channel=email' -NotificationId $manualId -Channel 1 -Status -1 -FailureReason 'Manual notification did not move from pending in timeout window.' -Notes 'Manual notification dispatch'
    }
    else {
        Add-ResultFromNotification -Results $results -Mode 'e2e' -Source 'notification' -Event 'manual notification with channel=email' -Notification $manualFinal -Notes 'Manual notification dispatch'
    }
}

# Output
Write-Output '==== EMAIL TRIGGER DEEP CHECK RESULTS ===='
$results | Sort-Object source, event, mode | Format-Table mode, source, event, sent, status, channel, notificationId, failureReason -AutoSize | Out-String | Write-Output

$total = $results.Count
$sentCount = ($results | Where-Object { $_.sent -eq $true }).Count
$failedCount = ($results | Where-Object { $_.status -ne 1 }).Count

Write-Output ("TOTAL_TESTED=" + $total)
Write-Output ("TOTAL_SENT=" + $sentCount)
Write-Output ("TOTAL_NOT_SENT=" + $failedCount)

Write-Output '==== RESULTS_JSON ===='
$results | ConvertTo-Json -Depth 6
