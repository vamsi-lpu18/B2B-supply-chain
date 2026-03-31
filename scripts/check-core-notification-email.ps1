$ErrorActionPreference = 'Stop'

function Invoke-JsonApi {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Url,
        [hashtable]$Headers,
        $Body,
        [int]$TimeoutSec = 45
    )

    try {
        if ($null -eq $Body -or ($Body -is [string] -and [string]::IsNullOrWhiteSpace($Body))) {
            $resp = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri $Url -Headers $Headers -TimeoutSec $TimeoutSec
        }
        else {
            $jsonBody = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 10 -Compress }
            $resp = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri $Url -Headers $Headers -ContentType 'application/json' -Body $jsonBody -TimeoutSec $TimeoutSec
        }

        $json = $null
        if (-not [string]::IsNullOrWhiteSpace([string]$resp.Content)) {
            try { $json = $resp.Content | ConvertFrom-Json } catch { $json = $null }
        }

        return [pscustomobject]@{ Status = [int]$resp.StatusCode; Json = $json; Body = [string]$resp.Content }
    }
    catch {
        $status = -1
        $bodyText = $_.Exception.Message
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $bodyText = $reader.ReadToEnd()
            }
            catch {}
        }

        $json = $null
        if (-not [string]::IsNullOrWhiteSpace($bodyText)) {
            try { $json = $bodyText | ConvertFrom-Json } catch { $json = $null }
        }

        return [pscustomobject]@{ Status = $status; Json = $json; Body = [string]$bodyText }
    }
}

function Get-AdminToken {
    $login = Invoke-JsonApi -Method 'POST' -Url 'http://localhost:8001/api/auth/login' -Headers @{} -Body @{ email = 'admin@supplychain.local'; password = 'Admin@1234' }
    if ($login.Status -ne 200 -or [string]::IsNullOrWhiteSpace([string]$login.Json.accessToken)) {
        throw "Admin login failed. status=$($login.Status) body=$($login.Body)"
    }

    return [string]$login.Json.accessToken
}

function Wait-NotificationEvent {
    param(
        [Parameter(Mandatory = $true)][string]$AdminToken,
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Event,
        [Parameter(Mandatory = $true)][string]$ContainsText,
        [Parameter(Mandatory = $true)][datetime]$AfterUtc,
        [int]$TimeoutSec = 150
    )

    $headers = @{ Authorization = "Bearer $AdminToken" }
    $deadline = (Get-Date).ToUniversalTime().AddSeconds($TimeoutSec)

    while ((Get-Date).ToUniversalTime() -lt $deadline) {
        $all = Invoke-JsonApi -Method 'GET' -Url 'http://localhost:8006/api/notifications' -Headers $headers -Body $null
        if ($all.Status -eq 200 -and $null -ne $all.Json) {
            $items = if ($all.Json -is [System.Array]) { $all.Json } else { @($all.Json) }
            $match = $items |
                Where-Object {
                    $_.sourceService -eq $Source -and
                    $_.eventType -eq $Event -and
                    ([datetime]$_.createdAtUtc) -ge $AfterUtc.AddSeconds(-2) -and
                    (
                        [string]::IsNullOrWhiteSpace($ContainsText) -or
                        ([string]$_.body -like "*$ContainsText*") -or
                        ([string]$_.title -like "*$ContainsText*")
                    )
                } |
                Sort-Object { [datetime]$_.createdAtUtc } -Descending |
                Select-Object -First 1

            if ($null -ne $match) {
                return $match
            }
        }

        Start-Sleep -Seconds 2
    }

    return $null
}

function Wait-NotificationDispatchFinal {
    param(
        [Parameter(Mandatory = $true)][string]$AdminToken,
        [Parameter(Mandatory = $true)]$Notification,
        [int]$TimeoutSec = 120
    )

    if ($null -eq $Notification) {
        return $null
    }

    $status = [int]$Notification.status
    if ($status -ne 0) {
        return $Notification
    }

    $notificationId = [string]$Notification.notificationId
    if ([string]::IsNullOrWhiteSpace($notificationId)) {
        return $Notification
    }

    $headers = @{ Authorization = "Bearer $AdminToken" }
    $deadline = (Get-Date).ToUniversalTime().AddSeconds($TimeoutSec)
    $latest = $Notification

    while ((Get-Date).ToUniversalTime() -lt $deadline) {
        $resp = Invoke-JsonApi -Method 'GET' -Url "http://localhost:8006/api/notifications/$notificationId" -Headers $headers -Body $null
        if ($resp.Status -eq 200 -and $null -ne $resp.Json) {
            $latest = $resp.Json
            if ([int]$latest.status -ne 0) {
                return $latest
            }
        }

        Start-Sleep -Seconds 2
    }

    return $latest
}

