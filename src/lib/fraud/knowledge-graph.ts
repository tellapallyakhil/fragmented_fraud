// ============================================================================
// HETEROGENEOUS FINANCIAL INTELLIGENCE KNOWLEDGE GRAPH ENGINE
// Production-grade graph analysis for Money Mule Rings, Syndicates, and Blast Radius
// ============================================================================

import { deriveHardwareProfile } from './hardware-identity';

export interface GraphNode {
    id: string;
    label: string;
    type: 'ACCOUNT' | 'USER' | 'DEVICE' | 'MAC' | 'IMEI' | 'IP' | 'MERCHANT' | 'LOCATION';
    riskScore: number;
    metadata: Record<string, any>;
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    label: string;
    weight: number; // Transaction amount or interaction strength
    timestamp?: string;
    metadata?: Record<string, any>;
}

export interface HeterogeneousGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    metrics: {
        totalCapitalExposed: number;
        highRiskNodeCount: number;
        detectedMuleCount: number;
        detectedSyndicates: number;
        cyclesDetected: string[][];
    };
}

export interface RapidDrainAlert {
    muleAccountId: string;
    inflowAmount: number;
    outflowAmount: number;
    drainRatio: number; // e.g. 0.94 (94% drained)
    timeDeltaSeconds: number;
    beneficiaryAccount: string;
}

export interface DeviceSyndicate {
    deviceId: string;
    deviceName: string;
    associatedAccountNumbers: string[];
    associatedUserIds: string[];
    riskScore: number;
}

// ----------------------------------------------------------------------------
// 1. TARJAN'S DIRECTED CYCLE DETECTION ALGORITHM (Wash Trading / Money Loops)
// ----------------------------------------------------------------------------
export function findWashTradingCycles(edges: GraphEdge[]): string[][] {
    const adjList = new Map<string, string[]>();
    const allNodes = new Set<string>();

    edges.forEach(edge => {
        if (!adjList.has(edge.source)) adjList.set(edge.source, []);
        adjList.get(edge.source)!.push(edge.target);
        allNodes.add(edge.source);
        allNodes.add(edge.target);
    });

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const currentPath: string[] = [];

    function dfs(node: string) {
        visited.add(node);
        recStack.add(node);
        currentPath.push(node);

        const neighbors = adjList.get(node) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                dfs(neighbor);
            } else if (recStack.has(neighbor)) {
                // Cycle found: extract the subpath forming the loop
                const cycleStartIndex = currentPath.indexOf(neighbor);
                if (cycleStartIndex !== -1) {
                    const detectedCycle = currentPath.slice(cycleStartIndex);
                    detectedCycle.push(neighbor); // Close loop
                    cycles.push(detectedCycle);
                }
            }
        }

        currentPath.pop();
        recStack.delete(node);
    }

    for (const node of allNodes) {
        if (!visited.has(node)) {
            dfs(node);
        }
    }

    return cycles;
}

// ----------------------------------------------------------------------------
// 2. RAPID DRAIN / PASS-THROUGH MULE DETECTOR
// Detects: Incoming funds immediately dumped out within window (Delta T <= 15m, Ratio >= 85%)
// ----------------------------------------------------------------------------
export function detectRapidDrainMules(
    transactions: Array<{
        id: string;
        from_account_id?: string;
        from_account_number?: string;
        to_account_number: string;
        amount: number;
        timestamp: string;
    }>,
    maxWindowMinutes: number = 15,
    minDrainRatio: number = 0.85
): RapidDrainAlert[] {
    const alerts: RapidDrainAlert[] = [];
    const sortedTxs = [...transactions].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Track inflows per account: account_number -> Array<{ amount, timestamp, txId }>
    const inflows = new Map<string, Array<{ amount: number; timestamp: number; txId: string }>>();

    sortedTxs.forEach(tx => {
        const txTime = new Date(tx.timestamp).getTime();

        // Check if this tx is an OUTFLOW matching a recent INFLOW for the sender
        const senderAcc = tx.from_account_number || tx.from_account_id;
        if (senderAcc && inflows.has(senderAcc)) {
            const recentInflows = inflows.get(senderAcc)!;
            const validInflows = recentInflows.filter(
                inflow => (txTime - inflow.timestamp) <= maxWindowMinutes * 60 * 1000 && (txTime - inflow.timestamp) >= 0
            );

            for (const inflow of validInflows) {
                const drainRatio = tx.amount / inflow.amount;
                if (drainRatio >= minDrainRatio && drainRatio <= 1.15) { // within 85% - 115%
                    alerts.push({
                        muleAccountId: senderAcc,
                        inflowAmount: inflow.amount,
                        outflowAmount: tx.amount,
                        drainRatio: Math.round(drainRatio * 100) / 100,
                        timeDeltaSeconds: Math.round((txTime - inflow.timestamp) / 1000),
                        beneficiaryAccount: tx.to_account_number
                    });
                }
            }
        }

        // Record as an INFLOW for the recipient
        if (tx.to_account_number) {
            if (!inflows.has(tx.to_account_number)) {
                inflows.set(tx.to_account_number, []);
            }
            inflows.get(tx.to_account_number)!.push({
                amount: tx.amount,
                timestamp: txTime,
                txId: tx.id
            });
        }
    });

    return alerts;
}

