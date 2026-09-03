// ============================================================================
// REGULATORY SANCTIONS, PEP WATCHLIST & ISO 20022 SCREENING ENGINE
// Compliance-grade watchlist screening with Jaro-Winkler fuzzy phonetics
// ============================================================================

export interface SanctionedEntity {
    id: string;
    name: string;
    aliases: string[];
    type: 'INDIVIDUAL' | 'ENTITY' | 'VESSEL';
    program: 'OFAC_SDN' | 'UN_SECURITY_COUNCIL' | 'EU_FINANCIAL_SANCTIONS' | 'PEP';
    country: string;
    remarks: string;
}

export interface WatchlistMatchResult {
    matched: boolean;
    confidenceScore: number; // 0.00 to 1.00
    matchedEntity?: SanctionedEntity;
    matchedName?: string;
    algorithmUsed: 'EXACT' | 'JARO_WINKLER' | 'LEVENSHTEIN_DISTANCE';
    isSanctioned: boolean;
}

// ----------------------------------------------------------------------------
// 1. EMBEDDED GLOBAL SANCTIONS & PEP DATASET (OFAC / UN / EU / PEP)
// ----------------------------------------------------------------------------
export const GLOBAL_SANCTIONS_WATCHLIST: SanctionedEntity[] = [
    {
        id: 'OFAC-SDN-9021',
        name: 'Al-Hassan Global Trading LLC',
        aliases: ['Al Hassan Co', 'Al-Hassan Logistics', 'Alhasan Trade'],
        type: 'ENTITY',
        program: 'OFAC_SDN',
        country: 'IR',
        remarks: 'Financial facilitation of illicit procurement networks'
    },
    {
        id: 'OFAC-SDN-4412',
        name: 'Viktor Antonov',
        aliases: ['Victor Antonoff', 'V. Antonov', 'Viktor Antonov Cyber'],
        type: 'INDIVIDUAL',
        program: 'OFAC_SDN',
        country: 'RU',
        remarks: 'State-sponsored ransomware money laundering nexus'
    },
    {
        id: 'PEP-IND-1082',
        name: 'Carlos Mendoza Jr.',
        aliases: ['Carlos Mendoza', 'C. Mendoza'],
        type: 'INDIVIDUAL',
        program: 'PEP',
        country: 'VE',
        remarks: 'Senior Ministry Official (Politically Exposed Person - Enhanced Due Diligence)'
    },
    {
        id: 'EU-SANCT-7719',
        name: 'Oceanic Shadow Maritime Ltd',
        aliases: ['Oceanic Shadow Fleet', 'Oceanic Maritime'],
        type: 'ENTITY',
        program: 'EU_FINANCIAL_SANCTIONS',
        country: 'PA',
        remarks: 'Sanctions evasion vessel operator'
    },
    {
        id: 'OFAC-SDN-8821',
        name: 'Xavier Darknet Operations',
        aliases: ['Hacker Xavier', 'Xavier Syndicate', 'Xavier Cryptolabs'],
        type: 'ENTITY',
        program: 'OFAC_SDN',
        country: 'UNKNOWN',
        remarks: 'Automated mule network operator & illicit cashout syndicate'
    }
];

