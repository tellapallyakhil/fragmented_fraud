// ============================================================================
// BEHAVIORAL BIOMETRICS & PRE-TRANSACTION TELEMETRY ENGINE
// Sub-second telemetry evaluation (BioCatch & Sift standard for APP fraud)
// ============================================================================

export interface KeystrokeEvent {
    key: string;
    pressTime: number;  // timestamp of keyDown
    releaseTime: number; // timestamp of keyUp
}

export interface ClientTelemetryPayload {
    isPasted: boolean;
    pasteTimestamp?: number;
    typingFlightTimes: number[]; // Time between releasing key N and pressing key N+1
    typingDwellTimes: number[];  // Time key was held down (release - press)
    hesitationDurationMs: number; // Idle time before clicking transfer
    mouseMovementsCount: number;
    coordinates?: {
        latitude: number;
        longitude: number;
    };
    clientIp?: string;
    userAgent?: string;
}

export interface TelemetryRiskAssessment {
    riskScore: number; // 0 to 100
    isBotAutomated: boolean;
    isPastedScamIndicator: boolean;
    impossibleTravelSpeedKmH?: number;
    isImpossibleTravel: boolean;
    reasons: string[];
}

// ----------------------------------------------------------------------------
// 1. HAVERSINE FORMULA FOR GEOGRAPHIC DISTANCE (Impossible Travel Speed)
// ----------------------------------------------------------------------------
export function calculateHaversineDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function evaluateImpossibleTravel(
    prevLoc: { lat: number; lon: number; timestamp: number },
    currentLoc: { lat: number; lon: number; timestamp: number }
): { speedKmH: number; isImpossible: boolean } {
    const distanceKm = calculateHaversineDistanceKm(
        prevLoc.lat,
        prevLoc.lon,
        currentLoc.lat,
        currentLoc.lon
    );

    const timeDeltaHours = Math.max((currentLoc.timestamp - prevLoc.timestamp) / (1000 * 60 * 60), 0.001);
    const speed = distanceKm / timeDeltaHours;

    // Commercial aircraft travel at ~800-900 km/h.
    // Anything > 800 km/h without multi-hour transit window is a VPN or ATO hijack.
    return {
        speedKmH: Math.round(speed),
        isImpossible: speed > 800 && distanceKm > 200
    };
}

// ----------------------------------------------------------------------------
// 2. KEYSTROKE DYNAMICS & CADENCE ENTROPY EVALUATOR
// Distinguishes human typing cadence (jitter + variance) from scripted bots
// ----------------------------------------------------------------------------
export function evaluateKeystrokeDynamics(
    flightTimes: number[],
    dwellTimes: number[]
): { isBot: boolean; entropyScore: number; averageFlightTimeMs: number } {
    if (flightTimes.length < 3) {
        return { isBot: false, entropyScore: 1.0, averageFlightTimeMs: 120 };
    }

    const avgFlight = flightTimes.reduce((a, b) => a + b, 0) / flightTimes.length;
    
    // Variance calculation
    const variance = flightTimes.reduce((sum, val) => sum + Math.pow(val - avgFlight, 2), 0) / flightTimes.length;
    const stdDev = Math.sqrt(variance);

    // Bots have unnaturally low standard deviation (e.g. < 5ms variance) or uniform zero-delays (< 10ms)
    const isBot = (stdDev < 6 && flightTimes.length > 5) || (avgFlight < 15);

    return {
        isBot,
        entropyScore: Math.min(stdDev / 50, 1.0),
        averageFlightTimeMs: Math.round(avgFlight)
    };
}

// ----------------------------------------------------------------------------
// 3. MASTER TELEMETRY EVALUATOR
// ----------------------------------------------------------------------------
export function assessBehavioralTelemetry(
    telemetry?: Partial<ClientTelemetryPayload>,
    previousTransactionLoc?: { lat: number; lon: number; timestamp: number }
): TelemetryRiskAssessment {
    let riskScore = 0;
    const reasons: string[] = [];
    let isBotAutomated = false;
    let isPastedScamIndicator = false;
    let isImpossibleTravel = false;
    let speedKmH: number | undefined;

    if (!telemetry) {
        return {
            riskScore: 10,
            isBotAutomated: false,
            isPastedScamIndicator: false,
            isImpossibleTravel: false,
            reasons: ['DEFAULT_TELEMETRY_FALLBACK']
        };
    }

    // 1. Check Clipboard Paste in Recipient Field (Strong indicator of telephone/social engineering APP fraud)
    if (telemetry.isPasted) {
        riskScore += 35;
        isPastedScamIndicator = true;
        reasons.push('PASTE_ATTACK_APP_FRAUD (Recipient account number was pasted from external clipboard/scam instruction)');
    }

    // 2. Check Keystroke Dynamics
    if (telemetry.typingFlightTimes && telemetry.typingFlightTimes.length > 0) {
        const dynamics = evaluateKeystrokeDynamics(
            telemetry.typingFlightTimes,
            telemetry.typingDwellTimes || []
        );

        if (dynamics.isBot) {
            riskScore += 45;
            isBotAutomated = true;
            reasons.push('AUTOMATED_SCRIPT_BOT_CADENCE (Sub-human key flight variance detected)');
        }
    }

    // 3. Check Hesitation Markers
    if (telemetry.hesitationDurationMs && telemetry.hesitationDurationMs > 60000) { // > 1 min hesitation
        riskScore += 15;
        reasons.push('HIGH_STRESS_HESITATION_BURST (Prolonged dwell time before authorization)');
    }

    // 4. Check Impossible Travel
    if (telemetry.coordinates && previousTransactionLoc) {
        const travelResult = evaluateImpossibleTravel(
            previousTransactionLoc,
            {
                lat: telemetry.coordinates.latitude,
                lon: telemetry.coordinates.longitude,
                timestamp: Date.now()
            }
        );

        speedKmH = travelResult.speedKmH;
        if (travelResult.isImpossible) {
            riskScore += 50;
            isImpossibleTravel = true;
            reasons.push(`IMPOSSIBLE_TRAVEL_VELOCITY (${travelResult.speedKmH} km/h detected between geographic coordinates)`);
        }
    }

    return {
        riskScore: Math.min(riskScore, 100),
        isBotAutomated,
        isPastedScamIndicator,
        impossibleTravelSpeedKmH: speedKmH,
        isImpossibleTravel,
        reasons
    };
}