// ----------------------------------------------------------------------------
// 3. DEVICE COLLUSION & SYNDICATE FARM RESOLUTION
// Links disparate accounts and users sharing the same hardware / IMEI / Canvas ID
// ----------------------------------------------------------------------------
export function detectDeviceSyndicates(
    transactions: Array<{
        device_id?: string;
        device_name?: string;
        from_account_id?: string;
        from_account_number?: string;
        user_id?: string;
    }>
): DeviceSyndicate[] {
    const deviceMap = new Map<string, {
        deviceName: string;
        accounts: Set<string>;
        users: Set<string>;
    }>();

    transactions.forEach(tx => {
        if (!tx.device_id) return;
        if (!deviceMap.has(tx.device_id)) {
            deviceMap.set(tx.device_id, {
                deviceName: tx.device_name || 'Unknown Device',
                accounts: new Set(),
                users: new Set()
            });
        }

        const entry = deviceMap.get(tx.device_id)!;
        if (tx.from_account_number) entry.accounts.add(tx.from_account_number);
        if (tx.from_account_id) entry.accounts.add(tx.from_account_id);
        if (tx.user_id) entry.users.add(tx.user_id);
    });

    const syndicates: DeviceSyndicate[] = [];
    deviceMap.forEach((data, deviceId) => {
        if (data.accounts.size >= 2 || data.users.size >= 2) {
            // Syndicate detected: 1 physical device controlling multiple accounts
            const accountCount = data.accounts.size;
            const risk = Math.min(60 + (accountCount * 15), 100);

            syndicates.push({
                deviceId,
                deviceName: data.deviceName,
                associatedAccountNumbers: Array.from(data.accounts),
                associatedUserIds: Array.from(data.users),
                riskScore: risk
            });
        }
    });

    return syndicates;
}

// ----------------------------------------------------------------------------
// 4. BLAST RADIUS & CAPITAL CONTAGION CALCULATOR
// Computes total infected capital exposed when a high-risk node is identified
// ----------------------------------------------------------------------------
export function calculateBlastRadius(
    seedNodeId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
    maxDepth: number = 2
): {
    infectedNodeIds: string[];
    totalCapitalAtRisk: number;
    infectionDegree: number;
} {
    const infected = new Set<string>([seedNodeId]);
    let currentFrontier = new Set<string>([seedNodeId]);

    for (let depth = 0; depth < maxDepth; depth++) {
        const nextFrontier = new Set<string>();
        edges.forEach(edge => {
            if (currentFrontier.has(edge.source) && !infected.has(edge.target)) {
                infected.add(edge.target);
                nextFrontier.add(edge.target);
            }
            if (currentFrontier.has(edge.target) && !infected.has(edge.source)) {
                infected.add(edge.source);
                nextFrontier.add(edge.source);
            }
        });
        currentFrontier = nextFrontier;
    }

    let totalCapital = 0;
    nodes.forEach(node => {
        if (infected.has(node.id) && node.type === 'ACCOUNT') {
            totalCapital += Number(node.metadata?.balance || 0);
        }
    });

    return {
        infectedNodeIds: Array.from(infected),
        totalCapitalAtRisk: totalCapital,
        infectionDegree: infected.size
    };
}

