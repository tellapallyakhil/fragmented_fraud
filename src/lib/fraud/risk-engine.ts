// ============================================================================
// MULTI-VECTOR EXPLAINABLE RISK ENGINE & INTERVENTION ORCHESTRATOR
// Combines Graph, Velocity, Biometrics, Structuring, and Sanctions
// ============================================================================

import { screenAgainstSanctionsWatchlist, WatchlistMatchResult } from './sanctions-screening';
import { assessBehavioralTelemetry, ClientTelemetryPayload, TelemetryRiskAssessment } from './behavioral-telemetry';
import { detectRapidDrainMules, detectDeviceSyndicates } from './knowledge-graph';

export type RiskAction = 'APPROVE' | 'STEP_UP_CHALLENGE' | 'COOLING_OFF_QUARANTINE' | 'AUTO_FREEZE_BLAST_RADIUS';

export interface EvaluationInput {
    senderAccountId: string;
    senderAccountNumber: string;
    senderProfileName?: string;
    recipientAccountNumber: string;
    recipientProfileName?: string;
    amount: number;
    accountBalance: number;
    historicalTransactions: any[];
    telemetry?: Partial<ClientTelemetryPayload>;
    previousLocation?: { lat: number; lon: number; timestamp: number };
}

export interface ExplainableRiskResult {
    overallRiskScore: number; // 0 to 100
    riskAction: RiskAction;
    isFrozen: boolean;
    vectorBreakdown: {
        graphRiskScore: number;
        velocityRiskScore: number;
        telemetryRiskScore: number;
        sanctionsRiskScore: number;
        structuringRiskScore: number;
    };
    reasonCodes: string[];
    sanctionsCheck: WatchlistMatchResult;
    telemetryCheck: TelemetryRiskAssessment;
    fincenSarRequired: boolean;
}

// ----------------------------------------------------------------------------
// 1. STATUTORY STRUCTURING / SMURFING DETECTOR (PAN & AML Threshold Clustered)
// Detects multiple transfers placed just below statutory limit (e.g. ₹50,000 / $10,000)
// ----------------------------------------------------------------------------
export function evaluateStructuringRisk(
    currentAmount: number,
    recentTransactions: any[],
    statutoryThreshold: number = 50000,
    windowHours: number = 24
): { score: number; isStructuring: boolean; reason?: string } {
    const lowerBound = statutoryThreshold * 0.85; // e.g. ₹42,500
    const upperBound = statutoryThreshold * 0.999; // e.g. ₹49,999

    const isCurrentNearThreshold = currentAmount >= lowerBound && currentAmount <= upperBound;

    const windowMs = windowHours * 60 * 60 * 1000;
    const now = Date.now();

    const clusterTxs = recentTransactions.filter(tx => {
        const txTime = new Date(tx.timestamp).getTime();
        return (now - txTime <= windowMs) && (tx.amount >= lowerBound && tx.amount <= upperBound);
    });

    const totalClusterCount = clusterTxs.length + (isCurrentNearThreshold ? 1 : 0);

    if (totalClusterCount >= 2) {
        return {
            score: Math.min(60 + (totalClusterCount * 15), 100),
            isStructuring: true,
            reason: `AML_STRUCTURING_PATTERN (${totalClusterCount} transfers clustered near statutory limit of ₹${statutoryThreshold.toLocaleString('en-IN')})`
        };
    }

    if (isCurrentNearThreshold) {
        return { score: 35, isStructuring: false, reason: 'NEAR_AML_THRESHOLD_SINGLE' };
    }

    return { score: 0, isStructuring: false };
}

