'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function generateAccountNumber() {
    return 'SAL' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

export default function RegisterPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        fullName: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Step 1: Sign up the user
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                        full_name: formData.fullName
                    }
                }
            });

            if (authError) {
                // Check for specific errors
                if (authError.message.includes('Database error')) {
                    setError('Account exists or database issue. Try logging in instead, or use a different email.');
                } else if (authError.message.includes('already registered')) {
                    setError('This email is already registered. Please login instead.');
                } else {
                    setError(authError.message);
                }
                setLoading(false);
                return;
            }

            if (!authData.user) {
                setError('Registration failed. Please try again.');
                setLoading(false);
                return;
            }

            const userId = authData.user.id;
            const accountNumber = generateAccountNumber();

            // Step 2: Create profile manually
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: userId,
                    full_name: formData.fullName,
                    email: formData.email
                });

            if (profileError) {
                console.log('Profile creation error (may already exist):', profileError.message);
                // Continue anyway - profile might already exist from trigger
            }

            // Step 3: Create bank account manually
            const { error: accountError } = await supabase
                .from('accounts')
                .insert({
                    user_id: userId,
                    account_number: accountNumber,
                    balance: 100000, // ₹1,00,000 welcome bonus
                    risk_score: 0,
                    is_frozen: false
                });

            if (accountError) {
                console.log('Account creation error (may already exist):', accountError.message);
                // Continue anyway - account might already exist from trigger
            }

            setSuccess(true);
            setLoading(false);

            // Redirect to login after 2 seconds
            setTimeout(() => {
                router.push('/login');
            }, 2000);

        } catch (err: any) {
            setError(err.message || 'Registration failed');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
                        🏦 Salaar Bank
                    </h1>
                    <p className="text-slate-500 mt-2">Open Your Account Today</p>
                </div>

                {/* Card */}
                <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl p-8 shadow-2xl">
                    <h2 className="text-xl font-semibold text-white mb-6">Create Account</h2>

                    {success ? (
                        <div className="text-center py-8">
                            <div className="text-5xl mb-4">✅</div>
                            <h3 className="text-green-400 text-xl font-bold mb-2">
                                Account Created!
                            </h3>
                            <p className="text-slate-400 mb-4">
                                Your account has been credited with <strong className="text-green-400">₹1,00,000</strong>
                            </p>
                            <p className="text-slate-500 text-sm">Redirecting to login...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleRegister} className="space-y-4">
                            <div>
                                <label className="text-sm text-slate-400 block mb-1">Full Name</label>
                                <input
                                    type="text"
                                    value={formData.fullName}
                                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="Vikram Sen"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-sm text-slate-400 block mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-sm text-slate-400 block mb-1">Password</label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                />
                            </div>

                            <div className="bg-cyan-900/20 border border-cyan-800/50 rounded-lg p-3 text-center">
                                <p className="text-cyan-400 text-sm">
                                    🎁 New accounts receive <strong>₹1,00,000</strong> welcome bonus!
                                </p>
                            </div>

                            {error && (
                                <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-2 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
                            >
                                {loading ? 'Creating Account...' : 'Open Account'}
                            </button>
                        </form>
                    )}

                    <div className="mt-6 text-center text-slate-500 text-sm">
                        Already have an account?{' '}
                        <Link href="/login" className="text-cyan-400 hover:underline">
                            Sign In
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