// ----------------------------------------------------------------------------
// 5. MASTER HETEROGENEOUS GRAPH BUILDER
// Builds a full multi-entity Cytoscape-ready graph from DB entities
// ----------------------------------------------------------------------------
export function buildHeterogeneousGraph(
    accounts: any[],
    profiles: any[],
    transactions: any[]
): HeterogeneousGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeSet = new Set<string>();

    const userProfileMap = new Map<string, any>();
    profiles.forEach(p => userProfileMap.set(p.id, p));

    // 1. Account Nodes & User Nodes
    accounts.forEach(acc => {
        const profile = userProfileMap.get(acc.user_id);
        const accNodeId = `acc_${acc.account_number}`;

        if (!nodeSet.has(accNodeId)) {
            nodes.push({
                id: accNodeId,
                label: `${acc.account_number} (${profile?.full_name || 'Account'})`,
                type: 'ACCOUNT',
                riskScore: acc.risk_score || 0,
                metadata: {
                    balance: acc.balance,
                    isFrozen: acc.is_frozen,
                    accountNumber: acc.account_number,
                    userId: acc.user_id
                }
            });
            nodeSet.add(accNodeId);
        }

        // Link User -> Account
        if (profile) {
            const userNodeId = `usr_${profile.id}`;
            if (!nodeSet.has(userNodeId)) {
                nodes.push({
                    id: userNodeId,
                    label: `👤 ${profile.full_name}`,
                    type: 'USER',
                    riskScore: profile.role === 'hacker' ? 95 : 0,
                    metadata: { email: profile.email, role: profile.role }
                });
                nodeSet.add(userNodeId);
            }

            edges.push({
                id: `edge_${userNodeId}_${accNodeId}`,
                source: userNodeId,
                target: accNodeId,
                label: 'OWNS',
                weight: 1
            });
        }
    });

    // 2. Transaction Edges & Device/IP Heterogeneous Nodes
    const accountLookup = new Map<string, any>();
    accounts.forEach(a => accountLookup.set(a.id, a));

    transactions.forEach(tx => {
        const senderAcc = accountLookup.get(tx.from_account_id);
        const senderNodeId = senderAcc ? `acc_${senderAcc.account_number}` : `acc_EXT_${tx.from_account_id}`;
        const receiverNodeId = `acc_${tx.to_account_number}`;

        // Ensure recipient node exists
        if (!nodeSet.has(receiverNodeId)) {
            nodes.push({
                id: receiverNodeId,
                label: `🎯 ${tx.to_account_number}`,
                type: 'ACCOUNT',
                riskScore: 40,
                metadata: { accountNumber: tx.to_account_number, balance: 0 }
            });
            nodeSet.add(receiverNodeId);
        }

        // Transaction Transfer Edge
        edges.push({
            id: `tx_${tx.id}`,
            source: senderNodeId,
            target: receiverNodeId,
            label: `₹${Number(tx.amount).toLocaleString('en-IN')}`,
            weight: Number(tx.amount),
            timestamp: tx.timestamp,
            metadata: {
                status: tx.status,
                location: tx.location,
                ip: tx.ip_address,
                device: tx.device_name
            }
        });

        // Heterogeneous: Link Physical Hardware Identity (MAC & IMEI)
        if (tx.device_id || tx.ip_address) {
            const hw = deriveHardwareProfile(tx.device_id, tx.ip_address, tx.device_name);
            const devNodeId = `dev_${tx.device_id || 'unknown_hw'}`;
            const macNodeId = `mac_${hw.macAddress}`;

            if (!nodeSet.has(devNodeId)) {
                nodes.push({
                    id: devNodeId,
                    label: `📱 ${tx.device_name || 'Hardware Platform'}`,
                    type: 'DEVICE',
                    riskScore: 30,
                    metadata: { deviceId: tx.device_id, imei: hw.imei, mac: hw.macAddress }
                });
                nodeSet.add(devNodeId);
            }

            // Link Sender -> Device
            edges.push({
                id: `edge_dev_${senderNodeId}_${devNodeId}`,
                source: senderNodeId,
                target: devNodeId,
                label: 'OPERATED_ON',
                weight: 0.5
            });

            // Physical Layer-2 MAC Root of Trust Node
            if (!nodeSet.has(macNodeId)) {
                nodes.push({
                    id: macNodeId,
                    label: `🔒 MAC: ${hw.macAddress}`,
                    type: 'MAC',
                    riskScore: hw.isVpnSuspected ? 65 : 25,
                    metadata: { mac: hw.macAddress, imei: hw.imei, isVpn: hw.isVpnSuspected }
                });
                nodeSet.add(macNodeId);
            }

            edges.push({
                id: `edge_mac_${devNodeId}_${macNodeId}`,
                source: devNodeId,
                target: macNodeId,
                label: 'PHYSICAL_MAC',
                weight: 0.8
            });

            // If IP is present, link MAC -> IP to visualize VPN/Network spoofing layer
            if (tx.ip_address) {
                const ipNodeId = `ip_${tx.ip_address}`;
                if (!nodeSet.has(ipNodeId)) {
                    nodes.push({
                        id: ipNodeId,
                        label: `🌐 IP: ${tx.ip_address}${hw.isVpnSuspected ? ' (VPN)' : ''}`,
                        type: 'IP',
                        riskScore: hw.isVpnSuspected ? 70 : 15,
                        metadata: { ip: tx.ip_address, isVpn: hw.isVpnSuspected }
                    });
                    nodeSet.add(ipNodeId);
                }
                edges.push({
                    id: `edge_ip_${macNodeId}_${ipNodeId}`,
                    source: macNodeId,
                    target: ipNodeId,
                    label: hw.isVpnSuspected ? 'VPN_TUNNELED' : 'ROUTED_VIA',
                    weight: 0.4
                });
            }
        }
    });

    // 3. Run Algorithms
    const cycles = findWashTradingCycles(edges.filter(e => e.label.startsWith('₹')));
    const syndicates = detectDeviceSyndicates(transactions.map(t => ({
        ...t,
        from_account_number: accountLookup.get(t.from_account_id)?.account_number
    })));

    let totalCap = 0;
    nodes.forEach(n => {
        if (n.type === 'ACCOUNT') totalCap += Number(n.metadata?.balance || 0);
    });

    return {
        nodes,
        edges,
        metrics: {
            totalCapitalExposed: totalCap,
            highRiskNodeCount: nodes.filter(n => n.riskScore >= 70).length,
            detectedMuleCount: nodes.filter(n => n.riskScore >= 60).length,
            detectedSyndicates: syndicates.length,
            cyclesDetected: cycles
        }
    };
}
