import React, { useState, useEffect } from 'react';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { Save, RefreshCw, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react';
import { initialPrompts } from '../../services/geminiService'; // We will export this from service

interface PromptTemplate {
    id: string;
    label: string;
    template: string;
    description: string;
    variables: string[];
}

import { useAuth } from '../../hooks/useAuth';

export const PromptSettings: React.FC = () => {
    const { isAdmin, loading: authLoading } = useAuth();
    const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    const db = getFirestore();

    useEffect(() => {
        if (isAdmin) fetchPrompts();
    }, [isAdmin]);

    if (authLoading) return null;

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500 animate-fade-in">
                <div className="p-4 bg-red-50 rounded-full text-red-500 mb-4">
                    <AlertCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Acesso Negado</h3>
                <p>Configurações de Prompt são exclusivas para administradores.</p>
            </div>
        );
    }


    const fetchPrompts = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, 'prompt_templates'));
            if (querySnapshot.empty) {
                // Seed initial if empty
                const seeded = Object.entries(initialPrompts).map(([key, val]) => ({
                    id: key,
                    label: key.replace(/_/g, ' ').toUpperCase(),
                    template: val,
                    description: 'Prompt padrão do sistema',
                    variables: ['{{context}}']
                }));
                setPrompts(seeded);
            } else {
                const loaded = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as PromptTemplate));
                setPrompts(loaded);
            }
        } catch (error) {
            console.error("Error loading prompts", error);
            setMessage({ text: 'Erro ao carregar prompts.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (id: string, newTemplate: string) => {
        setSaving(true);
        setMessage(null);
        try {
            const ref = doc(db, 'prompt_templates', id);
            const current = prompts.find(p => p.id === id);
            await setDoc(ref, {
                ...current,
                template: newTemplate,
                updatedAt: new Date()
            });

            // Update local state
            setPrompts(prev => prev.map(p => p.id === id ? { ...p, template: newTemplate } : p));
            setMessage({ text: 'Prompt atualizado com sucesso!', type: 'success' });

            // Clear success message after 3s
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            setMessage({ text: 'Falha ao salvar modificações.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-400">Carregando configurações...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-100 rounded-xl text-indigo-600">
                    <MessageSquare size={28} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Gerenciamento de Prompts AI</h2>
                    <p className="text-slate-500">Personalize a "personalidade" e as instruções do Gemini para cada análise.</p>
                </div>
            </div>

            {message && (
                <div className={`p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    {message.text}
                </div>
            )}

            <div className="space-y-6">
                {prompts.map(prompt => (
                    <div key={prompt.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">{prompt.label}</h3>
                                <p className="text-xs text-slate-500">{prompt.description}</p>
                            </div>
                            <div className="text-xs font-mono bg-slate-200 px-2 py-1 rounded text-slate-600">
                                Variáveis: {prompt.variables.join(', ')}
                            </div>
                        </div>
                        <div className="p-6">
                            <label className="block text-sm font-medium text-slate-700 mb-2">Template do Prompt</label>
                            <textarea
                                className="w-full h-64 p-4 border border-slate-200 rounded-lg font-mono text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed resize-y"
                                value={prompt.template}
                                onChange={(e) => setPrompts(prompts.map(p => p.id === prompt.id ? { ...p, template: e.target.value } : p))}
                            />
                            <div className="mt-4 flex justify-end">
                                <button
                                    onClick={() => handleSave(prompt.id, prompt.template)}
                                    disabled={saving}
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                >
                                    <Save size={18} />
                                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
