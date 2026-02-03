
import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { FallbackProps } from 'react-error-boundary';

export const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white rounded-2xl shadow-sm border border-slate-200 m-4">
            <div className="p-4 bg-red-100 text-red-600 rounded-full mb-4">
                <AlertTriangle size={48} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Algo deu errado</h2>
            <p className="text-slate-500 mb-6 max-w-md">
                Ocorreu um erro ao renderizar este componente. Tente recarregar a página ou limpar os dados.
            </p>
            <div className="flex gap-4">
                <button
                    onClick={() => {
                        resetErrorBoundary();
                        window.location.reload();
                    }}
                    className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-slate-800"
                >
                    <RefreshCcw size={18} />
                    Recarregar
                </button>
            </div>
            {error && (
                <pre className="mt-8 p-4 bg-slate-100 rounded-lg text-xs text-left overflow-auto max-w-full text-slate-600 font-mono">
                    {error.toString()}
                </pre>
            )}
        </div>
    );
};