function Convert-Outcome {
    param(
        [string]$Case,
        $Notification,
        [bool]$IsInDealerFeed
    )

    if ($null -eq $Notification) {
        return [pscustomobject]@{
            case = $Case
            found = $false
            inDealerFeed = $false
            channel = -1
            status = -1
            emailed = $false
            notificationId = ''
            failureReason = 'Notification not found in timeout window.'
        }
    }

    $statusInt = [int]$Notification.status
    $channelInt = [int]$Notification.channel

    return [pscustomobject]@{
        case = $Case
        found = $true
        inDealerFeed = $IsInDealerFeed
        channel = $channelInt
        status = $statusInt
        emailed = ($channelInt -eq 1 -and $statusInt -eq 1)
        notificationId = [string]$Notification.notificationId
        failureReason = [string]$Notification.failureReason
    }
}

$stamp = (Get-Date).ToString('yyyyMMddHHmmss')
$adminToken = Get-AdminToken
$adminHeaders = @{ Authorization = "Bearer $adminToken" }

# Pick one product for order payload.
$productList = Invoke-JsonApi -Method 'GET' -Url 'http://localhost:8002/api/products?page=1&size=1' -Headers @{} -Body $null
if ($productList.Status -ne 200 -or $null -eq $productList.Json -or $productList.Json.items.Count -lt 1) {
    throw "Unable to fetch product seed. status=$($productList.Status)"
}

$seedProduct = $productList.Json.items[0]
$productId = [string]$seedProduct.productId
$productName = [string]$seedProduct.name
$productSku = [string]$seedProduct.sku
$unitPrice = [decimal]$seedProduct.unitPrice
$minOrderQty = [int]$seedProduct.minOrderQty
if ($minOrderQty -lt 1) { $minOrderQty = 1 }

# Create + approve dealer.
$dealerEmail = "notify.core.$stamp@supplychain.local"
$dealerPassword = 'Dealer@1234'
$gst = "29ABCDE$($stamp.Substring($stamp.Length - 4))F1Z5"
$phone = '9' + $stamp.Substring($stamp.Length - 9)

$regAt = (Get-Date).ToUniversalTime()
$register = Invoke-JsonApi -Method 'POST' -Url 'http://localhost:8001/api/auth/register' -Headers @{} -Body @{
    email = $dealerEmail
    password = $dealerPassword
    fullName = 'Core Notify Dealer'
    phoneNumber = $phone
    businessName = "Core Notify Biz $stamp"
    gstNumber = $gst
    tradeLicenseNo = "TLCORE$stamp"
    address = 'Core Test Address'
    city = 'Bengaluru'
    state = 'Karnataka'
    pinCode = '560001'
    isInterstate = $true
}

if ($register.Status -ne 201) {
    throw "Dealer register failed. status=$($register.Status) body=$($register.Body)"
}

$dealerId = [string]$register.Json.userId
$approveAt = (Get-Date).ToUniversalTime()
$approve = Invoke-JsonApi -Method 'PUT' -Url "http://localhost:8001/api/admin/dealers/$dealerId/approve" -Headers $adminHeaders -Body $null
if ($approve.Status -ne 200) {
    throw "Dealer approve failed. status=$($approve.Status) body=$($approve.Body)"
}

$dealerApprovedNotif = Wait-NotificationEvent -AdminToken $adminToken -Source 'identity' -Event 'dealerapproved' -ContainsText $dealerId -AfterUtc $approveAt

# Dealer login.
$dealerLogin = Invoke-JsonApi -Method 'POST' -Url 'http://localhost:8001/api/auth/login' -Headers @{} -Body @{ email = $dealerEmail; password = $dealerPassword }
if ($dealerLogin.Status -ne 200 -or [string]::IsNullOrWhiteSpace([string]$dealerLogin.Json.accessToken)) {
    throw "Dealer login failed. status=$($dealerLogin.Status) body=$($dealerLogin.Body)"
}
$dealerToken = [string]$dealerLogin.Json.accessToken
$dealerHeaders = @{ Authorization = "Bearer $dealerToken" }

# Ensure dealer has enough credit and create successful order.
Invoke-JsonApi -Method 'POST' -Url "http://localhost:8005/api/payment/dealers/$dealerId/account" -Headers $adminHeaders -Body @{ initialCreditLimit = 200000 } | Out-Null
Invoke-JsonApi -Method 'PUT' -Url "http://localhost:8005/api/payment/dealers/$dealerId/credit-limit" -Headers $adminHeaders -Body @{ creditLimit = 200000 } | Out-Null

