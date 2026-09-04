'use server';

import { retrieveDocuments, buildContext, storeDocument } from "@/lib/rag";
import { supabase } from "@/lib/supabase";
import { deriveHardwareProfile } from "@/lib/fraud/hardware-identity";

// Fetch real transaction data from Supabase with physical hardware forensics
async function getRealTransactionContext() {
    try {
        // Get recent transactions
        const { data: transactions } = await supabase
            .from('transactions')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(50);

        // Get accounts
        const { data: accounts } = await supabase
            .from('accounts')
            .select('*');

        // Get profiles
        const { data: profiles } = await supabase
            .from('profiles')
            .select('*');

        if (!transactions || transactions.length === 0) {
            return null;
        }

        // Build account lookup
        const accountMap = new Map(accounts?.map(a => [a.id, a]) || []);
        const accountByNumber = new Map(accounts?.map(a => [a.account_number, a]) || []);
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        // Calculate metrics
        const inDegreeMap = new Map<string, number>();
        const macMap = new Map<string, Set<string>>();

        transactions.forEach(tx => {
            const toAcc = tx.to_account_number;
            inDegreeMap.set(toAcc, (inDegreeMap.get(toAcc) || 0) + 1);

            const hw = deriveHardwareProfile(tx.device_id, tx.ip_address, tx.device_name);
            if (!macMap.has(hw.macAddress)) macMap.set(hw.macAddress, new Set());
            macMap.get(hw.macAddress)!.add(tx.from_account_id);
        });

        // Find potential orchestrators (high in-degree)
        const topReceivers = Array.from(inDegreeMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        // Detect structuring (amounts between 9000-9999 or 40000-49999)
        const structuringTxs = transactions.filter(tx => (tx.amount >= 9000 && tx.amount <= 9999) || (tx.amount >= 40000 && tx.amount <= 49999));

        // Detect MAC collisions
        const macCollisions = Array.from(macMap.entries()).filter(([_, set]) => set.size >= 2);

        // Get frozen accounts
        const frozenAccounts = accounts?.filter(a => a.is_frozen) || [];

        // Build comprehensive context
        let context = `
SALAAR BANK - REAL-TIME HARDWARE & FINANCIAL INTELLIGENCE
=========================================================

📊 TRANSACTION SUMMARY:
- Total Transactions Analyzed: ${transactions.length}
- Total Accounts: ${accounts?.length || 0}
- Frozen Accounts: ${frozenAccounts.length}
- Hardware MAC Collisions Detected: ${macCollisions.length}

💰 RECENT TRANSACTIONS (Forensic Sample):
`;

        transactions.slice(0, 8).forEach(tx => {
            const fromAcc = accountMap.get(tx.from_account_id);
            const fromProfile = fromAcc ? profileMap.get(fromAcc.user_id) : null;
            const toAcc = accountByNumber.get(tx.to_account_number);
            const toProfile = toAcc ? profileMap.get(toAcc?.user_id) : null;
            const hw = deriveHardwareProfile(tx.device_id, tx.ip_address, tx.device_name);

            context += `
- ₹${tx.amount.toLocaleString('en-IN')} | ${fromProfile?.full_name || tx.from_account_id} → ${toProfile?.full_name || tx.to_account_number}
  Time: ${new Date(tx.timestamp).toLocaleString('en-IN')}
  Physical MAC: ${hw.macAddress} | Hardware IMEI: ${hw.imei}
  Network IP: ${tx.ip_address || 'Unknown'}${hw.isVpnSuspected ? ' [VPN/Spoofed]' : ''}
  Device: ${tx.device_name || 'Browser/Mobile'}`;
        });

        // Add hardware collision alerts
        if (macCollisions.length > 0) {
            context += `

🔒 PHYSICAL HARDWARE MAC / IMEI COLLISION ALERTS (Anti-VPN Ground Truth):`;
            macCollisions.forEach(([mac, accSet]) => {
                context += `
- MAC ${mac}: Concurrently operating ${accSet.size} accounts: [${Array.from(accSet).join(', ')}].
  Note: Attackers rotated IP via VPN, but physical MAC & IMEI remain identical.`;
            });
        }

        // Add top receivers (potential orchestrators)
        if (topReceivers.length > 0) {
            context += `

🎯 HIGH IN-DEGREE ACCOUNTS (Potential Orchestrators):`;
            topReceivers.forEach(([accNum, count]) => {
                const acc = accountByNumber.get(accNum);
                const profile = acc ? profileMap.get(acc.user_id) : null;
                context += `
- ${accNum} (${profile?.full_name || 'Unknown'}) | Receiving from ${count} sources | Status: ${acc?.is_frozen ? '🔒 FROZEN' : '🟢 Active'}`;
            });
        }

        // Add structuring alerts
        if (structuringTxs.length > 0) {
            context += `

⚠️ STRUCTURING PATTERN DETECTED:`;
            structuringTxs.slice(0, 4).forEach(tx => {
                context += `
- ₹${tx.amount.toLocaleString('en-IN')} from ${tx.from_account_id} → ${tx.to_account_number}`;
            });
        }

        // Add frozen accounts
        if (frozenAccounts.length > 0) {
            context += `

❄️ FROZEN ACCOUNTS:`;
            frozenAccounts.forEach(acc => {
                const profile = profileMap.get(acc.user_id);
                context += `
- ${acc.account_number} (${profile?.full_name || 'Unknown'}) | Balance: ₹${acc.balance.toLocaleString('en-IN')} | Risk: ${acc.risk_score || 0}`;
            });
        }

        return context;
    } catch (error) {
        console.error('Error fetching real data:', error);
        return null;
    }
}

// Get context for investigation - uses real data with RAG enhancement
async function getContextForCase(caseId: string, query: string) {
    const realContext = await getRealTransactionContext();

    let ragContext = '';
    try {
        const documents = await retrieveDocuments(query, {
            limit: 2,
            caseId: caseId !== 'default' ? caseId : undefined
        });

        if (documents.length > 0) {
            ragContext = await buildContext(documents);
        }
    } catch (error) {
        // Fallback silently
    }

    if (realContext) {
        return realContext + (ragContext ? `\n\n📚 KNOWLEDGE BASE:\n${ragContext}` : '');
    }

    return ragContext || `No transaction data available.`;
}

export async function chatWithInvestigator(message: string, caseId: string = "default") {
    try {
        const context = await getContextForCase(caseId, message);

        const systemPrompt = `You are "Sherlock", an elite Fraud Intelligence AI for SALAAR BANK.

MISSION:
Provide ultra-concise, token-efficient, high-precision forensic analysis based strictly on the case data.

CRITICAL FORENSIC RULES:
1. IP addresses can be easily manipulated / spoofed via VPNs and proxies. Always emphasize Physical MAC Addresses and Chipset IMEIs as the immutable hardware root of trust.
2. If multiple accounts share the same MAC/IMEI, highlight "Physical Hardware Collision / Syndicate Farm".
3. Keep responses brief, structured, and punchy. Maximum 3-4 short bullet sections.
4. Bold **key terms**, **MAC addresses**, **IMEIs**, and **Account IDs**.
5. Conclude with a 1-sentence recommended action (e.g. Quarantine Blast Radius / Freeze).

CASE CONTEXT:
${context}
`;

        let text = "";
        let lastError = "";

        // 1. PRIMARY: Native Google Gemini API (Token-efficient configuration)
        const geminiKey = process.env.GEMINI_API_KEY;
        if (geminiKey) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
                const geminiRes = await fetch(geminiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [
                            {
                                role: "user",
                                parts: [{ text: `${systemPrompt}\n\nUSER QUESTION: ${message}` }]
                            }
                        ],
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 1200,
                            thinkingConfig: {
                                thinkingBudget: 0
                            }
                        }
                    })
                });

                if (geminiRes.ok) {
                    const gData = await geminiRes.json();
                    text = gData.candidates?.[0]?.content?.parts?.[0]?.text || "";
                } else {
                    lastError = await geminiRes.text();
                }
            } catch (gErr: any) {
                lastError = gErr.message;
            }
        }

        // 2. SECONDARY: OpenRouter Fallback
        if (!text) {
            const openRouterKey = process.env.OPENROUTER_API_KEY;
            const openRouterModels = [
                "qwen/qwen-2.5-72b-instruct",
                "deepseek/deepseek-chat",
                "meta-llama/llama-3.3-70b-instruct"
            ];

            for (const modelName of openRouterModels) {
                try {
                    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${openRouterKey}`,
                            "Content-Type": "application/json",
                            "HTTP-Referer": "http://localhost:3000",
                            "X-Title": "Salaar Bank Fraud Intel"
                        },
                        body: JSON.stringify({
                            model: modelName,
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: message }
                            ],
                            temperature: 0.3,
                            max_tokens: 1000
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        text = data.choices?.[0]?.message?.content || "";
                        if (text) break;
                    }
                } catch (orErr: any) {
                    lastError = orErr.message;
                }
            }
        }

        if (!text) {
            throw new Error(`AI generation failed across all providers. Last error: ${lastError}`);
        }

        // Store the conversation for future RAG retrieval
        try {
            await storeDocument({
                content: `INVESTIGATION QUERY: ${message}\n\nAI ANALYSIS: ${text}`,
                metadata: {
                    case_id: caseId,
                    document_type: 'investigation',
                    timestamp: new Date().toISOString()
                }
            });
        } catch (err) {
            // Silently fail - don't break the response
        }

        return { response: text, success: true };

    } catch (error: any) {
        console.error("LLM Error:", error);

        // Fetch real data for fallback response
        try {
            const realContext = await getRealTransactionContext();

            if (realContext) {
                return {
                    response: `## AI Investigation (Offline Mode)

I'm currently unable to connect to the AI service, but here's the real-time data from your database:

${realContext}

**Note:** For detailed analysis, please retry your query when the AI service is available.`,
                    success: true,
                    offline: true
                };
            }
        } catch (e) {
            console.error("Fallback data fetch failed:", e);
        }

        // Ultimate fallback - no data available
        return {
            response: `## System Status

⚠️ **AI Service Temporarily Unavailable**

The AI investigation service could not process your request. This could be due to:
- API rate limiting
- Network connectivity issues
- Service maintenance

**What you can do:**
1. Check the **Network Graph** for real-time visualization
2. View **Reports** for generated analysis
3. Review **Transactions** for raw data
4. Try your query again in a few moments

*Your question: "${message}"*`,
            success: true,
            offline: true
        };
    }
}

// Generate case report using LLM
export async function generateCaseReport(caseData: {
    transactions: any[];
    alerts: any[];
    riskScore: number;
}) {
    const prompt = `Generate a formal fraud investigation case report for the following data:

TRANSACTIONS:
${JSON.stringify(caseData.transactions, null, 2)}

ALERTS:
${JSON.stringify(caseData.alerts, null, 2)}

RISK SCORE: ${caseData.riskScore}/100

Generate a professional report with:
1. Executive Summary
2. Transaction Analysis
3. Risk Assessment
4. Recommended Actions
5. Evidence Summary`;

    return chatWithInvestigator(prompt, 'report_generation');
}
