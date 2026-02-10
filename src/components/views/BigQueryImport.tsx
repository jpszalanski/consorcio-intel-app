
import React, { useState, useCallback } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, HardDrive, X } from 'lucide-react';
import { uploadFileToStorage } from '../../services/storageService';
import { db } from '../../services/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface FileUploadStatus {
    file: File;
    progress: number;
    status: 'pending' | 'uploading' | 'completed' | 'error';
    error?: string;
    path?: string;
}

// Helper to extract metadata from filename
// Helper to extract metadata from filename with STRICT validation
const parseFileName = (fileName: string) => {
    const name = fileName; // No lowercasing, keep strict case if needed or just use ignoreCase flag

    // Strict Regex Patterns (Based on "ESTRUTURA DE DADOS.txt")
    // Format: YYYYMM[Name].csv
    // 1. Segmentos_Consolidados -> segments
    // 2. Bens_Imoveis_Grupos -> real_estate
    // 3. Bens_Moveis_Grupos -> moveis
    // 4. Consorcios_UF -> regional_uf

    const segmentsRegex = /^(\d{4})[-_]?(\d{2})[-_]?Segmentos_Consolidados/i;
    const realEstateRegex = /^(\d{4})[-_]?(\d{2})[-_]?Bens_Imoveis_Grupos/i;
    const moveisRegex = /^(\d{4})[-_]?(\d{2})[-_]?Bens_Moveis_Grupos/i;
    // Matches: 202509Consorcios_UF, 202403UF, 2024-03-UF, etc.
    const ufRegex = /^(\d{4})[-_]?(\d{2})[-_]?(?:Consorcios_)?UF/i;
    // Matches: 202412Doc_4010_Consorcios_Administradoras.csv
    const adminRegex = /^(\d{4})[-_]?(\d{2})[-_]?Doc_4010_Consorcios_Administradoras/i;

    let fileType = 'UNKNOWN';
    let referenceDate = null;
    let match = null;

    if ((match = name.match(segmentsRegex))) {
        fileType = 'segments';
    } else if ((match = name.match(realEstateRegex))) {
        fileType = 'real_estate';
    } else if ((match = name.match(moveisRegex))) {
        fileType = 'moveis';
    } else if ((match = name.match(ufRegex))) {
        fileType = 'regional_uf';
    } else if ((match = name.match(adminRegex))) {
        fileType = 'administrators';
    }

    if (match) {
        // match[1] = YYYY, match[2] = MM
        referenceDate = `${match[1]}-${match[2]}`;
    } else {
        // Fallback for user convenience if strict fails but looks like a file (optional, but requested STRICT)
        // User asked for STRICT validation: "OS NOMES DOS ARQUIVOS SAO PADRONIZADOS E VOCE DEVE VALIDAR COM O NOME PADRONIZADO"
        // So we keep UNKNOWN if not matched.
    }

    return { fileType, referenceDate };
};

