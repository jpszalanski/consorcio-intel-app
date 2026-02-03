import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../services/firebase';
import { FileText, RefreshCw, Trash2, CheckCircle2, AlertCircle, Loader2, Calendar, Filter } from 'lucide-react';

interface FileControlRecord {
    id: string; // filename without ext
    fileName: string;
    storagePath: string;
    fileType: string;
    processedAt: any;
    status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
    rowsProcessed: number;
    referenceDate?: string;
    errorDetails?: string;
    bigQueryTable?: string;
}

const IMPORT_TYPES = [
    { label: 'Todos', value: 'ALL' },
    { label: 'Segmentos', value: 'segments' },
    { label: 'Imóveis', value: 'real_estate' },
    { label: 'Móveis', value: 'moveis' },
    { label: 'Dados UF', value: 'regional_uf' },
];

export const FileControlView: React.FC = () => {
    const [records, setRecords] = useState<FileControlRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('ALL');
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Load Data Real-time
    useEffect(() => {
        const q = query(collection(db, 'file_imports_control'), orderBy('processedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FileControlRecord));
            setRecords(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleReprocess = async (file: FileControlRecord) => {
        if (!confirm(`Deseja reprocessar o arquivo "${file.fileName}"?`)) return;
        setProcessingId(file.id);
        try {
            const functions = getFunctions();
            const reprocess = httpsCallable(functions, 'reprocessFile');
            await reprocess({ storagePath: file.storagePath });
            alert('Reprocessamento iniciado! O status será atualizado em breve.');
        } catch (error: any) {
            console.error(error);
            alert('Erro ao iniciar reprocessamento: ' + error.message);
        } finally {
            setProcessingId(null);
        }
    };

    const handleDelete = async (file: FileControlRecord) => {
        if (!confirm(`ATENÇÃO: Isso excluirá o arquivo "${file.fileName}" do Storage e este registro.\nDeseja continuar?`)) return;
        setProcessingId(file.id);
        try {
            const functions = getFunctions();
            const del = httpsCallable(functions, 'deleteFile');
            await del({ fileId: file.id, storagePath: file.storagePath });
            // UI update happens via snapshot, but we can be optimistic if we wanted
        } catch (error: any) {
            console.error(error);
            alert('Erro ao excluir: ' + error.message);
        } finally {
            setProcessingId(null);
        }
    };

    const filteredRecords = records.filter(r => {
        if (filterType !== 'ALL' && r.fileType !== filterType) return false;
        return true;
    });

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900">Painel de Controle de Arquivos (Governance)</h2>
                    <p className="text-slate-500 mt-2">Gerencie, audite e monitore o ciclo de vida dos arquivos importados para o BigQuery.</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 overflow-x-auto">
                <Filter className="text-slate-400" size={20} />
                <span className="font-bold text-slate-700 text-sm">Filtrar por:</span>
                {IMPORT_TYPES.map(type => (
                    <button
                        key={type.value}
                        onClick={() => setFilterType(type.value)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${filterType === type.value
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        {type.label}
                    </button>
                ))}
            </div>

            {/* Grid */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="divide-y divide-slate-100">
                    {loading ? (
                        <div className="p-12 text-center text-slate-400">
                            <Loader2 className="animate-spin mx-auto mb-2" size={32} />
                            <p>Carregando registros...</p>
                        </div>
                    ) : filteredRecords.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <FileText className="mx-auto mb-4 opacity-50" size={48} />
                            <p>Nenhum arquivo encontrado com os filtros atuais.</p>
                        </div>
                    ) : (
                        filteredRecords.map((file) => (
                            <div key={file.id} className="p-6 hover:bg-slate-50 transition-colors flex items-center gap-6 group">
                                {/* Status Icon */}
                                <div className="shrink-0">
                                    {file.status === 'SUCCESS' && <div className="bg-green-100 p-3 rounded-full"><CheckCircle2 className="text-green-600" size={24} /></div>}
                                    {file.status === 'PROCESSING' && <div className="bg-blue-100 p-3 rounded-full"><Loader2 className="text-blue-600 animate-spin" size={24} /></div>}
                                    {file.status === 'ERROR' && <div className="bg-red-100 p-3 rounded-full"><AlertCircle className="text-red-600" size={24} /></div>}
                                    {file.status === 'PENDING' && <div className="bg-slate-100 p-3 rounded-full"><Loader2 className="text-slate-600" size={24} /></div>}
                                </div>

                                {/* Main Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="font-bold text-slate-800 text-lg truncate" title={file.fileName}>{file.fileName}</h3>
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-bold uppercase tracking-wider border border-slate-200">
                                            {file.fileType}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-6 text-sm text-slate-500">
                                        <div className="flex items-center gap-1.5" title="Data Base Detectada">
                                            <Calendar size={14} />
                                            {file.referenceDate || <span className="text-slate-300 italic">--/--</span>}
                                        </div>
                                        {file.status === 'SUCCESS' && (
                                            <span>
                                                Processados: <strong className="text-slate-700">{file.rowsProcessed} linhas</strong>
                                            </span>
                                        )}
                                        {file.status === 'ERROR' && (
                                            <span className="text-red-500 font-medium flex items-center gap-1">
                                                Erro: {file.errorDetails}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleReprocess(file)}
                                        disabled={processingId === file.id || file.status === 'PROCESSING'}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                        title="Reprocessar Arquivo (Forçar Releitura)"
                                    >
                                        {processingId === file.id ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(file)}
                                        disabled={processingId === file.id}
                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                        title="Excluir Arquivo e Registro"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
