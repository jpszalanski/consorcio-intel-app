import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { db } from '../../services/firebase';
import { IMPORT_DEFINITIONS, getYearOptions } from '../../types/uploadTypes';
import {
    FileText, RefreshCw, Trash2, CheckCircle2, AlertCircle, Loader2,
    Calendar, Filter, X, Info
} from 'lucide-react';

interface FileControlRecord {
    id: string;
    fileName: string;
    storagePath: string;
    fileType: string;
    processedAt: any;
    status: 'PENDING' | 'UPLOADED' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
    rowsProcessed: number;
    referenceDate?: string; // Format YYYY-MM
    errorDetails?: string;
}

const MONTHS = [
    { num: '01', abbr: 'Jan' }, { num: '02', abbr: 'Fev' }, { num: '03', abbr: 'Mar' },
    { num: '04', abbr: 'Abr' }, { num: '05', abbr: 'Mai' }, { num: '06', abbr: 'Jun' },
    { num: '07', abbr: 'Jul' }, { num: '08', abbr: 'Ago' }, { num: '09', abbr: 'Set' },
    { num: '10', abbr: 'Out' }, { num: '11', abbr: 'Nov' }, { num: '12', abbr: 'Dez' },
];

export const FileControlView: React.FC = () => {
    // 1. State
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [records, setRecords] = useState<FileControlRecord[]>([]);
    const [loading, setLoading] = useState(false);

    // 2. Selection Modal State
    const [selectedFile, setSelectedFile] = useState<FileControlRecord | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // 3. Load Data for Year
    useEffect(() => {
        setLoading(true);
        // Query string range for the year: '2025-01' to '2025-12'
        const startKey = `${selectedYear}-01`;
        const endKey = `${selectedYear}-12`;

        const q = query(
            collection(db, 'file_imports_control'),
            where('referenceDate', '>=', startKey),
            where('referenceDate', '<=', endKey)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FileControlRecord));
            setRecords(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [selectedYear]);

    // 4. Actions
    const handleReprocess = async () => {
        if (!selectedFile) return;
        if (!confirm(`Reprocessar ${selectedFile.fileName}?`)) return;
        setProcessingId(selectedFile.id);
        try {

            const reprocess = httpsCallable(functions, 'reprocessFile');
            await reprocess({ storagePath: selectedFile.storagePath });
            alert('Reprocessamento iniciado!');
            setSelectedFile(null); // Close modal
        } catch (error: any) {
            alert('Erro: ' + error.message);
        } finally {
            setProcessingId(null);
        }
    };

    const handleDelete = async () => {
        if (!selectedFile) return;
        if (!confirm(`Excluir arquivo ${selectedFile.fileName}?`)) return;
        setProcessingId(selectedFile.id);
        try {

            const del = httpsCallable(functions, 'deleteFile');
            await del({ fileId: selectedFile.id, storagePath: selectedFile.storagePath });
            setSelectedFile(null); // Close modal
        } catch (error: any) {
            alert('Erro: ' + error.message);
        } finally {
            setProcessingId(null);
        }
    };

    // Helper to find record
    const findRecord = (typeId: string, month: string) => {
        const key = `${selectedYear}-${month}`;
        // Prioritize SUCCESS/PROCESSING over others if duplicates exist (though id prevents dups usually)
        return records.find(r => r.fileType === typeId && r.referenceDate === key);
    };

    return (
        <div className="max-w-full mx-auto space-y-8 animate-fade-in pb-20 px-4 md:px-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Calendar className="text-blue-600" />
                        Mapa de Competências
                    </h2>
                    <p className="text-slate-500 mt-2">Visão anual da integridade dos dados.</p>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={async () => {
                            if (!confirm('ATENÇÃO: Isso apagará TODOS os dados do BigQuery e recriará as tabelas. Deseja continuar?')) return;
                            setLoading(true);
                            try {
                                const reset = httpsCallable(functions, 'resetSystemData');
                                await reset();
                                alert('Sistema resetado com sucesso! A tabela base_segmentos foi criada.');
                            } catch (error: any) {
                                console.error(error);
                                alert('Erro ao resetar sistema: ' + error.message);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-xl font-bold transition-colors text-sm"
                    >
                        <Trash2 size={16} /> Resetar Sistema
                    </button>

                    <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                        <select
                            value={selectedYear}
                            onChange={e => setSelectedYear(e.target.value)}
                            className="bg-transparent border-none font-bold text-xl text-slate-800 focus:ring-0 cursor-pointer"
                        >
                            {getYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Grid Container */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold text-center">
                            <th className="p-4 text-left min-w-[200px] border-r border-slate-100 bg-slate-50 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                Tipo de Arquivo
                            </th>
                            {MONTHS.map(m => (
                                <th key={m.num} className="p-3 w-24">
                                    {m.abbr}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {IMPORT_DEFINITIONS.map(def => (
                            <tr key={def.id} className="hover:bg-slate-50/50 transition-colors">
                                {/* Type Label */}
                                <td className="p-4 border-r border-slate-100 font-bold text-slate-700 bg-white sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                    <div className="flex flex-col">
                                        <span>{def.label}</span>
                                        <span className="text-[10px] text-slate-400 font-normal uppercase">{def.tableId}</span>
                                    </div>
                                </td>

                                {/* Month Cells */}
                                {MONTHS.map(m => {
                                    const record = findRecord(def.id, m.num);
                                    return (
                                        <td key={m.num} className="p-2 text-center">
                                            {record ? (
                                                <button
                                                    onClick={() => setSelectedFile(record)}
                                                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all mx-auto shadow-sm hover:shadow-md hover:scale-105 active:scale-95 ${record.status === 'SUCCESS' ? 'bg-green-100 text-green-600' :
                                                        record.status === 'ERROR' ? 'bg-red-100 text-red-600' :
                                                            'bg-blue-100 text-blue-600 animate-pulse'
                                                        }`}
                                                >
                                                    {record.status === 'SUCCESS' && <CheckCircle2 size={20} />}
                                                    {record.status === 'ERROR' && <AlertCircle size={20} />}
                                                    {(record.status === 'PROCESSING' || record.status === 'UPLOADED') && <Loader2 size={20} className="animate-spin" />}
                                                </button>
                                            ) : (
                                                <div className="w-2 h-2 bg-slate-200 rounded-full mx-auto" />
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Loading Indicator */}
            {loading && (
                <div className="text-center py-4 text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={20} /> Carregando mapa...
                </div>
            )}

            {/* Detail Modal */}
            {selectedFile && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{selectedFile.fileName}</h3>
                                <p className="text-slate-500 text-sm mt-1">
                                    Competência: {selectedFile.referenceDate}
                                </p>
                            </div>
                            <button onClick={() => setSelectedFile(null)} className="text-slate-400 hover:text-slate-700">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                                <div className={`p-2 rounded-full ${selectedFile.status === 'SUCCESS' ? 'bg-green-100 text-green-600' :
                                    selectedFile.status === 'ERROR' ? 'bg-red-100 text-red-600' :
                                        'bg-blue-100 text-blue-600'
                                    }`}>
                                    {selectedFile.status === 'SUCCESS' && <CheckCircle2 size={20} />}
                                    {selectedFile.status === 'ERROR' && <AlertCircle size={20} />}
                                    {(selectedFile.status === 'PROCESSING' || selectedFile.status === 'UPLOADED') && <Loader2 size={20} className="animate-spin" />}
                                </div>
                                <div>
                                    <p className="font-bold text-slate-700">Status: {selectedFile.status}</p>
                                    {selectedFile.status === 'SUCCESS' && <p className="text-xs text-slate-500">{selectedFile.rowsProcessed} linhas processadas</p>}
                                    {selectedFile.status === 'ERROR' && <p className="text-xs text-red-500">{selectedFile.errorDetails}</p>}
                                </div>
                            </div>

                            <div className="text-xs text-slate-400 text-center">
                                ID: {selectedFile.id}
                            </div>
                        </div>

                        <div className="p-6 pt-0 flex gap-3">
                            <button
                                onClick={handleReprocess}
                                disabled={processingId !== null}
                                className="flex-1 py-3 bg-blue-50 text-blue-700 font-bold rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={18} /> Reprocessar
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={processingId !== null}
                                className="flex-1 py-3 bg-red-50 text-red-700 font-bold rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                            >
                                <Trash2 size={18} /> Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