export const BigQueryImport: React.FC = () => {
    const [files, setFiles] = useState<FileUploadStatus[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files?.length) {
            const newFiles = Array.from(e.dataTransfer.files).map(file => ({
                file,
                progress: 0,
                status: 'pending' as const
            }));
            setFiles(prev => [...prev, ...newFiles]);
        }
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            const newFiles = Array.from(e.target.files).map(file => ({
                file,
                progress: 0,
                status: 'pending' as const
            }));
            setFiles(prev => [...prev, ...newFiles]);
        }
    };

    const startUpload = async () => {
        const pendingFiles = files.filter(f => f.status === 'pending');
        if (pendingFiles.length === 0) return;

        for (const fileStatus of pendingFiles) {
            // Update status to uploading
            setFiles(prev => prev.map(f => f.file === fileStatus.file ? { ...f, status: 'uploading' } : f));

            try {
                const { storagePath } = await uploadFileToStorage(fileStatus.file, (progress) => {
                    setFiles(prev => prev.map(f => f.file === fileStatus.file ? { ...f, progress } : f));
                });

                // Register in Control Center with Parsed Metadata
                // ID = filename without extension
                const safeId = fileStatus.file.name.replace(/\.[^/.]+$/, "");
                const { fileType, referenceDate } = parseFileName(fileStatus.file.name);

                await setDoc(doc(db, 'file_imports_control', safeId), {
                    fileName: fileStatus.file.name,
                    storagePath: storagePath,
                    fileType: fileType,
                    referenceDate: referenceDate || 'Pendente',
                    processedAt: serverTimestamp(), // Upload Time
                    status: 'UPLOADED',
                    rowsProcessed: 0
                });

                // Update status to completed
                setFiles(prev => prev.map(f => f.file === fileStatus.file ? { ...f, status: 'completed', progress: 100, path: storagePath } : f));
            } catch (error: any) {
                console.error("Upload error", error);
                setFiles(prev => prev.map(f => f.file === fileStatus.file ? { ...f, status: 'error', error: 'Falha no envio' } : f));
            }
        }
    };

    const removeFile = (idx: number) => {
        setFiles(prev => prev.filter((_, i) => i !== idx));
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-8 text-white shadow-lg">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-white/10 rounded-xl">
                        <UploadCloud size={32} className="text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">Importação via BigQuery (Storage)</h2>
                        <p className="text-slate-300">Envie arquivos brutos para processamento escalável em nuvem.</p>
                    </div>
                </div>

                <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-100 flex items-start gap-3">
                    <HardDrive className="shrink-0 mt-0.5" size={16} />
                    <p>
                        <strong>Estratégia de Dados Massivos:</strong> Os arquivos são enviados diretamente para o Storage Seguro e processados assincronamente.
                        Ideal para cargas históricas completas ou arquivos &gt; 50MB que travam o navegador.
                    </p>
                </div>
            </div>

            {/* Dropzone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'
                    }`}
            >
                <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-4">
                    <FileSpreadsheet className="text-slate-400" size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">Arraste planilhas aqui</h3>
                <p className="text-slate-500 mb-6">Suporta arquivos .CSV e .XLSX (Segmentos, Grupos, Cotas)</p>

                <label className="inline-block relative">
                    <span className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 cursor-pointer transition-colors shadow-lg flex items-center gap-2 focus-within:ring-4 focus-within:ring-blue-500/30">
                        <UploadCloud size={20} />
                        Selecionar Arquivos
                        <input
                            type="file"
                            multiple
                            accept=".csv,.xlsx,.xls"
                            className="sr-only"
                            onChange={handleFileSelect}
                        />
                    </span>
                </label>
            </div>

            {/* File List */}
            {files.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700">Arquivos na Fila ({files.length})</h3>
                        <button
                            onClick={startUpload}
                            disabled={files.some(f => f.status === 'uploading') || files.every(f => f.status === 'completed')}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                        >
                            {files.some(f => f.status === 'uploading') ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
                            Iniciar Upload
                        </button>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {files.map((item, idx) => (
                            <div key={idx} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                                <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                                    <FileSpreadsheet size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-800 truncate">{item.file.name}</p>
                                    <p className="text-xs text-slate-500">{(item.file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>

                                {/* Status */}
                                <div className="w-32">
                                    {item.status === 'pending' && <span className="text-xs font-bold text-slate-400 uppercase">Pendente</span>}
                                    {item.status === 'uploading' && (
                                        <div
                                            className="w-full bg-slate-200 rounded-full h-2 overflow-hidden"
                                            role="progressbar"
                                            aria-valuenow={item.progress}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                        >
                                            <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${item.progress}%` }}></div>
                                        </div>
                                    )}
                                    {item.status === 'completed' && (
                                        <div className="flex items-center gap-1 text-green-600 text-xs font-bold uppercase">
                                            <CheckCircle2 size={14} /> Enviado
                                        </div>
                                    )}
                                    {item.status === 'error' && (
                                        <div className="flex items-center gap-1 text-red-600 text-xs font-bold uppercase">
                                            <AlertCircle size={14} /> Erro
                                        </div>
                                    )}
                                </div>

                                {item.status !== 'uploading' && (
                                    <button
                                        onClick={() => removeFile(idx)}
                                        className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
                                        aria-label={`Remover ${item.file.name}`}
                                        title="Remover arquivo"
                                    >
                                        <X size={20} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
