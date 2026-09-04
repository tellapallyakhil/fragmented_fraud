'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrainCircuit, Sparkles, MessageSquare, Send, Loader2, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import React from 'react';

interface ChatProps {
    explanation: string;
}

// Suggested questions for quick access
const SUGGESTED_QUESTIONS = [
    "Analyze the money mule network",
    "Explain the structuring pattern",
    "Analyze deep forensic packets",
    "Show velocity attack details",
    "Generate investigation report"
];

export function InvestigatorChat({ explanation }: ChatProps) {
    const [input, setInput] = React.useState('');
    const [messages, setMessages] = React.useState<{ role: 'user' | 'assistant', content: string, timestamp?: string }[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [showSuggestions, setShowSuggestions] = React.useState(true);
    const [isMounted, setIsMounted] = React.useState(false);
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    const hasSetInitialMessage = React.useRef(false);

    React.useEffect(() => {
        setIsMounted(true);
        // Only set the initial message once to prevent chat resets on refresh
        if (!hasSetInitialMessage.current && explanation) {
            setMessages([{ role: 'assistant', content: explanation, timestamp: new Date().toLocaleTimeString() }]);
            hasSetInitialMessage.current = true;
        }
    }, [explanation]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    React.useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e?: React.FormEvent, quickMessage?: string) => {
        if (e) e.preventDefault();
        const messageToSend = quickMessage || input;
        if (!messageToSend.trim() || isLoading) return;

        const userMessage = messageToSend;
        setInput('');
        setShowSuggestions(false);
        setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date().toLocaleTimeString() }]);
        setIsLoading(true);

        try {
            const { chatWithInvestigator } = await import('@/app/chat-action');
            const result = await chatWithInvestigator(userMessage);

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: result.response,
                timestamp: new Date().toLocaleTimeString()
            }]);
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "⚠️ Error connecting to Sherlock AI. Please try again.",
                timestamp: new Date().toLocaleTimeString()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const formatContent = (content: string) => {
        if (!content) return '';

        // Pre-process code blocks first to preserve content
        const codeBlocks: string[] = [];
        let processed = content.replace(/```([\s\S]*?)```/g, (_, code) => {
            codeBlocks.push(`<pre class="bg-slate-900/90 border border-slate-700 p-2.5 rounded-lg my-2 overflow-x-auto text-xs text-cyan-300 font-mono"><code>${code.trim()}</code></pre>`);
            return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
        });

        // Pre-process inline code
        processed = processed.replace(/`([^`]+)`/g, '<code class="bg-slate-800 text-cyan-300 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');

        // Headers
        processed = processed.replace(/^### (.*$)/gim, '<h4 class="text-sm font-bold text-cyan-300 mt-3 mb-1.5 flex items-center gap-1.5">$1</h4>');
        processed = processed.replace(/^## (.*$)/gim, '<h3 class="text-base font-bold text-purple-400 mt-4 mb-2 flex items-center gap-2">$1</h3>');
        processed = processed.replace(/^# (.*$)/gim, '<h2 class="text-lg font-extrabold text-white mt-4 mb-2 pb-1 border-b border-slate-700">$1</h2>');

        // Horizontal dividers
        processed = processed.replace(/^---$/gim, '<hr class="border-slate-800 my-3" />');

        // Bullet list items (* item or - item or • item)
        processed = processed.replace(/^[*\-•]\s+(.*$)/gim, '<div class="flex items-start gap-2 my-1 pl-1"><span class="text-cyan-400 text-sm leading-none mt-1">•</span><span class="flex-1">$1</span></div>');

        // Numbered list items (1. item)
        processed = processed.replace(/^(\d+)\.\s+(.*$)/gim, '<div class="flex items-start gap-2 my-1 pl-1"><span class="text-purple-400 font-mono text-xs font-bold mt-0.5">$1.</span><span class="flex-1">$2</span></div>');

        // Bold and Italics
        processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong class="text-cyan-300 font-semibold">$1</strong>');
        processed = processed.replace(/__(.*?)__/g, '<strong class="text-cyan-300 font-semibold">$1</strong>');
        processed = processed.replace(/\*([^*\n]+)\*/g, '<em class="text-slate-300 italic">$1</em>');

        // Risk and Alert Badges
        processed = processed.replace(/\b(CRITICAL|HIGH RISK|CRITICAL RISK)\b/g, '<span class="px-1.5 py-0.5 rounded text-[11px] font-bold bg-red-900/60 text-red-300 border border-red-700/50">$1</span>');
        processed = processed.replace(/\b(HIGH)\b/g, '<span class="px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-900/60 text-amber-300 border border-amber-700/50">$1</span>');
        processed = processed.replace(/\b(MODERATE|MEDIUM)\b/g, '<span class="px-1.5 py-0.5 rounded text-[11px] font-bold bg-yellow-900/60 text-yellow-300 border border-yellow-700/50">$1</span>');
        processed = processed.replace(/\b(LOW|CLEAN|SAFE)\b/g, '<span class="px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">$1</span>');
        processed = processed.replace(/\b(FROZEN|QUARANTINED)\b/g, '<span class="px-1.5 py-0.5 rounded text-[11px] font-bold bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">$1</span>');

        // Line breaks (convert remaining single newlines that aren't inside div tags)
        const lines = processed.split('\n');
        const formattedLines = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '<div class="h-2"></div>';
            if (trimmed.startsWith('<div') || trimmed.startsWith('<h') || trimmed.startsWith('<hr') || trimmed.startsWith('<pre') || trimmed.startsWith('__CODE_BLOCK_')) {
                return trimmed;
            }
            return `<p class="my-1">${trimmed}</p>`;
        });

        processed = formattedLines.join('');

        // Restore code blocks
        codeBlocks.forEach((codeBlock, idx) => {
            processed = processed.replace(`__CODE_BLOCK_${idx}__`, codeBlock);
        });

        return processed;
    };

    return (
        <Card className="h-full border-slate-800 bg-slate-950/50 flex flex-col min-h-[400px]">
            <CardHeader className="pb-3 border-b border-slate-800/50">
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-lg">
                        <BrainCircuit className="w-5 h-5 text-purple-400" />
                        <span>AI Investigator</span>
                        <span className="text-xs font-normal text-slate-500 ml-2">"Sherlock"</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Online
                    </div>
                </CardTitle>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        {msg.role === 'assistant' ? (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/30 to-cyan-500/30 border border-purple-500/30 flex items-center justify-center shrink-0">
                                <Sparkles className="w-4 h-4 text-purple-400" />
                            </div>
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border border-cyan-500/30 flex items-center justify-center shrink-0">
                                <MessageSquare className="w-4 h-4 text-cyan-400" />
                            </div>
                        )}
                        <div className={`space-y-1 max-w-[85%]`}>
                            <div className={`border rounded-lg p-3 text-sm leading-relaxed shadow-lg ${msg.role === 'assistant'
                                ? 'bg-slate-900/80 border-slate-700 text-slate-300'
                                : 'bg-cyan-950/30 border-cyan-900/50 text-cyan-50'
                                }`}>
                                <div dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
                            </div>
                            <div className="text-[10px] text-slate-600 px-1">
                                {isMounted ? msg.timestamp : '--:--:--'}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Typing Indicator */}
                {isLoading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/30 to-cyan-500/30 border border-purple-500/30 flex items-center justify-center shrink-0">
                            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                        </div>
                        <div className="bg-slate-900/80 border border-slate-700 rounded-lg p-3 text-sm text-slate-400">
                            <div className="flex items-center gap-2">
                                <span>Sherlock is analyzing</span>
                                <span className="flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Suggested Questions */}
                {showSuggestions && messages.length <= 1 && (
                    <div className="pt-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                            <Zap className="w-3 h-3" />
                            Quick Questions
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {SUGGESTED_QUESTIONS.map((q, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSubmit(undefined, q)}
                                    className="text-xs px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-all"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </CardContent>

            <div className="p-4 border-t border-slate-800 bg-slate-900/30 mt-auto">
                <form onSubmit={handleSubmit} className="relative flex gap-2">
                    <div className="relative flex-1">
                        <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask Sherlock about fraud patterns..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-slate-200"
                            disabled={isLoading}
                        />
                    </div>
                    <Button
                        type="submit"
                        variant="neon"
                        size="icon"
                        disabled={isLoading || !input.trim()}
                        className="shrink-0"
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </Button>
                </form>
            </div>
        </Card>
    );
}
