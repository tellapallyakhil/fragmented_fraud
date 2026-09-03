'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Send, LogOut, RefreshCw, History, Wallet, Shield, CheckCircle, AlertTriangle, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Account {
    id: string;
    account_number: string;
    balance: number;
}

interface Transaction {
    id: string;
    to_account_number: string;
    amount: number;
    timestamp: string;
    status: string;
}

export default function UserDashboard() {
    const router = useRouter();
    const [account, setAccount] = useState<Account | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [sendModal, setSendModal] = useState(false);
    const [sendData, setSendData] = useState({ recipient: '', amount: '' });
    const [sendLoading, setSendLoading] = useState(false);
    const [sendError, setSendError] = useState('');
    const [sendSuccess, setSendSuccess] = useState(false);
    const [realForensics, setRealForensics] = useState<any>(null);

    // 🧬 Behavioral Biometrics & Telemetry State
    const [isPasted, setIsPasted] = useState(false);
    const [pasteWarning, setPasteWarning] = useState(false);
    const [dwellTimes, setDwellTimes] = useState<number[]>([]);
    const [flightTimes, setFlightTimes] = useState<number[]>([]);
    const [lastKeyUpTime, setLastKeyUpTime] = useState<number | null>(null);
    const [lastKeyDownTime, setLastKeyDownTime] = useState<number | null>(null);
    const [modalOpenTime, setModalOpenTime] = useState<number>(0);

    const [userName, setUserName] = useState<string>('');

    const [activePersonaId, setActivePersonaId] = useState<string>('');

    const fetchData = async () => {
        let userId: string | null = null;
        let displayName = 'User';

        // Check if demo persona is selected
        const demoPersonaId = typeof window !== 'undefined' ? localStorage.getItem('demo_persona_id') : null;
        const demoPersonaName = typeof window !== 'undefined' ? localStorage.getItem('demo_persona_name') : null;

        if (demoPersonaId) {
            userId = demoPersonaId;
            displayName = demoPersonaName || 'Demo User';
            setActivePersonaId(demoPersonaId);
        } else {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                userId = user.id;
                displayName = user.user_metadata?.full_name || user.email || 'User';
                setActivePersonaId(user.id);
            }
        }

        if (!userId) {
            userId = 'a0000000-0000-0000-0000-000000000001';
            displayName = 'Alice Sen';
            setActivePersonaId(userId);
        }

        setUserName(displayName);

        // Fetch account
        const { data: accData } = await supabase
            .from('accounts')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (accData) setAccount(accData);

        // Fetch transactions
        if (accData) {
            const { data: tx } = await supabase
                .from('transactions')
                .select('*')
                .or(`from_account_id.eq.${accData.id},to_account_number.eq.${accData.account_number}`)
                .order('timestamp', { ascending: false })
                .limit(10);
            if (tx) setTransactions(tx);
        } else {
            setTransactions([]);
        }

        setLoading(false);
    };

    const switchPersona = (personaId: string, name: string, acc: string) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('demo_persona_id', personaId);
            localStorage.setItem('demo_persona_name', name);
            localStorage.setItem('demo_persona_acc', acc);
        }
        setLoading(true);
        setTimeout(() => {
            fetchData();
        }, 100);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const collectRealForensics = async () => {
        let location = "Unknown (Permission Denied)";
        let ip = "0.0.0.0";
        let ipv6 = "";

        // 1. Get IP Addresses (Parallel fetch)
        try {
            const [v4Res, v6Res] = await Promise.allSettled([
                fetch('https://api.ipify.org?format=json').then(r => r.json()),
                fetch('https://api64.ipify.org?format=json').then(r => r.json())
            ]);

            if (v4Res.status === 'fulfilled') ip = v4Res.value.ip;
            if (v6Res.status === 'fulfilled') ipv6 = v6Res.value.ip;
        } catch (e) {
            console.error("IP Fetch failed", e);
        }

        const combinedIp = ipv6 && ipv6 !== ip ? `${ip} (v6: ${ipv6.slice(0, 15)}...)` : ip;

        // 2. Deep Scan: Get Local/Internal IP via WebRTC
        const getInternalIp = (): Promise<string> => {
            return new Promise((resolve) => {
                const pc = new RTCPeerConnection({ iceServers: [] });
                pc.createDataChannel("");
                pc.createOffer().then(o => pc.setLocalDescription(o));
                pc.onicecandidate = (ice) => {
                    if (!ice || !ice.candidate) return;
                    const match = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(ice.candidate.candidate);
                    if (match) { resolve(match[1]); pc.onicecandidate = null; }
                };
                setTimeout(() => resolve("192.0.0.X"), 1500);
            });
        };

        const internalIp = await getInternalIp();
        const finalForensicIp = `${combinedIp} [Local: ${internalIp}]`;

        // 2. Get Geolocation & Reverse Geocode
        const getCoords = () => new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });

        try {
            const pos: any = await getCoords();
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            location = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

            // Reverse Geocode (Human readable address)
            try {
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
                const geoData = await geoRes.json();
                if (geoData.address) {
                    const city = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.suburb;
                    const state = geoData.address.state;
                    if (city && state) {
                        location = `${city}, ${state} (${location})`;
                    }
                }
            } catch (geocodeErr) {
                console.warn("Reverse Geocoding failed", geocodeErr);
            }
        } catch (e) {
            console.warn("Location access denied or timed out");
        }

        const ua = navigator.userAgent;
        let device = navigator.platform;
        if (ua.includes('Android')) device = `Android Mobile (${ua.split(';')[1].trim()})`;
        else if (ua.includes('iPhone')) device = `Apple iPhone (iOS)`;
        else if (ua.includes('Macintosh')) device = `Apple Mac (macOS)`;
        else if (ua.includes('Windows')) device = `Windows PC`;

        device = `${device} | ${navigator.vendor || 'Unknown Vendor'}`;

        // Generate a stable "Fingerprint ID" (Substitute for restricted IMEI/MAC)
        const fingerprint = `FP-${btoa(navigator.userAgent).slice(0, 8)}-${window.screen.width}x${window.screen.height}`;

        return {
            ip: finalForensicIp,
            subnet: '255.255.255.0',
            device: device,
            imei: `HW-${fingerprint.slice(3, 10)}`, // Virtual Hardware ID
            location: location,
            deviceId: fingerprint
        };
    };

    const handleSendMoney = async () => {
        if (!account) return;
        setSendLoading(true);
        setSendError('');
        setSendSuccess(false);

        // 🔒 CRITICAL SECURITY CHECK: Prevent frozen accounts from transacting
        if ((account as any).is_frozen) {
            setSendError('⛔ ACCOUNT FROZEN: This account has been flagged for suspicious activity and cannot perform transactions. Please contact support.');
            setSendLoading(false);
            return;
        }

        const amount = parseFloat(sendData.amount);

        if (amount <= 0 || amount > account.balance) {
            setSendError('Invalid amount or insufficient balance');
            setSendLoading(false);
            return;
        }

        const forensics = await collectRealForensics();

        try {
            const { processUserTransaction } = await import('@/app/actions');
            const result = await processUserTransaction({
                amount,
                recipient: sendData.recipient,
                fromAccountId: account.id,
                forensics: {
                    ...forensics,
                    telemetry: {
                        isPasted,
                        typingDwellTimes: dwellTimes,
                        typingFlightTimes: flightTimes,
                        hesitationDurationMs: Date.now() - modalOpenTime,
                        userAgent: navigator.userAgent
                    }
                }
            });

            if (result.success) {
                setSendSuccess(true);
                setSendData({ recipient: '', amount: '' });
                setIsPasted(false);
                setPasteWarning(false);

                // Refresh data
                setTimeout(() => {
                    fetchData();
                    setSendModal(false);
                    setSendSuccess(false);
                }, 1500);
            } else {
                setSendError(result.error || 'Transaction failed');
            }
        } catch (err) {
            setSendError('Error processing transaction');
        } finally {
            setSendLoading(false);
        }
    };

    const openModal = () => {
        setRealForensics(null); // Reset forensics to force new collection for EVERY transaction
        setModalOpenTime(Date.now());
        setIsPasted(false);
        setPasteWarning(false);
        setDwellTimes([]);
        setFlightTimes([]);
        setSendModal(true);
        // Force immediate permission request with high accuracy
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                () => { console.log("📍 Location permission granted"); },
                (err) => { console.warn("📍 Location permission status:", err.message); },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-cyan-400 animate-pulse">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
            {/* Header */}
            <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-cyan-400">🏦 Salaar Bank</h1>
                    <div className="flex items-center gap-4">
                        <span className="text-slate-400 text-sm">
                            Welcome, <span className="text-white font-semibold">{userName}</span>
                        </span>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                        >
                            <LogOut size={18} /> Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-8">
                {/* 🎭 DEMO PERSONA SWITCHER BAR */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-base">🎭</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Live Demo Persona Switcher</span>
                        </div>
                        <a href="/network" className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1">
                            🕵️ Open FIU War Room →
                        </a>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                            onClick={() => switchPersona('a0000000-0000-0000-0000-000000000001', 'Alice Sen', 'SAL_ALICE')}
                            className={`p-2.5 rounded-xl border text-left transition-all ${userName.includes('Alice')
                                ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                        >
                            <p className="text-xs font-bold text-white">👤 Alice (Clean)</p>
                            <p className="text-[10px] text-emerald-400 font-mono">SAL_ALICE</p>
                        </button>

                        <button
                            onClick={() => switchPersona('a0000000-0000-0000-0000-000000000003', 'Charlie User', 'SAL_CHARLIE')}
                            className={`p-2.5 rounded-xl border text-left transition-all ${userName.includes('Charlie')
                                ? 'bg-amber-950/60 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                        >
                            <p className="text-xs font-bold text-white">🎣 Charlie (Victim)</p>
                            <p className="text-[10px] text-amber-400 font-mono">SAL_CHARLIE</p>
                        </button>

                        <button
                            onClick={() => switchPersona('a0000000-0000-0000-0000-000000000002', 'Bob User', 'SAL_BOB')}
                            className={`p-2.5 rounded-xl border text-left transition-all ${userName.includes('Bob')
                                ? 'bg-purple-950/60 border-purple-500 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                        >
                            <p className="text-xs font-bold text-white">💸 Bob (Mule)</p>
                            <p className="text-[10px] text-purple-400 font-mono">SAL_BOB</p>
                        </button>

                        <button
                            onClick={() => switchPersona('a0000000-0000-0000-0000-000000000010', 'Xavier (Hacker)', 'HACKER_X')}
                            className={`p-2.5 rounded-xl border text-left transition-all ${userName.includes('Xavier')
                                ? 'bg-red-950/60 border-red-500 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                        >
                            <p className="text-xs font-bold text-white">🕵️ Xavier (Target)</p>
                            <p className="text-[10px] text-red-400 font-mono">HACKER_X</p>
                        </button>
                    </div>
                </div>

                {/* Frozen Account Warning */}
                {(account as any)?.is_frozen && (
                    <div className="bg-red-900/30 border-2 border-red-500 rounded-xl p-6 mb-6 animate-pulse">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-3xl">⛔</span>
                            <h2 className="text-xl font-bold text-red-400">ACCOUNT FROZEN</h2>
                        </div>
                        <p className="text-red-300 text-sm">
                            This account has been flagged for suspicious activity by our fraud detection system.
                            All transactions are currently blocked. Please contact customer support immediately.
                        </p>
                    </div>
                )}

                {/* Balance Card */}
                <div className="bg-gradient-to-r from-cyan-900/50 to-blue-900/50 border border-cyan-800/50 rounded-2xl p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <Wallet className="text-cyan-400" size={24} />
                            <span className="text-slate-400">Available Balance</span>
                        </div>
                        <button onClick={fetchData} className="text-slate-400 hover:text-white">
                            <RefreshCw size={18} />
                        </button>
                    </div>
                    <div className="text-4xl font-bold text-white mb-2">
                        ₹{account?.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-slate-500 text-sm font-mono">
                        A/C: {account?.account_number}
                    </div>
                </div>

                {/* Action Button */}
                <button
                    onClick={openModal}
                    disabled={(account as any)?.is_frozen}
                    className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-3 mb-8 transition-all active:scale-[0.99] ${(account as any)?.is_frozen
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500'
                        }`}
                >
                    <Send size={20} /> {(account as any)?.is_frozen ? 'Account Frozen - Transactions Disabled' : 'Send Money'}
                </button>

                {/* Recent Transactions */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <History className="text-slate-400" size={20} />
                        <h2 className="text-lg font-semibold">Recent Transactions</h2>
                    </div>

                    {transactions.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No transactions yet</p>
                    ) : (
                        <div className="space-y-3">
                            {transactions.map(tx => (
                                <div key={tx.id} className="flex items-center justify-between py-3 border-b border-slate-700/50 last:border-0">
                                    <div>
                                        <div className="text-white font-medium">To: {tx.to_account_number}</div>
                                        <div className="text-slate-500 text-xs">
                                            {new Date(tx.timestamp).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="text-red-400 font-mono font-bold">
                                        -₹{tx.amount.toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Send Money Modal */}
            {sendModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold mb-6">Send Money</h3>

                        {sendSuccess ? (
                            <div className="text-center py-8">
                                <div className="text-5xl mb-4">✅</div>
                                <p className="text-green-400 font-bold">Transaction Successful!</p>
                            </div>
                        ) : !realForensics ? (
                            <div className="text-center py-6 space-y-4">
                                <div className="w-16 h-16 bg-cyan-500/10 border border-cyan-500/30 rounded-full flex items-center justify-center mx-auto">
                                    <Shield className="w-8 h-8 text-cyan-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Secure Verification Required</h3>
                                    <p className="text-slate-400 text-xs mt-2 px-4">
                                        To ensure your protection, Salaar Bank requires a mandatory real-time location and device sync for this transaction.
                                    </p>
                                </div>
                                <Button
                                    onClick={async () => {
                                        const forensics = await collectRealForensics();
                                        setRealForensics(forensics);
                                    }}
                                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-6"
                                >
                                    🔓 Allow Secure Sync
                                </Button>
                                <button
                                    onClick={() => setSendModal(false)}
                                    className="text-slate-500 text-xs hover:text-slate-300 underline"
                                >
                                    Cancel and Close
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-4">
                                    <div className="bg-emerald-950/20 border border-emerald-900/50 p-2 rounded flex items-center gap-2 text-[10px] text-emerald-400">
                                        <CheckCircle className="w-3 h-3" />
                                        Identity Verified: {realForensics.ip} | {realForensics.location}
                                    </div>
                                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                                        <p className="text-[10px] font-bold uppercase text-slate-400">⚡ Live Pitch Test Scenarios:</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSendData({ recipient: 'HACKER_X', amount: '49500' });
                                                    setIsPasted(true);
                                                    setPasteWarning(true);
                                                }}
                                                className="px-2 py-1 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-700/60 text-amber-300 text-[10px] font-semibold rounded-lg"
                                            >
                                                🎣 Simulate APP Scam (Paste)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSendData({ recipient: 'SAL_BOB', amount: '49000' });
                                                    setIsPasted(false);
                                                    setPasteWarning(false);
                                                }}
                                                className="px-2 py-1 bg-purple-950/60 hover:bg-purple-900/60 border border-purple-700/60 text-purple-300 text-[10px] font-semibold rounded-lg"
                                            >
                                                💸 Simulate Rapid Drain
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSendData({ recipient: 'SAL_ALICE', amount: '2500' });
                                                    setIsPasted(false);
                                                    setPasteWarning(false);
                                                }}
                                                className="px-2 py-1 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/60 text-emerald-300 text-[10px] font-semibold rounded-lg"
                                            >
                                                ✨ Clean Transfer
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-sm text-slate-400 block">Recipient Account Number</label>
                                            <span className="text-[10px] text-cyan-400/80 flex items-center gap-1">
                                                <Fingerprint className="w-3 h-3" /> BioCatch Protected
                                            </span>
                                        </div>
                                        <input
                                            type="text"
                                            value={sendData.recipient}
                                            onChange={(e) => setSendData({ ...sendData, recipient: e.target.value })}
                                            onPaste={() => {
                                                setIsPasted(true);
                                                setPasteWarning(true);
                                            }}
                                            onKeyDown={() => {
                                                const now = performance.now();
                                                if (lastKeyUpTime) {
                                                    const flight = now - lastKeyUpTime;
                                                    setFlightTimes(prev => [...prev.slice(-15), flight]);
                                                }
                                                setLastKeyDownTime(now);
                                            }}
                                            onKeyUp={() => {
                                                const now = performance.now();
                                                if (lastKeyDownTime) {
                                                    const dwell = now - lastKeyDownTime;
                                                    setDwellTimes(prev => [...prev.slice(-15), dwell]);
                                                }
                                                setLastKeyUpTime(now);
                                            }}
                                            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                                            placeholder="SAL1234567890"
                                        />
                                    </div>

                                    {pasteWarning && (
                                        <div className="bg-amber-950/40 border border-amber-600/50 p-3 rounded-lg text-amber-300 text-xs flex items-start gap-2 animate-pulse">
                                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                                            <div>
                                                <p className="font-bold">⚠️ BioCatch Scam Detection Alert</p>
                                                <p className="text-[11px] text-amber-200/80">Recipient account was pasted from clipboard. If you were instructed to copy this over phone call or WhatsApp, this could be an Authorized Push Payment (APP) scam.</p>
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-sm text-slate-400 block mb-1">Amount (₹)</label>
                                        <input
                                            type="number"
                                            value={sendData.amount}
                                            onChange={(e) => setSendData({ ...sendData, amount: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white text-xl"
                                            placeholder="0.00"
                                        />
                                    </div>

                                    {sendError && (
                                        <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-2 rounded-lg text-sm">
                                            {sendError}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={() => {
                                            setSendModal(false);
                                            setRealForensics(null);
                                        }}
                                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSendMoney}
                                        disabled={sendLoading}
                                        className="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold disabled:opacity-50"
                                    >
                                        {sendLoading ? 'Sending...' : 'Confirm Transfer'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
