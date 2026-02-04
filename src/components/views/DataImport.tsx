import React from 'react';
import { BigQueryImport } from './BigQueryImport';

export const DataImport: React.FC = () => {
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
