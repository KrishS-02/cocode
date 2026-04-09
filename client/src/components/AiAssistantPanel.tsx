import { API_BASE_URL } from '../config';
import React, { useState, useRef, useEffect } from 'react';

import { X, Send, Bot, Code2, AlertCircle } from 'lucide-react';
import axios from 'axios';

interface AiAssistantPanelProps {
    isOpen: boolean;
    onClose: () => void;
    editorInstance: any;
    token: string;
}

interface Message {
    id: string;
    role: 'user' | 'ai';
    content: string;
    codeContext?: string;
}

const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({ isOpen, onClose, editorInstance, token }) => {
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', role: 'ai', content: 'Hi! I am your AI coding assistant. Highlight some code and ask me a question!' }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!inputValue.trim()) return;

        let selectedCode = '';
        if (editorInstance) {
            const selection = editorInstance.getSelection();
            if (selection && !selection.isEmpty()) {
                selectedCode = editorInstance.getModel().getValueInRange(selection);
            }
        }

        const newUserMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue,
            codeContext: selectedCode
        };

        setMessages(prev => [...prev, newUserMsg]);
        setInputValue('');
        setIsLoading(true);
        setError(null);

        try {
            const response = await axios.post(`${API_BASE_URL}/api/ai/ask`, {
                query: newUserMsg.content,
                codeContext: newUserMsg.codeContext
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const newAiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: response.data.response
            };
            setMessages(prev => [...prev, newAiMsg]);
        } catch (err: any) {
            console.error("AI Request Failed", err);
            // Spring Boot errors return an object like {timestamp, status, error, path}
            // We must extract a string, not set the object directly (would crash React)
            const errData = err.response?.data;
            let errMsg = "Failed to communicate with AI.";
            if (typeof errData === 'string') {
                errMsg = errData;
            } else if (errData?.message) {
                errMsg = errData.message;
            } else if (errData?.error) {
                errMsg = `${errData.error} (${errData.status || err.response?.status})`;
            } else if (err.message) {
                errMsg = err.message;
            }
            setError(errMsg);
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: "Sorry, I couldn't process your request. Please try again."
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute right-0 top-0 h-full w-80 bg-slate-900 border-l border-slate-700 flex flex-col shadow-2xl z-40 transform transition-transform duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <Bot size={18} className="text-indigo-400" />
                        <h2 className="font-semibold text-white text-md">AI Assistant</h2>
                    </div>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="bg-red-500/20 text-red-200 p-2 text-xs flex items-center gap-2 border-b border-red-500/50">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                </div>
            )}

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        {msg.role === 'ai' && (
                            <span className="text-xs text-slate-500 mb-1 ml-1 font-medium">CoCode AI</span>
                        )}
                        <div className={`px-4 py-3 rounded-2xl text-sm max-w-[90%] shadow-md ${msg.role === 'user'
                            ? 'bg-indigo-600 text-white rounded-tr-sm'
                            : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'
                            }`}>
                            {msg.codeContext && (
                                <div className="mb-2 p-2 bg-slate-950 rounded flex flex-col border border-slate-700">
                                    <div className="flex items-center gap-1 text-slate-500 text-xs mb-1">
                                        <Code2 size={10} />
                                        <span>Highlighted Code</span>
                                    </div>
                                    <pre className="text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                                        {msg.codeContext}
                                    </pre>
                                </div>
                            )}
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex flex-col items-start">
                        <span className="text-xs text-slate-500 mb-1 ml-1 font-medium">CoCode AI</span>
                        <div className="px-4 py-3 rounded-2xl text-sm bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm flex items-center gap-2">
                            <Bot size={14} className="animate-bounce text-indigo-400" />
                            <span className="animate-pulse">Thinking...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-slate-800 border-t border-slate-700">
                <div className="flex gap-2 relative">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={editorInstance?.getSelection()?.isEmpty() === false ? "Ask about selected code..." : "Ask a question..."}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-full px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-500"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isLoading}
                        className="absolute right-1 top-1 bottom-1 bg-indigo-600 text-white p-2 rounded-full hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center aspect-square"
                    >
                        <Send size={14} className="ml-0.5" />
                    </button>
                </div>
                <div className="text-center mt-2">
                    <span className="text-[10px] text-slate-500">Highlight code in editor to include it contextually.</span>
                </div>
            </div>
        </div>
    );
};

export default AiAssistantPanel;
