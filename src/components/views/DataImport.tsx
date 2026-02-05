import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { BigQueryImport } from './BigQueryImport';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';

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

      {/* DANGER ZONE */}
      <div className="pt-12 border-t border-slate-200 mt-12">
        <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
          <AlertTriangle className="text-red-500" /> Zona de Perigo
        </h3>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-slate-800 font-medium">Excluir todos os dados do sistema</p>
            <p className="text-red-600/80 text-sm mt-1">
              Esta ação apagará <strong>todos</strong> os registros importados do banco de dados e registros de controle.
              <br />Os arquivos brutos (Storage) não serão apagados, mas o BigQuery e painéis serão limpos.
            </p>
          </div>
          <button
            onClick={async () => {
              const confirm1 = confirm("ATENÇÃO: Você está prestes a apagar TODOS os dados do sistema. Esta ação é irreversível.");
              if (!confirm1) return;
              const confirm2 = confirm("Tem certeza absoluta? Digite 'CONFIRMAR' mentalmente e clique em OK para prosseguir.");
              if (!confirm2) return;

              try {
                const reset = httpsCallable(functions, 'resetSystemData');

                await reset();
                alert("Sistema resetado com sucesso.");
                window.location.reload();
              } catch (e: any) {
                alert("Erro ao resetar: " + e.message);
              }
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-red-900/20 transition-all flex items-center gap-2 whitespace-nowrap"
          >
            <Trash2 size={18} /> Apagar Tudo
          </button>
        </div>
      </div>
    </div>
  );
};