$orderAt = (Get-Date).ToUniversalTime()
$orderCreate = Invoke-JsonApi -Method 'POST' -Url 'http://localhost:8003/api/orders' -Headers $dealerHeaders -Body @{
    paymentMode = 0
    idempotencyKey = [guid]::NewGuid().ToString()
    lines = @(
        @{
            productId = $productId
            productName = $productName
            sku = $productSku
            quantity = $minOrderQty
            unitPrice = $unitPrice
            minOrderQty = $minOrderQty
        }
    )
}

if ($orderCreate.Status -ne 201) {
    throw "Order create failed. status=$($orderCreate.Status) body=$($orderCreate.Body)"
}

$orderId = [string]$orderCreate.Json.orderId
$orderPlacedNotif = Wait-NotificationEvent -AdminToken $adminToken -Source 'order' -Event 'orderplaced' -ContainsText $orderId -AfterUtc $orderAt

# Payment/invoice event (email channel according to service rules).
$invoiceAt = (Get-Date).ToUniversalTime()
$invoice = Invoke-JsonApi -Method 'POST' -Url 'http://localhost:8005/api/payment/invoices' -Headers $adminHeaders -Body @{
    orderId = $orderId
    dealerId = $dealerId
    isInterstate = $true
    paymentMode = 0
    lines = @(
        @{
            productId = $productId
            productName = $productName
            sku = $productSku
            hsnCode = '8471'
            quantity = $minOrderQty
            unitPrice = $unitPrice
        }
    )
}

if ($invoice.Status -ne 201) {
    throw "Invoice create failed. status=$($invoice.Status) body=$($invoice.Body)"
}

$invoiceNotif = Wait-NotificationEvent -AdminToken $adminToken -Source 'payment' -Event 'invoicegenerated' -ContainsText $dealerId -AfterUtc $invoiceAt

# Dealer feed visibility check.
$dealerFeedResp = Invoke-JsonApi -Method 'GET' -Url 'http://localhost:8006/api/notifications/my' -Headers $dealerHeaders -Body $null
$dealerFeed = if ($dealerFeedResp.Status -eq 200 -and $null -ne $dealerFeedResp.Json) { if ($dealerFeedResp.Json -is [System.Array]) { $dealerFeedResp.Json } else { @($dealerFeedResp.Json) } } else { @() }

function In-DealerFeed([object[]]$feed, [string]$id) {
    if ([string]::IsNullOrWhiteSpace($id)) { return $false }
    return ($feed | Where-Object { [string]$_.notificationId -eq $id } | Measure-Object).Count -gt 0
}

$results = @(
    (Convert-Outcome -Case 'dealer_approved' -Notification (Wait-NotificationDispatchFinal -AdminToken $adminToken -Notification $dealerApprovedNotif) -IsInDealerFeed (In-DealerFeed -feed $dealerFeed -id ([string]$dealerApprovedNotif.notificationId))),
    (Convert-Outcome -Case 'order_successful_orderplaced' -Notification (Wait-NotificationDispatchFinal -AdminToken $adminToken -Notification $orderPlacedNotif) -IsInDealerFeed (In-DealerFeed -feed $dealerFeed -id ([string]$orderPlacedNotif.notificationId))),
    (Convert-Outcome -Case 'payment_invoice_generated' -Notification (Wait-NotificationDispatchFinal -AdminToken $adminToken -Notification $invoiceNotif) -IsInDealerFeed (In-DealerFeed -feed $dealerFeed -id ([string]$invoiceNotif.notificationId)))
)

Write-Output '==== CORE NOTIFICATION + EMAIL CHECK ===='
$results | Format-Table case, found, inDealerFeed, channel, status, emailed, notificationId, failureReason -AutoSize | Out-String | Write-Output

$summary = [pscustomobject]@{
    dealerId = $dealerId
    dealerEmail = $dealerEmail
    orderId = $orderId
    invoiceId = [string]$invoice.Json.invoiceId
    allFound = (($results | Where-Object { -not $_.found }).Count -eq 0)
    allInDealerFeed = (($results | Where-Object { -not $_.inDealerFeed }).Count -eq 0)
    allEmailed = (($results | Where-Object { -not $_.emailed }).Count -eq 0)
}

Write-Output '==== SUMMARY ===='
$summary | ConvertTo-Json -Depth 6 | Write-Output

$reportPath = "scripts/reports/core-notification-email-check-$stamp.json"
$payload = [pscustomobject]@{ summary = $summary; results = $results }
$payload | ConvertTo-Json -Depth 8 | Set-Content -Path $reportPath
Write-Output "REPORT_PATH=$reportPath"
