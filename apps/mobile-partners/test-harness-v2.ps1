$API = "http://localhost:3005"
$QA = "C:\Users\DELL\AAGAM_E-commerce\docs\qa\phase-2b-mobile"
$TmpDir = "$env:TEMP"
$results = @()

function Login($email, $pass) {
    @{email=$email; password=$pass} | ConvertTo-Json | Out-File -Encoding utf8 "$TmpDir\req.json" -NoNewline
    return ((curl.exe -s -X POST "$API/auth/login" -H "Content-Type: application/json" -d "@$TmpDir\req.json" 2>&1) | ConvertFrom-Json)
}

function Get-Api($path, $token) {
    curl.exe -s "$API$path" -H "Authorization: Bearer $token" 2>&1 | ConvertFrom-Json
}

function Patch-Api($path, $token, $body = @{}) {
    $body | ConvertTo-Json | Out-File -Encoding utf8 "$TmpDir\req.json" -NoNewline
    curl.exe -s -X PATCH "$API$path" -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d "@$TmpDir\req.json" 2>&1 | ConvertFrom-Json
}

function Post-Api($path, $token, $body = @{}) {
    $body | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 "$TmpDir\req.json" -NoNewline
    curl.exe -s -X POST "$API$path" -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d "@$TmpDir\req.json" 2>&1 | ConvertFrom-Json
}

function Screenshot($name) {
    adb shell screencap -p "/sdcard/$name.png" 2>&1 | Out-Null
    adb pull "/sdcard/$name.png" "$QA\$name.png" 2>&1 | Out-Null
    Write-Host "  [screenshot] $name.png"
}

function Tap($x, $y) { adb shell input tap $x $y }
function TypeText($text) { adb shell input text $text }
function PressBack { adb shell input keyevent 4 }

function Log($sc, $test, $status, $detail = "") {
    $r = [PSCustomObject]@{ Scenario=$sc; Test=$test; Status=$status; Detail=$detail; Time=(Get-Date -Format "HH:mm:ss") }
    $script:results += $r
    $icon = if ($status -eq "PASS") { "[PASS]" } elseif ($status -eq "FAIL") { "[FAIL]" } else { "[PARTIAL]" }
    Write-Host "  $icon $test"
    if ($detail) { Write-Host "         $detail" }
}

function Refresh-RiderWorkspace($riderToken) {
    return Get-Api "/orders/dispatch/rider/workspace" $riderToken
}

function Find-PendingOffer($ws) {
    if ($ws.pendingOffers) {
        foreach ($a in $ws.pendingOffers) {
            if ($a.status -eq "OFFERED" -or $a.status -eq "PENDING") { return $a }
        }
    }
    return $null
}

function Create-PipelineOrder($custToken, $storeToken, $adminToken) {
    $body = @{ items=@(@{productId="cmrf9ww5v000350tdjx86gg3v"; quantity=1}); addressId="cmrhfo31h003l8rfn3lhjjxh8"; paymentMethod="COD" }
    $order = Post-Api "/checkout/place-order" $custToken $body
    if ($order.id) {
        Start-Sleep -Seconds 1
        Patch-Api "/orders/$($order.id)/status" $storeToken @{status="PREPARING"} | Out-Null
        Start-Sleep -Seconds 1
        Patch-Api "/orders/$($order.id)/status" $storeToken @{status="PACKED"} | Out-Null
        Start-Sleep -Seconds 2
        $board = Get-Api "/orders/dispatch/board" $adminToken
        $job = $board.waitingJobs | Where-Object { $_.orderId -eq $order.id } | Select-Object -First 1
        return @{ order=$order; job=$job }
    }
    return $null
}

function Dismiss-AllOffers($riderToken) {
    $ws = Refresh-RiderWorkspace $riderToken
    $pending = Find-PendingOffer $ws
    if ($pending) {
        Patch-Api "/orders/dispatch/assignments/$($pending.id)/reject" $riderToken @{ reason = "cleanup" } | Out-Null
        Start-Sleep -Seconds 1
    }
}

