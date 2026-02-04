
import React, { useState, useRef } from 'react';
import { CheckCircle2, AlertCircle, Trash2, Database, Loader2, CloudUpload, AlertTriangle, ArrowRight, TableProperties } from 'lucide-react';
import { BigQueryImport } from './BigQueryImport';
import { dataStore } from '../../services/dataStore';
import { ImportedFileLog, BacenSegment } from '../../types';

type ImportType = 'segments' | 'real_estate' | 'movables' | 'regional_uf' | null;

interface ProcessedFile {
  file: File;
  type: ImportType;
  data: any[];
  status: 'pending' | 'duplicate' | 'ready' | 'error';
  errorMsg?: string;
}

const normalizeKey = (str: string) => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

export const DataImport: React.FC = () => {
  const [importMode, setImportMode] = useState<'legacy' | 'bigquery'>('legacy');
  const [dragActive, setDragActive] = useState(false);
  const [processedQueue, setProcessedQueue] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [clearBeforeImport, setClearBeforeImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectLayout = (headers: string[], fileName: string): ImportType => {
    const name = normalizeKey(fileName);
    const h = headers.map(normalizeKey);

    if (name.includes('imoveis')) return 'real_estate';
    if (name.includes('moveis') && !name.includes('imoveis')) return 'movables';
    if (name.includes('veiculos')) return 'movables';
    if (name.includes('segmentos')) return 'segments';
    if (name.includes('dadosporuf') || name.includes('consorcios_uf') || h.includes('uf')) return 'regional_uf';

    // Fallback: Column based
    if (h.some(x => x.includes('valormedio') || x.includes('vlbem'))) return 'movables';

    // Fix for User: Prioritize UF detection if specific columns exist
    if (h.some(x => x.includes('unidade') && x.includes('federacao')) || h.includes('uf')) return 'regional_uf';

    if (h.includes('codigodosegmento') && !h.some(x => x.includes('valormedio'))) return 'segments';

    return null;
  };

  const detectHeavyFile = (fileName: string): boolean => {
    // Files that are too large for browser processing
    return /Bens_Moveis_Grupos/i.test(fileName);
  };

  const readFileContent = (file: File): Promise<ProcessedFile> => {
    return new Promise((resolve) => {
      // 1. Check for Heavy Files immediately
      if (detectHeavyFile(file.name)) {
        resolve({
          file,
          type: null,
          data: [],
          status: 'error',
          errorMsg: 'ARQUIVO MUITO GRANDE: Use a aba Importação BigQuery'
        });
        return;
      }

      const reader = new FileReader();
      reader.readAsText(file, 'windows-1252');

      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string;
          // ... rest of the logic
          const lines = text.split('\n');
          if (lines.length < 2) {
            resolve({ file, type: null, data: [], status: 'error', errorMsg: 'Arquivo vazio' });
            return;
          }

          const firstLine = lines[0];
          const separator = firstLine.includes(';') ? ';' : ',';
          const headers = firstLine.split(separator).map(h => h.trim().replace(/^"|"$/g, ''));
          const detectedType = detectLayout(headers, file.name);

          const parsedData = lines.slice(1)
            .filter(line => line.trim() !== '')
            .map(line => {
              const values = line.split(separator);
              return headers.reduce((obj: any, header, i) => {
                let val = values[i]?.trim().replace(/^"|"$/g, '');
                obj[header] = val; // Store RAW value
                return obj;
              }, {});
            });

          resolve({
            file,
            type: detectedType,
            data: parsedData,
            status: detectedType ? 'ready' : 'error',
            errorMsg: !detectedType ? 'Layout não reconhecido' : undefined
          });
        } catch (err) {
          resolve({ file, type: null, data: [], status: 'error', errorMsg: 'Erro de leitura' });
        }
      };
    });
  };

  const handleFiles = async (files: File[]) => {
    setIsProcessing(true);
    const results = await Promise.all(files.map(f => readFileContent(f)));
    setProcessedQueue(prev => [...prev, ...results]);
    setIsProcessing(false);
  };

  const handleImportFlow = async () => {
    const readyFiles = processedQueue.filter(f => f.status === 'ready');
    if (readyFiles.length === 0) return;

    try {
      if (clearBeforeImport) {
        setStatusMessage("Limpando banco de dados...");
        await dataStore.clearAllData();
      }

      // Step: Turbo Direct Upload
      setCurrentStep('processing');
      setStatusMessage("Processando e Importando dados (Turbo Mode)...");

      const filesToProcess = readyFiles.map(f => ({
        type: f.type!,
        data: f.data,
        fileName: f.file.name
      }));

      const resultMsg = await dataStore.processAndUploadDirectly(filesToProcess);

      alert(`Importação Concluída!\n${resultMsg}`);
      setProcessedQueue([]);
      setStatusMessage("");
      setCurrentStep('idle');

    } catch (e: any) {
      console.error(e);
      alert(`Erro durante a importação: ${e.message}`);
      setCurrentStep('idle');
      setStatusMessage("");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-slate-900">Central de Carga de Dados</h2>
        <p className="text-slate-500 max-w-2xl mx-auto">
          Processo ETL: Carregue os arquivos CSV brutos para as tabelas temporárias. O sistema executará a normalização automaticamente.
        </p>
      </div>

      <div className="flex justify-center mb-8">
        <div className="bg-slate-100 p-1 rounded-xl inline-flex">
          <button
            onClick={() => setImportMode('legacy')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${importMode === 'legacy' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            Importação Direta (Legado)
          </button>
          <button
            onClick={() => setImportMode('bigquery')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${importMode === 'bigquery' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            Importação BigQuery (Cloud)
          </button>
        </div>
      </div>

      {importMode === 'bigquery' ? (
        <BigQueryImport />
      ) : (
        <>

          <div
            onClick={() => setClearBeforeImport(!clearBeforeImport)}
            className={`border rounded-xl p-4 flex items-start gap-4 cursor-pointer transition-all select-none ${clearBeforeImport
              ? 'bg-amber-50 border-amber-200'
              : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
          >
            <div className={`mt-1 transition-colors ${clearBeforeImport ? 'text-amber-600' : 'text-slate-400'}`}>
              {clearBeforeImport ? <AlertTriangle size={24} /> : <Database size={24} />}
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className={`font-bold text-sm ${clearBeforeImport ? 'text-amber-900' : 'text-slate-700'}`}>
                  Limpeza Prévia (Reset Completo)
                </h3>

                <div className={`w-11 h-6 rounded-full relative transition-colors ${clearBeforeImport ? 'bg-amber-500' : 'bg-slate-300'}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${clearBeforeImport ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
              </div>
              <p className={`text-sm mt-1 leading-relaxed ${clearBeforeImport ? 'text-amber-800' : 'text-slate-500'}`}>
                {clearBeforeImport
                  ? "Ativado: Apaga TUDO antes da carga."
                  : "Desativado: Adiciona novos dados ao banco existente."}
              </p>
            </div>
          </div>

          <div
            className={`relative border-2 border-dashed rounded-2xl p-12 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 group ${dragActive ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
              }`}
            onDragEnter={() => setDragActive(true)}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files));
            }}
            onClick={() => currentStep === 'idle' && fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".csv,.txt" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))} disabled={currentStep !== 'idle'} />
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
              {isProcessing || currentStep !== 'idle' ? <Loader2 className="animate-spin" size={32} /> : <CloudUpload size={32} />}
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-slate-800">
                {currentStep === 'idle' ? 'Clique ou Arraste os arquivos CSV' : statusMessage || 'Processando...'}
              </p>
              {currentStep === 'idle' && (
                <p className="text-sm text-slate-500">Suporta: Segmentos, Bens Imóveis, Bens Móveis, DadosPorUF</p>
              )}
            </div>
          </div>

          {processedQueue.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                <h3 className="font-bold text-slate-700 flex items-center gap-2"><TableProperties size={18} /> Arquivos para Staging (Tabelas Temporárias)</h3>
              </div>
              <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto custom-scrollbar">
                {processedQueue.map((item, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center gap-4">
                      <div className="bg-slate-100 p-2 rounded-lg">
                        {item.status === 'ready' ? <CheckCircle2 className="text-emerald-500" size={20} /> : <AlertCircle className="text-red-500" size={20} />}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{item.file.name}</p>
                        <p className="text-xs text-slate-500">
                          {item.data.length} registros brutos • {item.type ? <span className="text-blue-600 font-bold uppercase">{item.type}</span> : <span className="text-red-500">TIPO DESCONHECIDO</span>}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setProcessedQueue(prev => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500"><Trash2 size={18} /></button>
                  </div>
                ))}
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-4">
                <button
                  onClick={handleImportFlow}
                  disabled={currentStep !== 'idle' || processedQueue.filter(f => f.status === 'ready').length === 0}
                  className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-slate-800 disabled:opacity-50 flex items-center gap-3"
                >
                  {currentStep !== 'idle' ? (
                    <><Loader2 className="animate-spin" size={20} /> {statusMessage || 'Processando...'}</>
                  ) : (
                    <><ArrowRight size={20} /> Iniciar Carga e Tratamento</>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
