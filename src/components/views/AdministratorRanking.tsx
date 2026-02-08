import React, { useState, useMemo, useEffect } from 'react';
import { Trophy, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';

interface AdminRankingRow {
    cnpj_raiz: string;
    nome_reduzido: string;
    totalBalance: number | string;
    totalActive: number | string;
    totalDefaults: number | string;
    totalFeesWeighted: number | string;
}

type SortField = 'volume' | 'cotas' | 'ticket' | 'inadimplencia';
type SortDirection = 'asc' | 'desc';

import { useAuth } from '../../hooks/useAuth';

export const AdministratorRanking: React.FC = () => {
    const { user } = useAuth();
    const [rankingData, setRankingData] = useState<AdminRankingRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortField, setSortField] = useState<SortField>('volume');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    useEffect(() => {
        const fetchRanking = async () => {
            if (!user) return;
            try {
                const getRanking = httpsCallable<{ administratorId: string }, { data: AdminRankingRow[] }>(functions, 'getAdministratorData');
                const result = await getRanking({ administratorId: user.uid });
                setRankingData(result.data.data);
            } catch (error) {
                console.error("Error fetching admin ranking", error);
            } finally {
                setLoading(false);
            }
        };
        if (user) fetchRanking();
    }, [user]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const sortedData = useMemo(() => {
        return [...rankingData].sort((a, b) => {
            const balA = Number(a.totalBalance) || 0;
            const balB = Number(b.totalBalance) || 0;
            const actA = Number(a.totalActive) || 0;
            const actB = Number(b.totalActive) || 0;
            const defA = Number(a.totalDefaults) || 0;
            const defB = Number(b.totalDefaults) || 0;

            const ticketA = actA > 0 ? balA / actA : 0;
            const ticketB = actB > 0 ? balB / actB : 0;
            const defRateA = actA > 0 ? (defA / actA) * 100 : 0;
            const defRateB = actB > 0 ? (defB / actB) * 100 : 0;

            let valA = 0, valB = 0;
            switch (sortField) {
                case 'volume': valA = balA; valB = balB; break;
                case 'cotas': valA = actA; valB = actB; break;
                case 'ticket': valA = ticketA; valB = ticketB; break;
                case 'inadimplencia': valA = defRateA; valB = defRateB; break;
            }

            return sortDirection === 'desc' ? valB - valA : valA - valB;
        });
    }, [rankingData, sortField, sortDirection]);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ArrowUpDown size={14} className="text-slate-300 ml-1" />;
        return sortDirection === 'desc'
            ? <ArrowDown size={14} className="text-blue-600 ml-1" />
            : <ArrowUp size={14} className="text-blue-600 ml-1" />;
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <Loader2 className="animate-spin mb-4" size={48} />
                <p>Carregando ranking (BigQuery)...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Ranking de Administradoras</h2>
                    <p className="text-slate-500">Clique no cabeçalho para ordenar por qualquer coluna.</p>
                </div>
                <div className="text-xs font-medium bg-white border border-slate-200 px-3 py-1 rounded-full text-slate-600">
                    {rankingData.length} administradoras
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
                            <tr>
                                <th className="px-6 py-4 text-center w-16">Rank</th>
                                <th className="px-6 py-4">Administradora</th>
                                <th
                                    className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                    onClick={() => handleSort('volume')}
                                >
                                    <div className="flex items-center justify-end">
                                        Volume Carteira (R$)
                                        <SortIcon field="volume" />
                                    </div>
                                </th>
                                <th
                                    className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                    onClick={() => handleSort('cotas')}
                                >
                                    <div className="flex items-center justify-end">
                                        Cotas Ativas
                                        <SortIcon field="cotas" />
                                    </div>
                                </th>
                                <th
                                    className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                    onClick={() => handleSort('ticket')}
                                >
                                    <div className="flex items-center justify-end">
                                        Ticket Médio
                                        <SortIcon field="ticket" />
                                    </div>
                                </th>
                                <th
                                    className="px-6 py-4 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                    onClick={() => handleSort('inadimplencia')}
                                >
                                    <div className="flex items-center justify-center">
                                        Inadimplência
                                        <SortIcon field="inadimplencia" />
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedData.map((admin, idx) => {
                                const bal = Number(admin.totalBalance) || 0;
                                const act = Number(admin.totalActive) || 0;
                                const def = Number(admin.totalDefaults) || 0;
                                const avgTicket = act > 0 ? bal / act : 0;
                                const defRate = act > 0 ? (def / act) * 100 : 0;

                                return (
                                    <tr key={admin.cnpj_raiz} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 text-center font-bold text-slate-400">
                                            {idx + 1}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-800">
                                            {admin.nome_reduzido || 'Desconhecida'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-blue-700 bg-blue-50/30">
                                            R$ {(bal / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M
                                        </td>
                                        <td className="px-6 py-4 text-right text-slate-700">
                                            {act.toLocaleString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4 text-right text-slate-500">
                                            R$ {avgTicket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${defRate > 5 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {defRate.toFixed(2)}%
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {sortedData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-12 text-slate-400">
                                        <p className="mb-2">Nenhum dado financeiro encontrado.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-slate-100 rounded-xl p-4 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                    <Trophy className="text-amber-500" size={18} />
                    <span className="font-medium">Ordenação atual:</span>
                    <span className="capitalize">{sortField === 'inadimplencia' ? 'Inadimplência' : sortField === 'cotas' ? 'Cotas Ativas' : sortField === 'ticket' ? 'Ticket Médio' : 'Volume Carteira'}</span>
                    <span className="text-slate-400">({sortDirection === 'desc' ? 'maior → menor' : 'menor → maior'})</span>
                </div>
            </div>
        </div>
    );
};