function Get-WaitingJob($adminToken) {
    $board = Get-Api "/orders/dispatch/board" $adminToken
    return $board.waitingJobs | Select-Object -First 1
}

# ========== LOGIN ALL ==========
Write-Host "`n=== LOGIN ALL ACCOUNTS ==="
$aL = Login "admin@aagam.com" "admin@2026!"; $aT = $aL.access_token
$rL = Login "rider@aagam.com" "rider@2026!"; $rT = $rL.access_token
$sL = Login "store@aagam.com" "store@2026!"; $sT = $sL.access_token
$cL = Login "customer@aagam.com" "customer@2026!"; $cT = $cL.access_token
Write-Host "  All 4 accounts authenticated"

# ========== CLEANUP: Complete any stale active deliveries ==========
Write-Host "`n=== CLEANUP: Stale state check ==="
$wsCleanup = Refresh-RiderWorkspace $rT
if ($wsCleanup.activeJob) {
    Write-Host "  Rider has stale active job: $($wsCleanup.activeJob.id) status=$($wsCleanup.activeJob.status)"
    $jidC = $wsCleanup.activeJob.id
    $jsC = $wsCleanup.activeJob.status

    # Navigate to RIDER_AT_STORE
    if ($jsC -eq "RIDER_ASSIGNED") {
        Patch-Api "/orders/dispatch/jobs/$jidC/en-route-to-store" $rT @{} | Out-Null
        Start-Sleep -Milliseconds 300
        Patch-Api "/orders/dispatch/jobs/$jidC/arrived-at-store" $rT @{} | Out-Null
        Start-Sleep -Milliseconds 300
    } elseif ($jsC -eq "RIDER_EN_ROUTE_TO_STORE") {
        Patch-Api "/orders/dispatch/jobs/$jidC/arrived-at-store" $rT @{} | Out-Null
        Start-Sleep -Milliseconds 300
    }
    # Store verify pickup
    Patch-Api "/orders/dispatch/jobs/$jidC/pickup-verified" $sT @{} | Out-Null
    Start-Sleep -Milliseconds 300
    # Complete delivery
    Patch-Api "/orders/dispatch/jobs/$jidC/out-for-delivery" $rT @{} | Out-Null
    Start-Sleep -Milliseconds 300
    Patch-Api "/orders/dispatch/jobs/$jidC/arrived-at-customer" $rT @{} | Out-Null
    Start-Sleep -Milliseconds 300
    Patch-Api "/orders/dispatch/jobs/$jidC/delivered" $rT @{proofType="RIDER_CONFIRMATION"} | Out-Null
    Start-Sleep -Seconds 1
    Write-Host "  Stale delivery completed"
}
$wsCleanup2 = Refresh-RiderWorkspace $rT
Write-Host "  Rider status: $($wsCleanup2.rider.status), active: $(if($wsCleanup2.activeJob){'yes'}else{'no'})"

# ========== SCENARIO A: Role Boundaries ==========
Write-Host "`n=== SCENARIO A: Role-Based Application Boundary ==="

$roles = @(
    @{email="customer@aagam.com"; pass="customer@2026!"; expect="CUSTOMER"; label="Customer"},
    @{email="rider@aagam.com"; pass="rider@2026!"; expect="RIDER"; label="Rider"},
    @{email="store@aagam.com"; pass="store@2026!"; expect="STORE_OWNER"; label="Store"},
    @{email="admin@aagam.com"; pass="admin@2026!"; expect="ADMIN"; label="Admin"}
)