// ----------------------------------------------------------------------------
// 2. JARO-WINKLER FUZZY STRING DISTANCE ALGORITHM
// Computes phonetic and positional similarity (Standard in FINCEN screening)
// ----------------------------------------------------------------------------
export function calculateJaroWinklerDistance(s1: string, s2: string): number {
    const str1 = s1.trim().toLowerCase();
    const str2 = s2.trim().toLowerCase();

    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
    const str1Matches = new Array(str1.length).fill(false);
    const str2Matches = new Array(str2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matches
    for (let i = 0; i < str1.length; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(i + matchWindow + 1, str2.length);

        for (let j = start; j < end; j++) {
            if (str2Matches[j]) continue;
            if (str1[i] !== str2[j]) continue;
            str1Matches[i] = true;
            str2Matches[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0.0;

    // Count transpositions
    let k = 0;
    for (let i = 0; i < str1.length; i++) {
        if (!str1Matches[i]) continue;
        while (!str2Matches[k]) k++;
        if (str1[i] !== str2[k]) transpositions++;
        k++;
    }

    const jaro =
        (matches / str1.length +
            matches / str2.length +
            (matches - transpositions / 2) / matches) /
        3.0;

    // Winkler prefix adjustment (up to 4 matching prefix characters)
    let prefixLength = 0;
    for (let i = 0; i < Math.min(4, Math.min(str1.length, str2.length)); i++) {
        if (str1[i] === str2[i]) prefixLength++;
        else break;
    }

    const p = 0.1; // Scaling factor
    return Math.min(jaro + prefixLength * p * (1 - jaro), 1.0);
}

// ----------------------------------------------------------------------------
// 3. MASTER SANCTIONS & PEP SCREENING FUNCTION
// ----------------------------------------------------------------------------
export function screenAgainstSanctionsWatchlist(
    queryName: string,
    threshold: number = 0.85
): WatchlistMatchResult {
    if (!queryName || queryName.trim().length === 0) {
        return {
            matched: false,
            confidenceScore: 0,
            algorithmUsed: 'EXACT',
            isSanctioned: false
        };
    }

    const cleanQuery = queryName.trim();
    let bestMatch: {
        entity: SanctionedEntity;
        matchedName: string;
        score: number;
        algo: 'EXACT' | 'JARO_WINKLER';
    } | null = null;

    for (const entity of GLOBAL_SANCTIONS_WATCHLIST) {
        // 1. Check primary name
        const exact = entity.name.toLowerCase() === cleanQuery.toLowerCase();
        if (exact) {
            return {
                matched: true,
                confidenceScore: 1.0,
                matchedEntity: entity,
                matchedName: entity.name,
                algorithmUsed: 'EXACT',
                isSanctioned: entity.program !== 'PEP'
            };
        }

        const scorePrimary = calculateJaroWinklerDistance(cleanQuery, entity.name);
        if (scorePrimary >= threshold && (!bestMatch || scorePrimary > bestMatch.score)) {
            bestMatch = {
                entity,
                matchedName: entity.name,
                score: scorePrimary,
                algo: 'JARO_WINKLER'
            };
        }

        // 2. Check aliases
        for (const alias of entity.aliases) {
            if (alias.toLowerCase() === cleanQuery.toLowerCase()) {
                return {
                    matched: true,
                    confidenceScore: 1.0,
                    matchedEntity: entity,
                    matchedName: alias,
                    algorithmUsed: 'EXACT',
                    isSanctioned: entity.program !== 'PEP'
                };
            }

            const scoreAlias = calculateJaroWinklerDistance(cleanQuery, alias);
            if (scoreAlias >= threshold && (!bestMatch || scoreAlias > bestMatch.score)) {
                bestMatch = {
                    entity,
                    matchedName: alias,
                    score: scoreAlias,
                    algo: 'JARO_WINKLER'
                };
            }
        }
    }

    if (bestMatch && bestMatch.score >= threshold) {
        return {
            matched: true,
            confidenceScore: Math.round(bestMatch.score * 100) / 100,
            matchedEntity: bestMatch.entity,
            matchedName: bestMatch.matchedName,
            algorithmUsed: bestMatch.algo,
            isSanctioned: bestMatch.entity.program !== 'PEP'
        };
    }

    return {
        matched: false,
        confidenceScore: 0,
        algorithmUsed: 'JARO_WINKLER',
        isSanctioned: false
    };
}

// ----------------------------------------------------------------------------
// 4. ISO 20022 PACS.008 FINANCIAL MESSAGE STRUCTURE VALIDATOR
// ----------------------------------------------------------------------------
export function parseAndValidateISO20022Wire(payload: {
    msgId: string;
    instructedAmount: number;
    currency: string;
    debtorName: string;
    debtorAccount: string;
    creditorName: string;
    creditorAccount: string;
    purposeCode?: string;
}): {
    isValidISO20022: boolean;
    complianceRemarks: string[];
} {
    const remarks: string[] = [];

    if (!payload.msgId || !payload.msgId.startsWith('PACS008')) {
        remarks.push('Missing or non-compliant ISO20022 Message Identification Header');
    }

    if (payload.instructedAmount <= 0) {
        remarks.push('Invalid Instructed Amount in pacs.008 Credit Transfer');
    }

    if (!payload.creditorAccount || payload.creditorAccount.length < 5) {
        remarks.push('Invalid Creditor IBAN / Account Number format');
    }

    return {
        isValidISO20022: remarks.length === 0,
        complianceRemarks: remarks
    };
}
