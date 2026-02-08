import React, { useState, useMemo, useEffect } from 'react';
import { GitCompareArrows, Loader2, Wallet, Users, BadgePercent, AlertTriangle, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { BacenSegment } from '../../types';

interface AdminRankingRow {
    cnpj_raiz: string;
    nome_reduzido: string;
    totalBalance: number | string;
    totalActive: number | string;
    totalDefaults: number | string;
    totalFeesWeighted: number | string;
}

interface AdminDetailRow {
    data_base: string;
    codigo_segmento: number;
    nome_reduzido: string;
    total_volume: number | string;
    total_active: number | string;
    total_fees_weighted: number | string;
    total_term_weighted: number | string;
    total_defaults: number | string;
    total_default_contemplated: number | string;
    total_default_non_contemplated: number | string;
    total_dropouts: number | string;
}

const getSegName = (code: string | number): string => {
    const c = String(code);
    if (c === '1') return `1 - ${BacenSegment[1]}`;
    if (c === '2') return `2 - ${BacenSegment[2].replace('_', ' ')}`;
    if (c === '3') return `3 - ${BacenSegment[3]}`;
    if (c === '4') return `4 - ${BacenSegment[4]}`;
    if (c === '5') return `5 - ${BacenSegment[5].replace(/_/g, ' ')}`;
    if (c === '6') return `6 - ${BacenSegment[6].replace(/_/g, ' ')}`;
    return `${c} - Outros`;
};

export const AdministratorComparison: React.FC = () => {
    const [adminAId, setAdminAId] = useState<string>('');
    const [adminBId, setAdminBId] = useState<string>('');

    const [rankingData, setRankingData] = useState<AdminRankingRow[]>([]);
    const [loadingRanking, setLoadingRanking] = useState(true);

    const [detailRowsA, setDetailRowsA] = useState<AdminDetailRow[]>([]);
    const [detailRowsB, setDetailRowsB] = useState<AdminDetailRow[]>([]);
    const [loadingA, setLoadingA] = useState(false);
    const [loadingB, setLoadingB] = useState(false);

    // Fetch ranking list
    useEffect(() => {
        const fetchRanking = async () => {
            try {
                const getRanking = httpsCallable<unknown, { data: AdminRankingRow[] }>(functions, 'getAdministratorData');
                const result = await getRanking();
                setRankingData(result.data.data);
            } catch (error) {
                console.error("Error fetching admin ranking", error);
            } finally {
                setLoadingRanking(false);
            }
        };
        fetchRanking();
    }, []);

    // Fetch detail A
    useEffect(() => {
        if (!adminAId) return;
        const fetchDetail = async () => {
            setLoadingA(true);
            try {
                const getDetail = httpsCallable<{ cnpj: string }, { data: AdminDetailRow[] }>(functions, 'getAdministratorDetail');
                const result = await getDetail({ cnpj: adminAId });
                setDetailRowsA(result.data.data);
            } catch (error) {
                console.error("Error fetching detail A", error);
            } finally {
                setLoadingA(false);
            }
        };
        fetchDetail();
    }, [adminAId]);

    // Fetch detail B
    useEffect(() => {
        if (!adminBId) return;
        const fetchDetail = async () => {
            setLoadingB(true);
            try {
                const getDetail = httpsCallable<{ cnpj: string }, { data: AdminDetailRow[] }>(functions, 'getAdministratorDetail');
                const result = await getDetail({ cnpj: adminBId });
                setDetailRowsB(result.data.data);
            } catch (error) {
                console.error("Error fetching detail B", error);
            } finally {
                setLoadingB(false);
            }
        };
        fetchDetail();
    }, [adminBId]);

    const calculateMetrics = (rows: AdminDetailRow[], cnpjInput: string) => {
        if (!rows.length) return null;

        const latestDate = [...new Set(rows.map(r => r.data_base))].sort().reverse()[0];
        const currentRows = rows.filter(r => r.data_base === latestDate);

        let totalBalance = 0, totalActive = 0, totalDefaults = 0;
        let sumTermWeighted = 0, sumFeesWeighted = 0;

        currentRows.forEach(r => {
            const vol = Number(r.total_volume) || 0;
            const act = Number(r.total_active) || 0;
            const def = Number(r.total_defaults) || 0;
            const feeW = Number(r.total_fees_weighted) || 0;
            const termW = Number(r.total_term_weighted) || 0;

            totalBalance += vol;
            totalActive += act;
            totalDefaults += def;
            sumFeesWeighted += feeW;
            sumTermWeighted += termW;
        });

        const avgTerm = totalBalance > 0 ? sumTermWeighted / totalBalance : 0;
        const avgAdminFee = totalBalance > 0 ? sumFeesWeighted / totalBalance : 0;
        const defaultRate = totalActive > 0 ? (totalDefaults / totalActive) * 100 : 0;
        const avgTicket = totalActive > 0 ? totalBalance / totalActive : 0;

        const segmentBreakdown = currentRows.map(r => ({
            name: getSegName(r.codigo_segmento),
            balance: Number(r.total_volume) || 0,
            active: Number(r.total_active) || 0,
        })).sort((a, b) => b.balance - a.balance);

        const name = currentRows.length > 0 ? currentRows[0].nome_reduzido : 'Unknown';

        return {
            name, cnpj: cnpjInput, totalBalance, totalActive, avgTerm, avgAdminFee, defaultRate, avgTicket,
            segmentBreakdown
        };
    };

    const metricsA = useMemo(() => calculateMetrics(detailRowsA, adminAId), [detailRowsA, adminAId]);
    const metricsB = useMemo(() => calculateMetrics(detailRowsB, adminBId), [detailRowsB, adminBId]);

    const comparisonChartData = useMemo(() => {
        if (!metricsA || !metricsB) return [];

        return [
            { metric: 'Volume (M)', A: metricsA.totalBalance / 1000000, B: metricsB.totalBalance / 1000000 },
            { metric: 'Cotas (mil)', A: metricsA.totalActive / 1000, B: metricsB.totalActive / 1000 },
            { metric: 'Ticket (mil)', A: metricsA.avgTicket / 1000, B: metricsB.avgTicket / 1000 },
            { metric: 'Inadimpl. (%)', A: metricsA.defaultRate, B: metricsB.defaultRate },
            { metric: 'Taxa Adm (%)', A: metricsA.avgAdminFee, B: metricsB.avgAdminFee },
        ];
    }, [metricsA, metricsB]);

    const sortedAdmins = useMemo(() => {
        return [...rankingData].sort((a, b) => (a.nome_reduzido || '').localeCompare(b.nome_reduzido || ''));
    }, [rankingData]);

    if (loadingRanking) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <Loader2 className="animate-spin mb-4" size={48} />
                <p>Carregando administradoras...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Comparar Administradoras</h2>
                <p className="text-slate-500">Selecione duas administradoras para comparação lado a lado.</p>
            </div>

            {/* Selection Row */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Administradora A</label>
                        <select
                            value={adminAId}
                            onChange={(e) => setAdminAId(e.target.value)}
                            className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">Selecione...</option>
                            {sortedAdmins.filter(r => r.cnpj_raiz !== adminBId).map(admin => (
                                <option key={admin.cnpj_raiz} value={admin.cnpj_raiz}>{admin.nome_reduzido}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-center">
                        <div className="p-3 bg-slate-100 rounded-full">
                            <GitCompareArrows size={24} className="text-slate-400" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Administradora B</label>
                        <select
                            value={adminBId}
                            onChange={(e) => setAdminBId(e.target.value)}
                            className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">Selecione...</option>
                            {sortedAdmins.filter(r => r.cnpj_raiz !== adminAId).map(admin => (
                                <option key={admin.cnpj_raiz} value={admin.cnpj_raiz}>{admin.nome_reduzido}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Loading State */}
            {(loadingA || loadingB) && (
                <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-blue-600" size={32} />
                </div>
            )}

            {/* Comparison Cards */}
            {metricsA && metricsB && !loadingA && !loadingB && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Card A */}
                        <div className="bg-gradient-to-br from-blue-50 to-white p-6 rounded-xl border border-blue-200 shadow-sm">
                            <h3 className="font-bold text-lg text-slate-900 mb-4 flex items-center gap-2">
                                <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                                {metricsA.name}
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <Wallet size={18} className="text-blue-600" />
                                    <div>
                                        <p className="text-xs text-slate-500">Volume Carteira</p>
                                        <p className="text-lg font-bold text-slate-900">R$ {(metricsA.totalBalance / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Users size={18} className="text-slate-500" />
                                    <div>
                                        <p className="text-xs text-slate-500">Cotas Ativas</p>
                                        <p className="text-lg font-bold text-slate-900">{metricsA.totalActive.toLocaleString('pt-BR')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <AlertTriangle size={18} className="text-red-500" />
                                    <div>
                                        <p className="text-xs text-slate-500">Inadimplência</p>
                                        <p className="text-lg font-bold text-slate-900">{metricsA.defaultRate.toFixed(2)}%</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <BadgePercent size={18} className="text-emerald-500" />
                                    <div>
                                        <p className="text-xs text-slate-500">Taxa Administração</p>
                                        <p className="text-lg font-bold text-slate-900">{metricsA.avgAdminFee.toFixed(2)}%</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Comparison Center */}
                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-center items-center">
                            <h4 className="font-bold text-slate-500 text-sm uppercase mb-4">Diferencial</h4>
                            <div className="space-y-3 w-full">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500">Volume</span>
                                    <span className={`font-bold ${metricsA.totalBalance > metricsB.totalBalance ? 'text-blue-600' : 'text-emerald-600'}`}>
                                        {metricsA.totalBalance > metricsB.totalBalance ? '← A maior' : 'B maior →'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500">Cotas</span>
                                    <span className={`font-bold ${metricsA.totalActive > metricsB.totalActive ? 'text-blue-600' : 'text-emerald-600'}`}>
                                        {metricsA.totalActive > metricsB.totalActive ? '← A maior' : 'B maior →'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500">Inadimplência</span>
                                    <span className={`font-bold ${metricsA.defaultRate < metricsB.defaultRate ? 'text-blue-600' : 'text-emerald-600'}`}>
                                        {metricsA.defaultRate < metricsB.defaultRate ? '← A melhor' : 'B melhor →'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Card B */}
                        <div className="bg-gradient-to-bl from-emerald-50 to-white p-6 rounded-xl border border-emerald-200 shadow-sm">
                            <h3 className="font-bold text-lg text-slate-900 mb-4 flex items-center gap-2">
                                <div className="w-3 h-3 bg-emerald-600 rounded-full"></div>
                                {metricsB.name}
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <Wallet size={18} className="text-emerald-600" />
                                    <div>
                                        <p className="text-xs text-slate-500">Volume Carteira</p>
                                        <p className="text-lg font-bold text-slate-900">R$ {(metricsB.totalBalance / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Users size={18} className="text-slate-500" />
                                    <div>
                                        <p className="text-xs text-slate-500">Cotas Ativas</p>
                                        <p className="text-lg font-bold text-slate-900">{metricsB.totalActive.toLocaleString('pt-BR')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <AlertTriangle size={18} className="text-red-500" />
                                    <div>
                                        <p className="text-xs text-slate-500">Inadimplência</p>
                                        <p className="text-lg font-bold text-slate-900">{metricsB.defaultRate.toFixed(2)}%</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <BadgePercent size={18} className="text-emerald-500" />
                                    <div>
                                        <p className="text-xs text-slate-500">Taxa Administração</p>
                                        <p className="text-lg font-bold text-slate-900">{metricsB.avgAdminFee.toFixed(2)}%</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Comparison Chart */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-4">Comparativo Visual</h3>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={comparisonChartData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" />
                                    <YAxis dataKey="metric" type="category" width={120} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="A" name={metricsA.name} fill="#3b82f6" radius={[0, 4, 4, 0]} />
                                    <Bar dataKey="B" name={metricsB.name} fill="#10b981" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}

            {/* Empty State */}
            {(!adminAId || !adminBId) && (
                <div className="bg-slate-50 rounded-xl p-12 text-center border-2 border-dashed border-slate-200">
                    <GitCompareArrows size={48} className="text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">Selecione duas administradoras acima para iniciar a comparação.</p>
                </div>
            )}
        </div>
    );
};