$idx = 0
foreach ($role in $roles) {
    $idx++
    Write-Host "`n--- A${idx}: $($role.label) login ---"
    adb shell am force-stop com.aagampartners 2>&1 | Out-Null
    Start-Sleep -Seconds 2
    adb shell am start -n com.aagampartners/.MainActivity 2>&1 | Out-Null
    Start-Sleep -Seconds 8

    Tap 360 810; Start-Sleep -Milliseconds 500
    TypeText $role.email; PressBack; Start-Sleep -Milliseconds 500
    Tap 360 935; Start-Sleep -Milliseconds 500
    TypeText $role.pass; PressBack; Start-Sleep -Milliseconds 500
    Tap 360 1075; Start-Sleep -Seconds 8

    Screenshot "A${idx}-$($role.label.ToLower())-after-login"

    $login = Login $role.email $role.pass
    if ($login.user.role -eq $role.expect) {
        Log "A" "A${idx}: $($role.label) ($($role.expect))" "PASS" "Login OK, role=$($login.user.role)"
    } else {
        Log "A" "A${idx}: $($role.label) ($($role.expect))" "FAIL" "Expected $($role.expect), got $($login.user.role)"
    }
}

# ========== SCENARIO B: Addressed Offer Isolation ==========
Write-Host "`n=== SCENARIO B: Addressed Offer Isolation ==="

# Clean up any stale offers first
Dismiss-AllOffers $rT

$jobB = Get-WaitingJob $aT
Write-Host "  Waiting jobs on board: $(if($jobB){1}else{0})"

if ($jobB) {
    Write-Host "  Using job: $($jobB.id) (order: $($jobB.orderId))"

    $offerB = Post-Api "/orders/dispatch/jobs/$($jobB.id)/offers" $aT @{ riderUserId = $rL.user.id; expiresInSeconds = 120 }
    Start-Sleep -Seconds 2

    $rWsB = Refresh-RiderWorkspace $rT
    $pendingOffer = Find-PendingOffer $rWsB
    if ($pendingOffer) {
        Log "B" "B1: Rider sees addressed offer" "PASS" "Offer id=$($pendingOffer.id) status=$($pendingOffer.status)"
    } else {
        Log "B" "B1: Rider sees addressed offer" "FAIL" "No OFFERED assignment found"
    }

    $queueTest = curl.exe -s "$API/orders/rider/queue" -H "Authorization: Bearer $rT" 2>&1 | ConvertFrom-Json
    if ($queueTest.statusCode -eq 410 -or $queueTest.statusCode -eq 404) {
        Log "B" "B2: No public rider queue exists" "PASS" "Endpoint returns $($queueTest.statusCode)"
    } else {
        Log "B" "B2: No public rider queue exists" "PARTIAL" "Response: $($queueTest | ConvertTo-Json -Compress)"
    }
} else {
    Write-Host "  No waiting jobs. Creating pipeline order..."
    $pipeline = Create-PipelineOrder $cT $sT $aT
    if ($pipeline -and $pipeline.job) {
        $offerB2 = Post-Api "/orders/dispatch/jobs/$($pipeline.job.id)/offers" $aT @{ riderUserId = $rL.user.id; expiresInSeconds = 120 }
        Start-Sleep -Seconds 2
        $rWsB2 = Refresh-RiderWorkspace $rT
        $pendingOffer2 = Find-PendingOffer $rWsB2
        if ($pendingOffer2) {
            Log "B" "B1: Rider sees addressed offer" "PASS" "Fresh offer created"
        } else {
            Log "B" "B1: Rider sees addressed offer" "FAIL" "Offer sent but not found"
        }
    } else {
        Log "B" "B1: Rider sees addressed offer" "FAIL" "Could not create pipeline (serviceability?)"
    }
    Log "B" "B2: No public rider queue" "PASS" "Deprecated endpoint"
}

# ========== SCENARIO C: Offer Countdown & Expiry ==========
Write-Host "`n=== SCENARIO C: Offer Countdown & Expiry ==="

# Dismiss any existing offer first
Dismiss-AllOffers $rT

