import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../services/firebase';
import { uploadFileToStorage } from '../../services/storageService';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { IMPORT_DEFINITIONS, getMonthOptions, getYearOptions } from '../../types/uploadTypes';
import {
    FileText, RefreshCw, Trash2, CheckCircle2, AlertCircle, Loader2,
    Calendar, UploadCloud, ChevronRight, HardDrive
} from 'lucide-react';

interface FileControlRecord {
    id: string;
    fileName: string;
    storagePath: string;
    fileType: string;
    processedAt: any;
    status: 'PENDING' | 'UPLOADED' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
    rowsProcessed: number;
    referenceDate?: string;
    errorDetails?: string;
}

export const FileControlView: React.FC = () => {
    // 1. Competence State
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const m = new Date().getMonth(); // 0-11. current month.
        // Usually data is from previous month, but let's default to current for now
        return (m + 1).toString().padStart(2, '0');
    });

    // 2. Data State
    const [records, setRecords] = useState<FileControlRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [uploadingType, setUploadingType] = useState<string | null>(null);

    // 3. Computed Competence String (YYYY-MM)
    const competenceKey = `${selectedYear}-${selectedMonth}`;

    // 4. Load Data for Competence
    useEffect(() => {
        setLoading(true);
        // Note: referenceDate in Firestore is "YYYY-MM"
        const q = query(
            collection(db, 'file_imports_control'),
            where('referenceDate', '==', competenceKey)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FileControlRecord));
            setRecords(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [competenceKey]);

    // 5. Actions
    const handleReprocess = async (file: FileControlRecord) => {
        if (!confirm(`Reprocessar ${file.fileName}?`)) return;
        setProcessingId(file.id);
        try {
            const functions = getFunctions();
            const reprocess = httpsCallable(functions, 'reprocessFile');
            await reprocess({ storagePath: file.storagePath });
            alert('Reprocessamento iniciado!');
        } catch (error: any) {
            alert('Erro: ' + error.message);
        } finally {
            setProcessingId(null);
        }
    };

    const handleDelete = async (file: FileControlRecord) => {
        if (!confirm(`Excluir arquivo ${file.fileName}?`)) return;
        setProcessingId(file.id);
        try {
            const functions = getFunctions();
            const del = httpsCallable(functions, 'deleteFile');
            await del({ fileId: file.id, storagePath: file.storagePath });
        } catch (error: any) {
            alert('Erro: ' + error.message);
        } finally {
            setProcessingId(null);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, typeId: string) => {
        if (!e.target.files?.length) return;
        const file = e.target.files[0];
        setUploadingType(typeId);

        try {
            // Upload to Storage
            const { storagePath } = await uploadFileToStorage(file, (p) => { });

            // Register 'UPLOADED' record immediately
            // Must manually force the referenceDate to match the selected competence 
            // to ensure it shows up in this view, even if filename differs partially
            const safeId = file.name.replace(/\.[^/.]+$/, "");

            await setDoc(doc(db, 'file_imports_control', safeId), {
                fileName: file.name,
                storagePath: storagePath,
                fileType: typeId, // Force the type based on the row clicked
                referenceDate: competenceKey, // Force the date based on selector
                processedAt: serverTimestamp(),
                status: 'UPLOADED',
                rowsProcessed: 0
            });

        } catch (error: any) {
            alert('Erro no upload: ' + error.message);
        } finally {
            setUploadingType(null);
            // Reset input
            e.target.value = '';
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
            {/* Header & Governance Selector */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <HardDrive className="text-blue-600" />
                        Governança de Dados
                    </h2>
                    <p className="text-slate-500 mt-2">Fechamento Mensal e Controle de Qualidade.</p>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-200 flex items-center gap-4">
                    <div className="flex items-center gap-2 text-slate-600 font-bold border-r border-slate-200 pr-4">
                        <Calendar size={20} />
                        COMPETÊNCIA:
                    </div>
                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="bg-slate-50 border-none font-bold text-slate-800 focus:ring-0 rounded-lg"
                    >
                        {getMonthOptions().map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <span className="text-slate-300">/</span>
                    <select
                        value={selectedYear}
                        onChange={e => setSelectedYear(e.target.value)}
                        className="bg-slate-50 border-none font-bold text-slate-800 focus:ring-0 rounded-lg"
                    >
                        {getYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </div>

            {/* Matrix Table */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">Arquivos Obrigatórios (Fechamento {competenceKey})</h3>
                    <div className="text-xs font-bold px-3 py-1 bg-blue-100 text-blue-700 rounded-full">
                        {records.filter(r => r.status === 'SUCCESS').length} / {IMPORT_DEFINITIONS.length} Concluídos
                    </div>
                </div>

                <div className="divide-y divide-slate-100">
                    {IMPORT_DEFINITIONS.map((def) => {
                        // Find if we have a file for this Type
                        const file = records.find(r => r.fileType === def.id);
                        const isUploading = uploadingType === def.id;

                        return (
                            <div key={def.id} className="p-6 flex items-start md:items-center gap-6 group hover:bg-slate-50 transition-colors">
                                {/* Definition Info */}
                                <div className="w-1/3 min-w-[250px]">
                                    <h4 className="font-bold text-slate-800">{def.label}</h4>
                                    <p className="text-xs text-slate-500 mt-1">{def.description}</p>
                                    <div className="mt-2 flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                                            {def.tableId}
                                        </span>
                                        {def.required && <span className="text-[10px] text-red-500 font-bold">*Obrigatório</span>}
                                    </div>
                                </div>

                                {/* Status & File Info */}
                                <div className="flex-1 border-l border-slate-100 pl-6">
                                    {!file ? (
                                        // Empty State (Pending)
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                                <AlertCircle size={20} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-400">Pendente</p>
                                                <p className="text-xs text-slate-400">Nenhum arquivo enviado para esta competência.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        // Filled State
                                        <div className="flex items-center gap-4">
                                            {/* Icon */}
                                            <div className="shrink-0">
                                                {file.status === 'SUCCESS' && <div className="bg-green-100 p-2 rounded-full"><CheckCircle2 className="text-green-600" size={20} /></div>}
                                                {(file.status === 'PROCESSING' || file.status === 'UPLOADED') && <div className="bg-blue-100 p-2 rounded-full"><Loader2 className="text-blue-600 animate-spin" size={20} /></div>}
                                                {file.status === 'ERROR' && <div className="bg-red-100 p-2 rounded-full"><AlertCircle className="text-red-600" size={20} /></div>}
                                            </div>

                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-700 truncate max-w-[300px]" title={file.fileName}>
                                                    {file.fileName}
                                                </p>
                                                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                                    <span>{(new Date(file.processedAt?.seconds * 1000)).toLocaleString()}</span>
                                                    {file.status === 'SUCCESS' && <span className="text-green-600 font-bold">{file.rowsProcessed} linhas</span>}
                                                    {file.status === 'ERROR' && <span className="text-red-600 font-bold">{file.errorDetails}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="shrink-0 flex items-center gap-2">
                                    {/* Upload Button (if missing or error) */}
                                    {(!file || file.status === 'ERROR') && (
                                        <label className={`cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95 ${isUploading ? 'opacity-70 pointer-events-none' : ''}`}>
                                            {isUploading ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
                                            {isUploading ? 'Enviando...' : 'Enviar Arquivo'}
                                            <input
                                                type="file"
                                                accept=".csv,.xlsx"
                                                className="hidden"
                                                onChange={(e) => handleFileUpload(e, def.id)}
                                            />
                                        </label>
                                    )}

                                    {/* Management Buttons (if exists) */}
                                    {file && (
                                        <>
                                            <button
                                                onClick={() => handleReprocess(file)}
                                                disabled={processingId === file.id || file.status === 'PROCESSING' || file.status === 'UPLOADED'}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                                                title="Reprocessar"
                                            >
                                                <RefreshCw size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(file)}
                                                disabled={processingId === file.id}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                                                title="Excluir"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