// ----------------------------------------------------------------------------
// 2. MASTER MULTI-VECTOR EVALUATION ENGINE
// ----------------------------------------------------------------------------
export function evaluateComprehensiveRisk(input: EvaluationInput): ExplainableRiskResult {
    const reasonCodes: string[] = [];

    // --- VECTOR 1: SANCTIONS & PEP SCREENING (20% Weight) ---
    const recipientName = input.recipientProfileName || input.recipientAccountNumber;
    const sanctionsCheck = screenAgainstSanctionsWatchlist(recipientName);

    let sanctionsScore = 0;
    if (sanctionsCheck.matched) {
        if (sanctionsCheck.isSanctioned) {
            sanctionsScore = 100;
            reasonCodes.push(`SANCTIONS_WATCHLIST_HIT (Beneficiary matched ${sanctionsCheck.matchedEntity?.program}: ${sanctionsCheck.matchedName} with ${(sanctionsCheck.confidenceScore * 100)}% confidence)`);
        } else {
            sanctionsScore = 50;
            reasonCodes.push(`PEP_POLITICALLY_EXPOSED_PERSON (Enhanced Due Diligence required for ${sanctionsCheck.matchedName})`);
        }
    }

    // --- VECTOR 2: BEHAVIORAL BIOMETRICS & TELEMETRY (25% Weight) ---
    const telemetryCheck = assessBehavioralTelemetry(input.telemetry, input.previousLocation);
    const telemetryScore = telemetryCheck.riskScore;
    reasonCodes.push(...telemetryCheck.reasons);

    // --- VECTOR 3: GRAPH & MULE DETECTIONS (30% Weight) ---
    let graphScore = 0;
    const rapidDrains = detectRapidDrainMules(input.historicalTransactions);
    const matchingDrain = rapidDrains.find(d => d.muleAccountId === input.senderAccountNumber || d.muleAccountId === input.senderAccountId);

    if (matchingDrain) {
        graphScore = 90;
        reasonCodes.push(`MULE_RAPID_DRAIN_PATTERN (Account drained ${(matchingDrain.drainRatio * 100)}% of fresh inflow within ${matchingDrain.timeDeltaSeconds}s)`);
    }

    // Check device farm / syndicate
    const syndicates = detectDeviceSyndicates(input.historicalTransactions);
    const deviceSyndicate = input.telemetry?.userAgent ? syndicates.find(s => s.associatedAccountNumbers.includes(input.senderAccountNumber)) : undefined;

    if (deviceSyndicate) {
        graphScore = Math.max(graphScore, deviceSyndicate.riskScore);
        reasonCodes.push(`DEVICE_COLLUSION_SYNDICATE (${deviceSyndicate.associatedAccountNumbers.length} bank accounts operated on same hardware footprint)`);
    }

    // --- VECTOR 4: STRUCTURING & STATUTORY LIMITS (15% Weight) ---
    const structuring = evaluateStructuringRisk(input.amount, input.historicalTransactions);
    const structuringScore = structuring.score;
    if (structuring.reason) reasonCodes.push(structuring.reason);

    // --- VECTOR 5: BALANCE DRAIN & DORMANT AWAKENING (10% Weight) ---
    let velocityScore = 0;
    const balanceDrainRatio = input.accountBalance > 0 ? (input.amount / input.accountBalance) : 1.0;
    if (balanceDrainRatio >= 0.90 && input.amount >= 20000) {
        velocityScore = 70;
        reasonCodes.push(`HIGH_BALANCE_DEPLETION (${Math.round(balanceDrainRatio * 100)}% of total balance transferred in single transaction)`);
    }

    // --- COMPOSITE WEIGHTED SCORE ---
    const compositeScore = Math.round(
        (graphScore * 0.30) +
        (telemetryScore * 0.25) +
        (sanctionsScore * 0.20) +
        (structuringScore * 0.15) +
        (velocityScore * 0.10)
    );

    const finalScore = Math.min(Math.max(compositeScore, 0), 100);

    // --- DYNAMIC INTERVENTION LOGIC ---
    let riskAction: RiskAction = 'APPROVE';
    let isFrozen = false;
    let fincenSarRequired = false;

    if (sanctionsCheck.isSanctioned || finalScore >= 75) {
        riskAction = 'AUTO_FREEZE_BLAST_RADIUS';
        isFrozen = true;
        fincenSarRequired = true;
    } else if (finalScore >= 50) {
        riskAction = 'COOLING_OFF_QUARANTINE';
        fincenSarRequired = true;
    } else if (finalScore >= 35) {
        riskAction = 'STEP_UP_CHALLENGE';
    }

    return {
        overallRiskScore: finalScore,
        riskAction,
        isFrozen,
        vectorBreakdown: {
            graphRiskScore: graphScore,
            velocityRiskScore: velocityScore,
            telemetryRiskScore: telemetryScore,
            sanctionsRiskScore: sanctionsScore,
            structuringRiskScore: structuringScore
        },
        reasonCodes: Array.from(new Set(reasonCodes)),
        sanctionsCheck,
        telemetryCheck,
        fincenSarRequired
    };
}