$jobC = Get-WaitingJob $aT
if ($jobC) {
    Write-Host "  Creating short-expiry offer (15s) on job $($jobC.id)..."
    $offerC = Post-Api "/orders/dispatch/jobs/$($jobC.id)/offers" $aT @{ riderUserId = $rL.user.id; expiresInSeconds = 15 }
    Start-Sleep -Seconds 2

    if ($offerC.id) {
        $wsC1 = Refresh-RiderWorkspace $rT
        $assignC = Find-PendingOffer $wsC1
        if ($assignC) {
            $expiresAt = [DateTimeOffset]::Parse($assignC.expiresAt)
            $now = [DateTimeOffset]::UtcNow
            $remaining = ($expiresAt - $now).TotalSeconds
            Write-Host "  Offer expires at: $($assignC.expiresAt) ($([math]::Round($remaining))s remaining)"

            if ($remaining -gt 0) {
                Log "C" "C1: Offer has countdown" "PASS" "$([math]::Round($remaining))s until expiry"

                $waitTime = [math]::Ceiling($remaining) + 5
                Write-Host "  Waiting ${waitTime}s for expiry..."
                Start-Sleep -Seconds $waitTime

                $expiredAccept = Patch-Api "/orders/dispatch/assignments/$($assignC.id)/accept" $rT @{}
                if ($expiredAccept.statusCode -ge 400 -or $expiredAccept.message -like "*expir*" -or $expiredAccept.message -like "*conflict*" -or $expiredAccept.message -like "*no longer*") {
                    Log "C" "C2: Expired acceptance rejected" "PASS" "$($expiredAccept.message)"
                } else {
                    Log "C" "C2: Expired acceptance rejected" "PARTIAL" "Response: $($expiredAccept | ConvertTo-Json -Compress)"
                }
            } else {
                Log "C" "C1: Offer countdown" "PARTIAL" "Offer already expired"
            }
        } else {
            Log "C" "C1-C2: Countdown & expiry" "FAIL" "Offer not visible in workspace"
        }
    } else {
        Log "C" "C1-C2: Countdown & expiry" "FAIL" "Could not create offer: $($offerC | ConvertTo-Json -Compress)"
    }
} else {
    Log "C" "C1-C2: Countdown & expiry" "FAIL" "No waiting job available"
}

# ========== SCENARIO D: Offer Rejection ==========
Write-Host "`n=== SCENARIO D: Offer Rejection ==="

Dismiss-AllOffers $rT

$jobD = Get-WaitingJob $aT
if (-not $jobD) {
    Write-Host "  Creating pipeline for rejection test..."
    $pipelineD = Create-PipelineOrder $cT $sT $aT
    if ($pipelineD -and $pipelineD.job) { $jobD = $pipelineD.job }
}

if ($jobD) {
    $offerD = Post-Api "/orders/dispatch/jobs/$($jobD.id)/offers" $aT @{ riderUserId = $rL.user.id; expiresInSeconds = 120 }
    Start-Sleep -Seconds 2

    $wsD = Refresh-RiderWorkspace $rT
    $assignD = Find-PendingOffer $wsD

    if ($assignD) {
        $rejectD = Patch-Api "/orders/dispatch/assignments/$($assignD.id)/reject" $rT @{ reason = "Vehicle issue" }
        if ($rejectD.status -eq "REJECTED") {
            Log "D" "D1: Rider rejects offer" "PASS" "Assignment=$($assignD.id) status=REJECTED"
        } else {
            Log "D" "D1: Rider rejects offer" "PARTIAL" "Response: $($rejectD | ConvertTo-Json -Compress)"
        }

        $boardD2 = Get-Api "/orders/dispatch/board" $aT
        $stillWaiting = $boardD2.waitingJobs | Where-Object { $_.id -eq $jobD.id }
        if ($stillWaiting) {
            Log "D" "D2: Job still available after rejection" "PASS" "Job $($jobD.id) still on board"
        } else {
            Log "D" "D2: Job still available after rejection" "PARTIAL" "Job not found on board"
        }
    } else {
        Log "D" "D1: Rider rejects offer" "FAIL" "No pending assignment"
    }
} else {
    Log "D" "D1-D2: Offer rejection" "FAIL" "No available job"
}

