
import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Trash2, Database, BrainCircuit, Search, Map, LayoutDashboard, FileSpreadsheet, X, AlertTriangle, FileStack, RefreshCw, Loader2 } from 'lucide-react';
import { dataStore } from '../../services/dataStore';
import { ImportedFileLog, Administrator } from '../../types';

type ImportType = 'consolidated' | 'regional_uf' | 'accounting' | null;

interface ProcessedFile {
  file: File;
  type: ImportType;
  data: any[];
  status: 'pending' | 'duplicate' | 'ready' | 'error';
  errorMsg?: string;
  isReprocess?: boolean;
}

export const DataImport: React.FC = () => {
  const [dragActive, setDragActive] = useState(false);
  const [processedQueue, setProcessedQueue] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const detectLayout = (headers: string[], fileName: string): ImportType => {
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const h = headers.map(normalize);
    const name = normalize(fileName);

    // 1. Dados por UF - Layout específico do BACEN
    // Campos: "UF", "Qtde cotistas ativos contemplados por lance", "Qtde adesões no trimestre"
    if (
      name.includes('dadosporuf') || 
      (h.some(x => x === 'uf') && h.some(x => x.includes('contempladosporlance'))) ||
      (h.some(x => x === 'uf') && h.some(x => x.includes('sorteio')))
    ) {
      return 'regional_uf';
    }

    // 2. Dados Consolidados (Segmentos ou Grupos)
    if (
      name.includes('segmentos') || 
      name.includes('consolidado') || 
      name.includes('grupos') || 
      h.includes('nomeadministradora') || 
      h.includes('segmento')
    ) {
      return 'consolidated';
    }

    // 3. Dados Contábeis (Doc 4010)
    if (name.includes('4010') || name.includes('4110') || h.includes('conta') || h.includes('saldo')) {
      return 'accounting';
    }

    return null;
  };

  const readFileContent = (file: File): Promise<ProcessedFile> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsText(file, 'windows-1252');

      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n');
          
          if (lines.length < 2) {
             resolve({ file, type: null, data: [], status: 'error', errorMsg: 'Arquivo vazio' });
             return;
          }

          const firstLine = lines[0];
          const separator = firstLine.includes(';') ? ';' : ',';
          const headers = firstLine.split(separator).map(h => h.trim().replace(/^"|"$/g, ''));
          
          const detectedType = detectLayout(headers, file.name);
          const isDuplicate = !!dataStore.isFileImported(file.name);

          const parsedData = lines.slice(1)
            .filter(line => line.trim() !== '')
            .map(line => {
              const values = line.split(separator);
              return headers.reduce((obj: any, header, i) => {
                let val = values[i]?.trim().replace(/^"|"$/g, '');
                if (val && /^-?[\d\.]+,\d+$/.test(val)) {
                   val = val.replace(/\./g, '').replace(',', '.');
                }
                const numVal = Number(val);
                obj[header] = isNaN(numVal) ? val : numVal;
                return obj;
              }, {});
            });

          resolve({
            file,
            type: detectedType,
            data: parsedData,
            status: isDuplicate ? 'duplicate' : (detectedType ? 'ready' : 'error'),
            errorMsg: !detectedType ? 'Layout não identificado' : undefined
          });
        } catch (err) {
          resolve({ file, type: null, data: [], status: 'error', errorMsg: 'Erro ao processar' });
        }
      };
    });
  };

  const handleFiles = async (files: File[]) => {
    setIsProcessing(true);
    const results = await Promise.all(files.map(f => readFileContent(f)));
    setProcessedQueue(prev => [...prev, ...results]);
    if (results.some(r => r.status === 'duplicate')) setShowConfirmModal(true);
    setIsProcessing(false);
  };

  const finalizeImport = async () => {
    const readyFiles = processedQueue.filter(f => f.status === 'ready');
    if (readyFiles.length === 0) return;

    setIsSaving(true);
    
    // Pequeno delay para garantir que o loader apareça - Corrigido para garantir tipagem correta do Promise
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 800);
    });

    const newLogs: ImportedFileLog[] = [];
    const adminsFound = new Map<string, Administrator>();
    let overviewData: any[] = [];
    let regionalData: any[] = [];

    readyFiles.forEach(f => {
      newLogs.push({
        fileName: f.file.name,
        importDate: new Date().toISOString(),
        type: f.type!,
        recordCount: f.data.length
      });

      // Extração de Administradoras (procura por headers comuns do BACEN)
      f.data.forEach(row => {
        const cnpj = row['CNPJ'] || row['Cnpj'] || row['cnpj'];
        const name = row['Nome da Administradora'] || row['Nome Administradora'] || row['Administradora'];
        if (cnpj && name) {
          adminsFound.set(cnpj.toString(), { cnpj: cnpj.toString(), name, isFavorite: false });
        }
      });

      if (f.type === 'consolidated') overviewData = [...overviewData, ...f.data];
      if (f.type === 'regional_uf') regionalData = [...regionalData, ...f.data];
    });

    dataStore.saveData({
      ...(overviewData.length > 0 && { overview: overviewData }),
      ...(regionalData.length > 0 && { regional: regionalData }),
      administrators: Array.from(adminsFound.values()),
      importedFiles: newLogs
    });

    setIsSaving(false);
    setProcessedQueue(prev => prev.filter(f => f.status !== 'ready'));
    alert(`${readyFiles.length} arquivo(s) e ${adminsFound.size} administradoras indexados.`);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-slate-900">Importação de Dados BACEN</h2>
        <p className="text-slate-500 max-w-2xl mx-auto">
          Arraste múltiplos arquivos CSV (Windows-1252). O sistema identifica UF, Segmentos e Administradoras.
        </p>
      </div>

      <div 
        className={`relative border-2 border-dashed rounded-2xl p-12 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 group ${
          dragActive ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isSaving && fileInputRef.current?.click()}
      >
        <input 
          ref={fileInputRef} 
          type="file" 
          accept=".csv,.txt" 
          multiple 
          className="hidden" 
          onChange={handleFileInput} 
          disabled={isSaving}
        />
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
          {isProcessing ? <Loader2 className="animate-spin" size={32} /> : <FileStack size={32} />}
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-slate-800">Selecione ou Arraste Arquivos</p>
          <p className="text-sm text-slate-500">Detecta CNPJs e Administradoras automaticamente</p>
        </div>
      </div>

      {processedQueue.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <Database size={18} />
              Fila de Importação ({processedQueue.length})
            </h3>
          </div>
          
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto custom-scrollbar">
            {processedQueue.map((item, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="bg-slate-100 p-2 rounded-lg">
                    {item.status === 'ready' ? <CheckCircle2 className="text-emerald-500" size={20} /> :
                     item.status === 'duplicate' ? <AlertTriangle className="text-amber-500" size={20} /> :
                     <AlertCircle className="text-red-500" size={20} />}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{item.file.name}</p>
                    <span className="text-xs font-bold uppercase text-blue-600">{item.type || 'Tipo desconhecido'}</span>
                  </div>
                </div>
                <button onClick={() => !isSaving && setProcessedQueue(prev => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500 p-2">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button
              onClick={finalizeImport}
              disabled={isSaving || processedQueue.filter(f => f.status === 'ready').length === 0}
              className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 transition-all"
            >
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Processando Dados...
                </>
              ) : (
                <>
                  <CheckCircle2 size={20} />
                  Importar {processedQueue.filter(f => f.status === 'ready').length} Arquivos
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <RefreshCw className="text-amber-600" /> Duplicados Detectados
            </h3>
            <p className="text-slate-600 mb-6">Arquivos com este nome já foram importados. Deseja reprocessá-los e atualizar os dados?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { 
                setProcessedQueue(prev => prev.map(p => p.status === 'duplicate' ? {...p, status: 'error', errorMsg: 'Pulado'} : p));
                setShowConfirmModal(false);
              }} className="px-4 py-2 text-slate-600 font-medium">Ignorar</button>
              <button onClick={() => {
                setProcessedQueue(prev => prev.map(p => p.status === 'duplicate' ? {...p, status: 'ready'} : p));
                setShowConfirmModal(false);
              }} className="px-4 py-2 bg-amber-600 text-white font-bold rounded-lg">Sim, Reprocessar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};