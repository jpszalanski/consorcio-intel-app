import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { BigQueryImport } from './BigQueryImport';

export const DataImport: React.FC = () => {
  const { isAdmin, loading } = useAuth();

  if (loading) return null;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-slate-500">
        <AlertTriangle size={48} className="text-amber-500 mb-4" />
        <h3 className="text-xl font-bold text-slate-800">Acesso Restrito</h3>
        <p>Apenas administradores podem importar dados.</p>
      </div>
    );
  }
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-slate-900">Central de Carga de Dados (BigQuery)</h2>
        <p className="text-slate-500 max-w-2xl mx-auto">
          Upload de arquivos para processamento escalável via Cloud Functions e BigQuery.
        </p>
      </div>

      <BigQueryImport />
    </div>
  );
};