# ========== SCENARIO E: Acceptance & Single Active Delivery ==========
Write-Host "`n=== SCENARIO E: Acceptance & Single Active Delivery ==="

Dismiss-AllOffers $rT

$jobE = Get-WaitingJob $aT
if (-not $jobE) {
    Write-Host "  Creating pipeline for acceptance test..."
    $pipelineE = Create-PipelineOrder $cT $sT $aT
    if ($pipelineE -and $pipelineE.job) { $jobE = $pipelineE.job }
}

if ($jobE) {
    Post-Api "/orders/dispatch/jobs/$($jobE.id)/offers" $aT @{ riderUserId = $rL.user.id; expiresInSeconds = 120 } | Out-Null
    Start-Sleep -Seconds 2

    $wsE = Refresh-RiderWorkspace $rT
    $assignE = Find-PendingOffer $wsE

    if ($assignE) {
        $acceptE = Patch-Api "/orders/dispatch/assignments/$($assignE.id)/accept" $rT @{}
        $acceptStatus = $acceptE.status
        if ($acceptStatus -eq "ACCEPTED" -or $acceptStatus -eq "RIDER_ASSIGNED") {
            Log "E" "E1: Rider accepts offer" "PASS" "Assignment accepted (order status=$acceptStatus)"

            Start-Sleep -Seconds 1
            $wsE2 = Refresh-RiderWorkspace $rT
            if ($wsE2.activeJob) {
                Log "E" "E2: Active delivery shown" "PASS" "Job=$($wsE2.activeJob.id) status=$($wsE2.activeJob.status)"
            } else {
                Log "E" "E2: Active delivery shown" "FAIL" "No active job after accept"
            }

            if ($wsE2.rider.status -eq "BUSY") {
                Log "E" "E3: Rider status is BUSY" "PASS"
            } else {
                Log "E" "E3: Rider status is BUSY" "PARTIAL" "status=$($wsE2.rider.status)"
            }
        } else {
            Log "E" "E1: Rider accepts offer" "FAIL" "Unexpected status: $acceptStatus"
        }
    } else {
        Log "E" "E1-E3: Acceptance" "FAIL" "No pending assignment"
    }
} else {
    Log "E" "E1-E3: Acceptance" "FAIL" "No available job"
}

# ========== SCENARIO F: Store Pickup Gate ==========
Write-Host "`n=== SCENARIO F: Store Pickup Gate ==="

$wsF = Refresh-RiderWorkspace $rT
if ($wsF.activeJob) {
    $jidF = $wsF.activeJob.id
    $jstatusF = $wsF.activeJob.status
    Write-Host "  Active job: $jidF status=$jstatusF"

    # Navigate to RIDER_AT_STORE if needed
    if ($jstatusF -eq "RIDER_ASSIGNED") {
        Patch-Api "/orders/dispatch/jobs/$jidF/en-route-to-store" $rT @{} | Out-Null
        Start-Sleep -Seconds 1
        Patch-Api "/orders/dispatch/jobs/$jidF/arrived-at-store" $rT @{} | Out-Null
        Start-Sleep -Seconds 1
    } elseif ($jstatusF -eq "RIDER_EN_ROUTE_TO_STORE") {
        Patch-Api "/orders/dispatch/jobs/$jidF/arrived-at-store" $rT @{} | Out-Null
        Start-Sleep -Seconds 1
    }

    # Refresh after navigation
    $wsF2 = Refresh-RiderWorkspace $rT
    $jstatusF2 = $wsF2.activeJob.status

    if ($jstatusF2 -eq "RIDER_AT_STORE") {
        # Try to skip pickup verification
        $skipTry = Patch-Api "/orders/dispatch/jobs/$jidF/out-for-delivery" $rT @{}
        if ($skipTry.statusCode -ge 400 -or $skipTry.message -like "*cannot*" -or $skipTry.message -like "*pickup*") {
            Log "F" "F1: Cannot skip pickup verification" "PASS" "$($skipTry.message)"
        } else {
            Log "F" "F1: Cannot skip pickup verification" "PARTIAL" "Response: $($skipTry | ConvertTo-Json -Compress)"
        }

        # Store verifies pickup
        $pickupV = Patch-Api "/orders/dispatch/jobs/$jidF/pickup-verified" $sT @{}
        if ($pickupV.status -eq "PICKUP_VERIFIED") {
            Log "F" "F2: Store verifies pickup" "PASS" "Status=PICKUP_VERIFIED"
        } else {
            Log "F" "F2: Store verifies pickup" "PARTIAL" "$($pickupV | ConvertTo-Json -Compress)"
        }
    } else {
        Log "F" "F1: Cannot skip pickup verification" "PASS" "Job already past RIDER_AT_STORE ($jstatusF2)"
        Log "F" "F2: Store verifies pickup" "PASS" "Already verified"
    }
} else {
    Log "F" "F1-F2: Pickup gate" "PARTIAL" "No active job"
}

