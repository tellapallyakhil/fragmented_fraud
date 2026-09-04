'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { ShieldCheck, Mail, Lock, AlertCircle, LogIn, Sparkles, User, AlertTriangle, Zap, ArrowRight } from 'lucide-react';

const DEMO_PERSONAS = [
    {
        id: 'a0000000-0000-0000-0000-000000000001',
        name: 'Alice Sen',
        email: 'alice@demo.com',
        accountNumber: 'SAL_ALICE',
        role: 'Clean Customer',
        tag: 'Clean Account',
        tagColor: 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400',
        description: 'Clean behavioral telemetry & natural typing cadence'
    },
    {
        id: 'a0000000-0000-0000-0000-000000000003',
        name: 'Charlie User',
        email: 'charlie@demo.com',
        accountNumber: 'SAL_CHARLIE',
        role: 'Scam Victim Persona',
        tag: 'APP Scam Demo',
        tagColor: 'bg-amber-950/60 border-amber-700/60 text-amber-400',
        description: 'Test clipboard paste intercept & BioCatch scam warning'
    },
    {
        id: 'a0000000-0000-0000-0000-000000000002',
        name: 'Bob User',
        email: 'bob@demo.com',
        accountNumber: 'SAL_BOB',
        role: 'Pass-Through Mule',
        tag: 'Rapid Drain Demo',
        tagColor: 'bg-purple-950/60 border-purple-700/60 text-purple-400',
        description: 'Test rapid fund drain (>=85% within <15 mins)'
    },
    {
        id: 'a0000000-0000-0000-0000-000000000010',
        name: 'Xavier (Syndicate)',
        email: 'xavier@hacker.com',
        accountNumber: 'HACKER_X',
        role: 'Watchlist Target',
        tag: 'OFAC / Syndicate',
        tagColor: 'bg-red-950/60 border-red-700/60 text-red-400',
        description: 'High-risk target node for FIU War Room & SAR filing'
    }
];

export default function LoginPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSelectPersona = (persona: typeof DEMO_PERSONAS[0]) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('demo_persona_id', persona.id);
            localStorage.setItem('demo_persona_name', persona.name);
            localStorage.setItem('demo_persona_acc', persona.accountNumber);
        }
        router.push('/user/dashboard');
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const enteredEmail = formData.email.trim().toLowerCase();
            const enteredPassword = formData.password.trim();

            // 1. Instant check for Demo Accounts with password 123456
            if (enteredPassword === '123456' || enteredPassword === 'password123') {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, full_name, email')
                    .ilike('email', enteredEmail)
                    .maybeSingle();

                if (profile) {
                    const { data: acc } = await supabase
                        .from('accounts')
                        .select('account_number')
                        .eq('user_id', profile.id)
                        .maybeSingle();

                    if (typeof window !== 'undefined') {
                        localStorage.setItem('demo_persona_id', profile.id);
                        localStorage.setItem('demo_persona_name', profile.full_name || profile.email);
                        localStorage.setItem('demo_persona_acc', acc?.account_number || '');
                    }
                    router.push('/user/dashboard');
                    return;
                }
            }

            // 2. Standard Supabase Auth attempt
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email: enteredEmail,
                password: enteredPassword,
            });

            if (!authError && data?.session) {
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('demo_persona_id');
                }
                router.push('/user/dashboard');
                return;
            }

            // 3. Fallback: check database profile
            const { data: fallbackProfile } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .ilike('email', enteredEmail)
                .maybeSingle();

            if (fallbackProfile && enteredPassword === '123456') {
                if (typeof window !== 'undefined') {
                    localStorage.setItem('demo_persona_id', fallbackProfile.id);
                    localStorage.setItem('demo_persona_name', fallbackProfile.full_name || fallbackProfile.email);
                }
                router.push('/user/dashboard');
                return;
            }

            setError(authError?.message || 'Invalid login credentials. Use password 123456 for demo accounts.');
            setLoading(false);
        } catch (err: any) {
            setError(err.message || 'Login failed. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-4xl space-y-6">

                {/* Logo & Header */}
                <div className="text-center">
                    <div className="inline-flex items-center justify-center p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-2xl mb-3 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                        <ShieldCheck className="w-10 h-10 text-cyan-400" />
                    </div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400">
                        🏦 Salaar Bank • FinCrime OS
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Autonomous Fraud & Anti-Money Laundering Defense Portal</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">

                    {/* LEFT: 1-Click Interactive Demo Personas Launcher */}
                    <div className="md:col-span-7 bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <Sparkles className="text-cyan-400" size={18} />
                                <h2 className="text-base font-bold text-white uppercase tracking-wide">
                                    🎭 1-Click Demo Persona Switcher
                                </h2>
                            </div>
                            <span className="text-[11px] text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60 font-semibold">
                                Pitch Ready
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mb-4">
                            Select any pre-configured mock persona below to immediately enter the banking portal and demonstrate live detection scenarios:
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {DEMO_PERSONAS.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => handleSelectPersona(p)}
                                    className="text-left p-3.5 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/50 rounded-xl transition-all group flex flex-col justify-between relative overflow-hidden"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div>
                                            <p className="font-bold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                                                {p.name}
                                            </p>
                                            <p className="text-[11px] font-mono text-slate-400">{p.accountNumber}</p>
                                        </div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${p.tagColor}`}>
                                            {p.tag}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-snug mt-1">
                                        {p.description}
                                    </p>
                                    <div className="mt-3 pt-2 border-t border-slate-900 flex items-center justify-between text-[11px] text-cyan-400 font-semibold group-hover:translate-x-1 transition-transform">
                                        <span>Launch Persona</span>
                                        <ArrowRight size={12} />
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Quick Link to FIU War Room */}
                        <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
                            <span className="text-slate-400">Want to inspect the entire network?</span>
                            <Link href="/network" className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1">
                                🕵️ Open FIU War Room →
                            </Link>
                        </div>
                    </div>

                    {/* RIGHT: Standard Email/Password Sign-In */}
                    <div className="md:col-span-5 bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-2xl">
                        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                            <LogIn size={18} />
                            Custom Account Login
                        </h2>

                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={16} />
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                        placeholder="you@example.com"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={16} />
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-950/40 border border-red-800 text-red-400 px-3 py-2 rounded-lg text-xs flex items-center gap-2">
                                    <AlertCircle size={14} />
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-lg text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? 'Signing In...' : 'Sign In'}
                            </button>
                        </form>

                        <div className="mt-4 text-center text-slate-500 text-xs">
                            Don't have an account?{' '}
                            <Link href="/register" className="text-cyan-400 hover:underline">
                                Create Account
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="text-center">
                    <Link href="/" className="text-slate-500 hover:text-slate-400 text-xs">
                        ← Back to Executive Overview
                    </Link>
                </div>
            </div>
        </div>
    );
}
