'use client';

import { useEffect, useState } from 'react';
import { FraudGraph } from "@/components/fraud/FraudGraph";
import { getHeterogeneousGraphData, executeClusterQuarantine, generateFormalSARReport, screenWatchlistAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { RefreshCw, Wifi, WifiOff, ShieldAlert, FileText, Search, AlertOctagon, CheckCircle2, Copy, X } from "lucide-react";
import { supabase } from '@/lib/supabase';

export default function NetworkPage() {
    const [graphElements, setGraphElements] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any>({
        totalCapitalExposed: 0,
        highRiskNodeCount: 0,
        detectedMuleCount: 0,
        detectedSyndicates: 0,
        cyclesDetected: []
    });
    const [loading, setLoading] = useState(true);
    const [liveMode, setLiveMode] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [isUnmasked, setIsUnmasked] = useState(false);

    // Modals
    const [sarModal, setSarModal] = useState<any>(null);
    const [sanctionsModal, setSanctionsModal] = useState(false);
    const [sanctionsQuery, setSanctionsQuery] = useState('');
    const [sanctionsResult, setSanctionsResult] = useState<any>(null);
    const [sanctionsLoading, setSanctionsLoading] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const fetchHeteroData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const res = await getHeterogeneousGraphData(user?.id);

        if (res.success && res.graph) {
            const cyNodes = res.graph.nodes.map((n: any) => {
                let nodeClass = '';
                if (n.riskScore >= 75) nodeClass = 'critical-risk high-risk';
                else if (n.riskScore >= 50) nodeClass = 'medium-risk';

                let nodeType = 'account';
                if (n.type === 'USER') nodeType = 'user';
                else if (n.type === 'DEVICE') nodeType = 'device';
                else if (n.type === 'IP') nodeType = 'ip';

                return {
                    data: {
                        id: n.id,
                        label: isUnmasked ? n.label : (n.label.startsWith('SAL_') ? `SAL_***${n.label.slice(-4)}` : n.label),
                        type: nodeType,
                        riskScore: n.riskScore,
                        ...n.metadata
                    },
                    classes: `${nodeClass} type-${nodeType}`
                };
            });

            const cyEdges = res.graph.edges.map((e: any) => ({
                data: {
                    id: e.id,
                    source: e.source,
                    target: e.target,
                    label: e.label,
                    weight: e.weight
                },
                classes: e.label.startsWith('₹') ? 'type-transfer' : 'type-link'
            }));

            setGraphElements([...cyNodes, ...cyEdges]);
            setMetrics(res.graph.metrics);
            setLastUpdate(new Date());
        }
        setLoading(false);
    };

    const handleClusterQuarantine = async () => {
        const target = prompt("☣️ CLUSTER QUARANTINE CONTROLLER\nEnter the suspect Account Number to calculate and freeze its entire blast radius:", "HACKER_X");
        if (!target) return;

        setActionLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const res = await executeClusterQuarantine(target, user?.id);
            if (res.success) {
                const capital = (res.totalCapitalSecured || 0).toLocaleString('en-IN');
                setActionMessage(`✅ QUARANTINE SUCCESSFUL: ${res.quarantinedCount || 0} accounts quarantined. ₹${capital} capital secured.`);
                fetchHeteroData();
            } else {
                alert(`Error: ${res.error}`);
            }
        } catch (err: any) {
            alert(`Quarantine action failed: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const handleGenerateSAR = async () => {
        const target = prompt("📄 SUSPICIOUS ACTIVITY REPORT (SAR) GENERATOR\nEnter the target Account Number for official filing:", "HACKER_X");
        if (!target) return;

        setActionLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const res = await generateFormalSARReport(target, user?.id);
            if (res.success && res.sar) {
                setSarModal(res.sar);
            } else {
                alert(`Error generating SAR: ${res.error}`);
            }
        } catch (err: any) {
            alert(`SAR Generation failed: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const handleRunSanctionsSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sanctionsQuery.trim()) return;
        setSanctionsLoading(true);
        try {
            const res = await screenWatchlistAction(sanctionsQuery);
            setSanctionsResult(res);
        } catch (err) {
            console.error(err);
        } finally {
            setSanctionsLoading(false);
        }
    };

    const handleUnmaskRequest = () => {
        if (isUnmasked) {
            setIsUnmasked(false);
            fetchHeteroData();
            return;
        }

        const reason = prompt("🔐 SECURITY CLEARANCE REQUIRED\nPlease enter your compliance officer justification to view unmasked PII:");
        if (reason && reason.length > 5) {
            setIsUnmasked(true);
            setLoading(true);
            setTimeout(() => {
                fetchHeteroData();
            }, 300);
        } else if (reason !== null) {
            alert("❌ Access Denied: Justification too short.");
        }
    };

    useEffect(() => {
        fetchHeteroData();
    }, [isUnmasked]);

    useEffect(() => {
        if (!liveMode) return;
        const interval = setInterval(() => {
            fetchHeteroData();
        }, 6000);
        return () => clearInterval(interval);
    }, [liveMode, isUnmasked]);

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col space-y-4">
            {/* Header Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                        🏛️ Multi-Entity Intelligence Graph
                    </h1>
                    <p className="text-slate-400 text-sm">
                        Heterogeneous Link Analysis • Accounts, Devices, IPs & Wash Trading Loops
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Sanctions Screener Button */}
                    <button
                        onClick={() => setSanctionsModal(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-900/40 border border-indigo-600/50 hover:bg-indigo-900/60 text-indigo-300 text-xs font-semibold rounded-lg transition-all"
                    >
                        <Search size={14} /> OFAC/PEP Screener
                    </button>

                    {/* SAR Report Generator Button */}
                    <button
                        onClick={handleGenerateSAR}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 px-3 py-2 bg-purple-900/40 border border-purple-600/50 hover:bg-purple-900/60 text-purple-300 text-xs font-semibold rounded-lg transition-all"
                    >
                        <FileText size={14} /> Generate SAR Filing
                    </button>

                    {/* Cluster Quarantine Button */}
                    <button
                        onClick={handleClusterQuarantine}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-900/40 border border-red-600/50 hover:bg-red-900/60 text-red-300 text-xs font-semibold rounded-lg transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                    >
                        <ShieldAlert size={14} /> Quarantine Blast Radius
                    </button>

                    {/* Live Mode Toggle */}
                    <button
                        onClick={() => setLiveMode(!liveMode)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${liveMode
                            ? 'bg-green-900/30 border-green-700 text-green-400'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                    >
                        {liveMode ? <Wifi size={14} className="animate-pulse" /> : <WifiOff size={14} />}
                        {liveMode ? 'LIVE STREAM' : 'PAUSED'}
                    </button>

                    {/* PII Unmasking Toggle */}
                    <button
                        onClick={handleUnmaskRequest}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${isUnmasked
                            ? 'bg-blue-900/40 border-blue-500 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.5)]'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                    >
                        <span>{isUnmasked ? '🔓 UNMASKED' : '🔒 MASKED'}</span>
                    </button>

                    {/* Refresh */}
                    <button
                        onClick={() => fetchHeteroData()}
                        className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 text-xs"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Metrics Dashboard Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase">Total Capital at Risk</p>
                    <p className="text-xl font-mono font-bold text-cyan-400 mt-0.5">
                        ₹{(metrics.totalCapitalExposed || 0).toLocaleString('en-IN')}
                    </p>
                </div>
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase">High Risk Nodes</p>
                    <p className="text-xl font-mono font-bold text-red-400 mt-0.5">
                        {metrics.highRiskNodeCount || 0}
                    </p>
                </div>
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase">Wash Loops (Cycles)</p>
                    <p className="text-xl font-mono font-bold text-amber-400 mt-0.5">
                        {metrics.cyclesDetected?.length || 0} Loop(s)
                    </p>
                </div>
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase">Device Syndicates</p>
                    <p className="text-xl font-mono font-bold text-purple-400 mt-0.5">
                        {metrics.detectedSyndicates || 0} Collusions
                    </p>
                </div>
            </div>

            {/* Notification Banner */}
            {actionMessage && (
                <div className="bg-emerald-950/40 border border-emerald-700/60 p-3 rounded-xl text-emerald-300 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-400" />
                        <span>{actionMessage}</span>
                    </div>
                    <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Cytoscape Canvas */}
            <Card className="flex-1 border-slate-800 bg-slate-950/70 flex flex-col overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 z-20 bg-gradient-to-r from-cyan-500 via-purple-500 to-red-500"></div>

                <div className="absolute top-3 right-3 z-30 text-xs text-slate-500 bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                    {isMounted && lastUpdate ? `Live Feed: ${lastUpdate.toLocaleTimeString()}` : 'Loading...'}
                </div>

                <div className="flex-1 relative bg-slate-900/20">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-slate-500">
                            Loading heterogeneous topology...
                        </div>
                    ) : graphElements.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <div className="text-4xl mb-4">🕸️</div>
                            <div>No transaction telemetry recorded yet.</div>
                        </div>
                    ) : (
                        <FraudGraph elements={graphElements} />
                    )}
                </div>
            </Card>

            {/* SAR REPORT MODAL */}
            {sarModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-purple-600/50 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                            <div className="flex items-center gap-2">
                                <FileText className="text-purple-400" size={20} />
                                <h3 className="text-lg font-bold text-white">Suspicious Activity Report (SAR / STR)</h3>
                            </div>
                            <button onClick={() => setSarModal(null)} className="text-slate-400 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="overflow-y-auto space-y-4 text-xs font-mono text-slate-300 pr-2">
                            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                                <p><strong className="text-purple-400">Filing ID:</strong> {sarModal.filingId}</p>
                                <p><strong className="text-purple-400">Authority:</strong> {sarModal.regulatoryAuthority}</p>
                                <p><strong className="text-purple-400">Subject:</strong> {sarModal.primarySubject.name} ({sarModal.primarySubject.accountNumber})</p>
                                <p><strong className="text-purple-400">Risk Index:</strong> {sarModal.primarySubject.riskScore}/100</p>
                            </div>

                            <div>
                                <h4 className="font-bold text-white mb-1 uppercase text-[11px]">Legal Compliance Narrative</h4>
                                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] whitespace-pre-wrap font-sans text-slate-300">
                                    {sarModal.legalComplianceNarrative}
                                </pre>
                            </div>

                            <div>
                                <h4 className="font-bold text-white mb-1 uppercase text-[11px]">Quarantined Blast Radius</h4>
                                <p className="text-slate-400">
                                    {sarModal.blastRadiusSummary.infectedNodeCount} infected nodes • ₹{sarModal.blastRadiusSummary.totalCapitalExposed.toLocaleString('en-IN')} capital exposed.
                                </p>
                            </div>

                            <div>
                                <h4 className="font-bold text-white mb-1 uppercase text-[11px]">Statutory Compliance Citations</h4>
                                <ul className="list-disc list-inside text-slate-400">
                                    {sarModal.statutoryCitations.map((c: string, idx: number) => (
                                        <li key={idx}>{c}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(JSON.stringify(sarModal, null, 2));
                                    alert("SAR Filing JSON copied to clipboard!");
                                }}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1.5"
                            >
                                <Copy size={14} /> Copy JSON
                            </button>
                            <button
                                onClick={() => setSarModal(null)}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold"
                            >
                                Close Filing
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* OFAC / PEP SANCTIONS SCREENER MODAL */}
            {sanctionsModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-indigo-600/50 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                            <div className="flex items-center gap-2">
                                <Search className="text-indigo-400" size={20} />
                                <h3 className="text-lg font-bold text-white">OFAC / PEP Sanctions Screener</h3>
                            </div>
                            <button onClick={() => setSanctionsModal(false)} className="text-slate-400 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleRunSanctionsSearch} className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Entity or Individual Name (Fuzzy Phonetic Search)</label>
                                <input
                                    type="text"
                                    value={sanctionsQuery}
                                    onChange={(e) => setSanctionsQuery(e.target.value)}
                                    placeholder="e.g. Al-Hassan, Viktor Antonov, Xavier"
                                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={sanctionsLoading}
                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs transition-all disabled:opacity-50"
                            >
                                {sanctionsLoading ? 'Screening...' : 'Run Jaro-Winkler Phonetic Match'}
                            </button>
                        </form>

                        {sanctionsResult && (
                            <div className="mt-4 p-3 bg-slate-950 rounded-lg border border-slate-800">
                                {sanctionsResult.matched ? (
                                    <div className="space-y-2 text-xs">
                                        <div className="flex items-center gap-2 text-red-400 font-bold">
                                            <AlertOctagon size={16} /> SANCTIONS WATCHLIST HIT ({(sanctionsResult.confidenceScore * 100)}% Match)
                                        </div>
                                        <p><strong className="text-slate-300">Target Entity:</strong> {sanctionsResult.matchedEntity?.name}</p>
                                        <p><strong className="text-slate-300">Program:</strong> {sanctionsResult.matchedEntity?.program}</p>
                                        <p><strong className="text-slate-300">Jurisdiction:</strong> {sanctionsResult.matchedEntity?.country}</p>
                                        <p><strong className="text-slate-300">Remarks:</strong> {sanctionsResult.matchedEntity?.remarks}</p>
                                    </div>
                                ) : (
                                    <div className="text-emerald-400 text-xs flex items-center gap-2">
                                        <CheckCircle2 size={16} /> No Sanctions or PEP matches found (Pass).
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