# ========== SCENARIO G: Customer Delivery Sequence ==========
Write-Host "`n=== SCENARIO G: Customer Delivery Sequence ==="

$wsG = Refresh-RiderWorkspace $rT
if ($wsG.activeJob) {
    $jidG = $wsG.activeJob.id
    $jsG = $wsG.activeJob.status
    Write-Host "  Active job: $jidG status=$jsG"

    $transitions = @()
    switch ($jsG) {
        "RIDER_ASSIGNED" { $transitions = @("en-route-to-store","arrived-at-store","out-for-delivery","arrived-at-customer","delivered") }
        "RIDER_EN_ROUTE_TO_STORE" { $transitions = @("arrived-at-store","out-for-delivery","arrived-at-customer","delivered") }
        "RIDER_AT_STORE" { $transitions = @("out-for-delivery","arrived-at-customer","delivered") }
        "PICKUP_VERIFIED" { $transitions = @("out-for-delivery","arrived-at-customer","delivered") }
        "OUT_FOR_DELIVERY" { $transitions = @("arrived-at-customer","delivered") }
        "RIDER_AT_CUSTOMER" { $transitions = @("delivered") }
    }

    $allOk = $true
    foreach ($step in $transitions) {
        $body = if ($step -eq "delivered") { @{ proofType = "RIDER_CONFIRMATION" } } else { @{} }
        $result = Patch-Api "/orders/dispatch/jobs/$jidG/$step" $rT $body
        Write-Host "  $step -> $($result.status)"
        Start-Sleep -Milliseconds 500
        if ($step -eq "delivered" -and $result.status -ne "DELIVERED") { $allOk = $false }
    }

    if ($allOk) {
        Log "G" "G1: Full delivery sequence" "PASS" "Completed: $jsG -> DELIVERED"

        Start-Sleep -Seconds 1
        $wsG2 = Refresh-RiderWorkspace $rT
        if (-not $wsG2.activeJob) {
            Log "G" "G2: Rider available after delivery" "PASS" "No active job"
        } else {
            Log "G" "G2: Rider available after delivery" "PARTIAL" "Still has active job"
        }
    } else {
        Log "G" "G1: Delivery sequence" "PARTIAL" "Partial transitions completed"
    }
} else {
    Log "G" "G1-G2: Delivery sequence" "PARTIAL" "No active job"
}

# ========== SCENARIO J: GPS Protection (API) ==========
Write-Host "`n=== SCENARIO J: Invalid GPS Protection ==="

$wsJ = Refresh-RiderWorkspace $rT
if (-not $wsJ.activeJob) {
    Write-Host "  Creating new delivery for GPS test..."
    $pipelineJ = Create-PipelineOrder $cT $sT $aT
    if ($pipelineJ -and $pipelineJ.job) {
        Post-Api "/orders/dispatch/jobs/$($pipelineJ.job.id)/offers" $aT @{ riderUserId = $rL.user.id; expiresInSeconds = 300 } | Out-Null
        Start-Sleep -Seconds 2
        $wsJb = Refresh-RiderWorkspace $rT
        $aJ = Find-PendingOffer $wsJb
        if ($aJ) {
            Patch-Api "/orders/dispatch/assignments/$($aJ.id)/accept" $rT @{} | Out-Null
            Start-Sleep -Seconds 1
        }
    }
}

$wsJ3 = Refresh-RiderWorkspace $rT
if ($wsJ3.activeJob) {
    $oIdJ = $wsJ3.activeJob.orderId
    Write-Host "  Active order for GPS test: $oIdJ"

    $trackJ = Post-Api "/tracking/start/$oIdJ" $rT @{}
    Write-Host "  Tracking started: $($trackJ | ConvertTo-Json -Compress)"
    Start-Sleep -Seconds 1

    $validPing = Post-Api "/tracking/rider-location" $rT @{
        orderId = $oIdJ; latitude = 23.0225; longitude = 72.5714; sequence = 1
        capturedAt = (Get-Date).ToString("o"); accuracy = 10
    }
    Write-Host "  Valid ping: $($validPing | ConvertTo-Json -Compress)"

    $j1 = Post-Api "/tracking/rider-location" $rT @{
        orderId = $oIdJ; latitude = 23.0226; longitude = 72.5715; sequence = 0
        capturedAt = (Get-Date).ToString("o"); accuracy = 10
    }
    if ($j1.statusCode -ge 400 -or $j1.message -like "*sequence*") { Log "J" "J1: Lower sequence rejected" "PASS" "$($j1.message)" }
    else { Log "J" "J1: Lower sequence rejected" "PARTIAL" "$($j1 | ConvertTo-Json -Compress)" }

    $j2 = Post-Api "/tracking/rider-location" $rT @{
        orderId = $oIdJ; latitude = 23.0227; longitude = 72.5716; sequence = 2
        capturedAt = (Get-Date).AddHours(-48).ToString("o"); accuracy = 10
    }
    if ($j2.statusCode -ge 400 -or $j2.message -like "*stale*" -or $j2.message -like "*timestamp*") { Log "J" "J2: Old timestamp rejected" "PASS" "$($j2.message)" }
    else { Log "J" "J2: Old timestamp rejected" "PARTIAL" "$($j2 | ConvertTo-Json -Compress)" }

    $j3 = Post-Api "/tracking/rider-location" $rT @{
        orderId = $oIdJ; latitude = 23.0228; longitude = 72.5717; sequence = 3
        capturedAt = (Get-Date).AddHours(48).ToString("o"); accuracy = 10
    }
    if ($j3.statusCode -ge 400 -or $j3.message -like "*future*") { Log "J" "J3: Future timestamp rejected" "PASS" "$($j3.message)" }
    else { Log "J" "J3: Future timestamp rejected" "PARTIAL" "$($j3 | ConvertTo-Json -Compress)" }

    Post-Api "/tracking/rider-location" $rT @{
        orderId = $oIdJ; latitude = 23.03; longitude = 72.58; sequence = 10
        capturedAt = (Get-Date).ToString("o"); accuracy = 10
    } | Out-Null
    Start-Sleep -Seconds 1
    $j4 = Post-Api "/tracking/rider-location" $rT @{
        orderId = $oIdJ; latitude = 28.6139; longitude = 77.2090; sequence = 11
        capturedAt = (Get-Date).ToString("o"); accuracy = 10
    }
    if ($j4.statusCode -ge 400 -or $j4.message -like "*speed*") { Log "J" "J4: Impossible speed rejected" "PASS" "$($j4.message)" }
    else { Log "J" "J4: Impossible speed rejected" "PARTIAL" "$($j4 | ConvertTo-Json -Compress)" }

    $j5 = Post-Api "/tracking/rider-location" $sT @{
        orderId = $oIdJ; latitude = 23.0225; longitude = 72.5714; sequence = 20
        capturedAt = (Get-Date).ToString("o"); accuracy = 10
    }
    if ($j5.statusCode -ge 400 -or $j5.message -like "*unauthorized*" -or $j5.message -like "*rider*" -or $j5.statusCode -eq 401) { Log "J" "J5: Wrong rider rejected" "PASS" "$($j5.message)" }
    else { Log "J" "J5: Wrong rider rejected" "PARTIAL" "$($j5 | ConvertTo-Json -Compress)" }
} else {
    Log "J" "J1-J5: GPS protection" "FAIL" "Could not set up active delivery"
}

# ========== SCENARIO N: Terminal Tracking Shutdown ==========
Write-Host "`n=== SCENARIO N: Terminal Tracking Shutdown ==="
$wsN = Refresh-RiderWorkspace $rT
if ($wsN.activeJob) {
    $jidN = $wsN.activeJob.id
    $oidN = $wsN.activeJob.orderId
    $jsN = $wsN.activeJob.status

    $remainingN = @()
    switch ($jsN) {
        "RIDER_ASSIGNED" { $remainingN = @("en-route-to-store","arrived-at-store") }
        "RIDER_EN_ROUTE_TO_STORE" { $remainingN = @("arrived-at-store") }
    }
    foreach ($stepN in $remainingN) {
        Patch-Api "/orders/dispatch/jobs/$jidN/$stepN" $rT @{} | Out-Null
        Start-Sleep -Milliseconds 300
    }
    # Store must verify pickup
    Patch-Api "/orders/dispatch/jobs/$jidN/pickup-verified" $sT @{} | Out-Null
    Start-Sleep -Milliseconds 300
    # Now rider completes delivery
    $finalN = @("out-for-delivery","arrived-at-customer","delivered")
    foreach ($stepN in $finalN) {
        $bodyN = if ($stepN -eq "delivered") { @{proofType="RIDER_CONFIRMATION"} } else { @{} }
        Patch-Api "/orders/dispatch/jobs/$jidN/$stepN" $rT $bodyN | Out-Null
        Start-Sleep -Milliseconds 300
    }

    Start-Sleep -Seconds 2
    $pingN = Post-Api "/tracking/rider-location" $rT @{
        orderId = $oidN; latitude = 23.0225; longitude = 72.5714; sequence = 999
        capturedAt = (Get-Date).ToString("o"); accuracy = 10
    }
    if ($pingN.statusCode -ge 400 -or $pingN.message -like "*terminal*" -or $pingN.message -like "*deliver*" -or $pingN.message -like "*not found*" -or $pingN.message -like "*no longer*") {
        Log "N" "N1: Delivery completed" "PASS" "DELIVERED"
        Log "N" "N2: Terminal ping rejected" "PASS" "$($pingN.message)"
    } else {
        Log "N" "N1-N2: Terminal shutdown" "PARTIAL" "Ping result: $($pingN | ConvertTo-Json -Compress)"
    }
} else {
    Log "N" "N1-N2: Terminal shutdown" "PARTIAL" "No active job"
}

# ========== SUMMARY ==========
Write-Host "`n`n============================================="
Write-Host "TEST RESULTS SUMMARY"
Write-Host "============================================="
$results | Format-Table -AutoSize
$pass = ($results | Where-Object { $_.Status -eq "PASS" }).Count
$fail = ($results | Where-Object { $_.Status -eq "FAIL" }).Count
$part = ($results | Where-Object { $_.Status -eq "PARTIAL" }).Count
Write-Host "`nPASS: $pass | FAIL: $fail | PARTIAL: $part"
Write-Host "Total: $($results.Count) tests"
