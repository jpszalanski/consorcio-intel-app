import React, { useState, useMemo, useEffect } from 'react';
import { AppDataStore, BacenSegment } from '../../types';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, CartesianGrid, XAxis, YAxis
} from 'recharts';
import {
  Trophy, Search, Wallet, Clock, BadgePercent, AlertTriangle,
  ListChecks, Users, Sparkles, ChevronRight, Loader2, Target, History, Calendar
} from 'lucide-react';
import { generateMarketInsight, AIAnalysisResult } from '../../services/geminiService';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, collection, addDoc, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';



const COLORS = ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

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

import { useAuth } from '../../hooks/useAuth';

export const AdministratorAnalysis: React.FC = () => {
  const { isAdmin } = useAuth();
  const [viewMode, setViewMode] = useState<'ranking' | 'detail' | 'comparison'>('ranking');
  const [adminAId, setAdminAId] = useState<string>('');
  const [adminBId, setAdminBId] = useState<string>('');

  const [rankingData, setRankingData] = useState<AdminRankingRow[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(true);

  const [detailRows, setDetailRows] = useState<AdminDetailRow[]>([]);
  const [detailRowsB, setDetailRowsB] = useState<AdminDetailRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [currentAnalysis, setCurrentAnalysis] = useState<AIAnalysisResult | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<any[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const db = getFirestore();

  // 1. Fetch Ranking on Mount
  useEffect(() => {
    const fetchRanking = async () => {
      try {
        const functions = getFunctions();
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

  // 2. Fetch Detail & History when Admin Selected
  useEffect(() => {
    if (!adminAId) return;

    const fetchDetail = async () => {
      setLoadingDetail(true);
      try {
        const functions = getFunctions();
        const getDetail = httpsCallable<{ cnpj: string }, { data: AdminDetailRow[] }>(functions, 'getAdministratorDetail');

        // Fetch A
        const resultA = await getDetail({ cnpj: adminAId });
        setDetailRows(resultA.data.data);

        // Fetch B if in comparison
        if (viewMode === 'comparison' && adminBId) {
          const resultB = await getDetail({ cnpj: adminBId });
          setDetailRowsB(resultB.data.data);
        } else {
          setDetailRowsB([]);
        }

      } catch (error) {
        console.error("Error fetching admin detail", error);
      } finally {
        setLoadingDetail(false);
      }
    };

    const fetchHistory = async () => {
      try {
        const q = query(
          collection(db, 'ai_analyses'),
          where('contextId', '==', adminAId),
          where('type', '==', 'admin_analysis'),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const hist = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setAnalysisHistory(hist);

        if (hist.length > 0) {
          setCurrentAnalysis(hist[0].result as AIAnalysisResult);
        } else {
          setCurrentAnalysis(null);
        }
      } catch (error) {
        console.error("Error fetching history", error);
      }
    };

    fetchDetail();
    fetchHistory();
  }, [adminAId, adminBId, viewMode]);

  // 3. Compute Metrics Helper
  const calculateMetrics = (rows: AdminDetailRow[], cnpjInput: string) => {
    if (rows.length === 0) return null;
    // History & Snapshot logic
    const historyMap = new Map<string, number>();
    rows.forEach(row => {
      const vol = Number(row.total_volume) || 0;
      historyMap.set(row.data_base, (historyMap.get(row.data_base) || 0) + vol);
    });
    const history = Array.from(historyMap.entries())
      .map(([period, balance]) => ({ period, balance }))
      .sort((a, b) => a.period.localeCompare(b.period));

    const latestDate = history.length > 0 ? history[history.length - 1].period : '';
    const currentRows = rows.filter(r => r.data_base === latestDate);

    let totalActive = 0, totalBalance = 0, sumFees = 0, sumTerm = 0, sumDefaults = 0;
    let sumDefContemplated = 0, sumDefNonContemplated = 0, sumDropouts = 0;

    const segMap = new Map<string, { balance: number; active: number; fees: number; defaults: number; defContemplated: number; defNonContemplated: number; dropouts: number; }>();

    currentRows.forEach(row => {
      const act = Number(row.total_active) || 0;
      const vol = Number(row.total_volume) || 0;
      const feesW = Number(row.total_fees_weighted) || 0;
      const termW = Number(row.total_term_weighted) || 0;
      const defs = Number(row.total_defaults) || 0;
      const defCont = Number(row.total_default_contemplated) || 0;
      const defNon = Number(row.total_default_non_contemplated) || 0;
      const drops = Number(row.total_dropouts) || 0;

      totalActive += act; totalBalance += vol; sumFees += feesW; sumTerm += termW; sumDefaults += defs;
      sumDefContemplated += defCont; sumDefNonContemplated += defNon; sumDropouts += drops;

      const segName = getSegName(row.codigo_segmento);
      if (!segMap.has(segName)) segMap.set(segName, { balance: 0, active: 0, fees: 0, defaults: 0, defContemplated: 0, defNonContemplated: 0, dropouts: 0 });
      const s = segMap.get(segName)!;
      s.balance += vol; s.active += act; s.fees += feesW; s.defaults += defs;
      s.defContemplated += defCont; s.defNonContemplated += defNon; s.dropouts += drops;
    });

    const avgAdminFee = totalBalance > 0 ? sumFees / totalBalance : 0;
    const avgTerm = totalBalance > 0 ? sumTerm / totalBalance : 0;
    const defaultRate = totalActive > 0 ? (sumDefaults / totalActive) * 100 : 0;
    const avgTicket = totalActive > 0 ? totalBalance / totalActive : 0;

    const segmentBreakdown = Array.from(segMap.entries()).map(([name, stats]) => ({
      name,
      balance: stats.balance,
      active: stats.active,
      avgFee: stats.balance > 0 ? stats.fees / stats.balance : 0,
      defaultRate: stats.active > 0 ? (stats.defaults / stats.active) * 100 : 0,
      defContemplated: stats.active > 0 ? (stats.defContemplated / stats.active) * 100 : 0,
      defNonContemplated: stats.active > 0 ? (stats.defNonContemplated / stats.active) * 100 : 0,
      dropoutRate: stats.active > 0 ? (stats.dropouts / stats.active) * 100 : 0
    })).sort((a, b) => b.balance - a.balance);

    const segmentsData = segmentBreakdown.map(s => ({ name: s.name, value: s.balance }));
    const name = currentRows.length > 0 ? currentRows[0].nome_reduzido : 'Unknown';

    return {
      name, cnpj: cnpjInput, totalBalance, totalActive, avgTerm, avgAdminFee, defaultRate, avgTicket,
      history, segmentBreakdown, segmentsData
    };
  };

  const metricsA = useMemo(() => calculateMetrics(detailRows, adminAId), [detailRows, adminAId]);
  const metricsB = useMemo(() => calculateMetrics(detailRowsB, adminBId), [detailRowsB, adminBId]);

  const handleGenerateReport = async () => {
    if (!metricsA) return;
    setLoadingAi(true);

    // Calculate Market Averages from Ranking Data
    let totalMarketActive = 0;
    let totalMarketDefaults = 0;
    // Note: rankingData doesn't currently have Fees in the interface, only Weighted Fees?
    // Let's check AdminRankingRow interface. It has totalFeesWeighted.
    let totalMarketFeesW = 0;
    let totalMarketBalance = 0;

    rankingData.forEach(r => {
      const act = Number(r.totalActive) || 0;
      totalMarketActive += act;
      totalMarketBalance += (Number(r.totalBalance) || 0);
      totalMarketDefaults += (Number(r.totalDefaults) || 0);
      totalMarketFeesW += (Number(r.totalFeesWeighted) || 0);
    });

    const marketAvgDefault = totalMarketActive > 0 ? (totalMarketDefaults / totalMarketActive) * 100 : 0;
    const marketAvgFee = totalMarketBalance > 0 ? (totalMarketFeesW / totalMarketBalance) : 0;


    const context = `
      Relatório Adm: ${metricsA.name}.
      - Saldo Carteira: R$ ${(metricsA.totalBalance / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M
      - Prazo Médio Ponderado: ${metricsA.avgTerm.toFixed(0)} meses
      - Taxa Adm: ${metricsA.avgAdminFee.toFixed(2)}%
      - Inadimplência: ${metricsA.defaultRate.toFixed(2)}%
      
      MÉDIAS DE MERCADO (Referência Nacional):
      - Inadimplência Média: ${marketAvgDefault.toFixed(2)}%
      - Taxa Adm Média: ${marketAvgFee.toFixed(2)}%
    `;

    try {
      const result = await generateMarketInsight(context, {});
      setCurrentAnalysis(result);

      // Save to Firestore History
      await addDoc(collection(db, 'ai_analyses'), {
        contextId: adminAId,
        contextName: metricsA.name,
        type: 'admin_analysis',
        createdAt: Timestamp.now(),
        result,
        summary: result.summary
      });

      // Add to local state list immediately
      setAnalysisHistory(prev => [{
        contextId: adminAId,
        type: 'admin_analysis',
        createdAt: Timestamp.now(),
        result
      }, ...prev]);

    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAi(false);
    }
  };

  const renderRankingView = () => {
    if (loadingRanking) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <Loader2 className="animate-spin mb-4" size={48} />
          <p>Carregando ranking (BigQuery)...</p>
        </div>
      );
    }

    return (
      <div className="animate-fade-in bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <Trophy className="text-amber-500" size={20} />
              Ranking Geral de Administradoras
            </h3>
            <p className="text-sm text-slate-500">Consolidado Financeiro (Volume de Crédito e Cotas)</p>
          </div>
          <div className="text-xs font-medium bg-white border border-slate-200 px-3 py-1 rounded-full text-slate-600">
            {rankingData.length} players listados
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
              <tr>
                <th className="px-6 py-4 text-center w-16">Rank</th>
                <th className="px-6 py-4">Administradora</th>
                <th className="px-6 py-4 text-right">Volume Carteira (R$)</th>
                <th className="px-6 py-4 text-right">Cotas Ativas</th>
                <th className="px-6 py-4 text-right">Ticket Médio</th>
                <th className="px-6 py-4 text-center">Inadimplência</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rankingData.map((admin, idx) => {
                const bal = Number(admin.totalBalance) || 0;
                const act = Number(admin.totalActive) || 0;
                const def = Number(admin.totalDefaults) || 0;
                // const feeW = Number(admin.totalFeesWeighted) || 0;

                const avgTicket = act > 0 ? bal / act : 0;
                const defRate = act > 0 ? (def / act) * 100 : 0;

                return (
                  <tr key={admin.cnpj_raiz} className="hover:bg-slate-50 transition-colors group">
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
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setAdminAId(admin.cnpj_raiz);
                          setViewMode('detail');
                        }}
                        className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                        title="Ver Detalhes"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rankingData.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    <p className="mb-2">Nenhum dado financeiro encontrado.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderSingleView = () => {
    if (loadingDetail) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <Loader2 className="animate-spin mb-4" size={48} />
          <p>Carregando detalhe (BigQuery)...</p>
        </div>
      );
    }

    if (!metricsA) return null;

    return (
      <div className="space-y-6 animate-fade-in relative">
        <div className="flex justify-between items-center">
          <button
            onClick={() => setViewMode('ranking')}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 mb-2"
          >
            ← Voltar para Ranking
          </button>

          {analysisHistory.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <History size={16} />
              {showHistory ? 'Ocultar Histórico' : `Ver Histórico (${analysisHistory.length})`}
            </button>
          )}
        </div>

        {showHistory && (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 animate-slide-down mb-6">
            <h4 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2">
              <History size={16} /> Histórico de Análises
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {analysisHistory.map((item, idx) => (
                <div
                  key={item.id || idx}
                  onClick={() => setCurrentAnalysis(item.result)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${currentAnalysis === item.result ? 'bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-100' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                >
                  <div>
                    <p className="text-xs font-bold text-slate-700">{item.result.summary?.substring(0, 60)}...</p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                      <Calendar size={10} />
                      {item.createdAt?.toDate().toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-slate-300" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10"><Wallet size={40} /></div>
            <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Saldo de Carteira</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">R$ {(metricsA.totalBalance / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M</p>
            <div className="mt-2 text-xs flex items-center gap-1 text-slate-400 font-medium">
              <Users size={12} /> {metricsA.totalActive.toLocaleString('pt-BR')} cotas ativas
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10"><Clock size={40} /></div>
            <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Prazo Médio</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{metricsA.avgTerm.toFixed(0)} meses</p>
            <div className="mt-2 text-xs text-slate-400">Ponderado por volume</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10"><BadgePercent size={40} /></div>
            <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Taxa Adm. Média</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{metricsA.avgAdminFee.toFixed(2)}%</p>
            <div className="mt-2 text-xs text-slate-400">Ponderada</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10"><AlertTriangle size={40} /></div>
            <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Inadimplência</p>
            <p className={`text-2xl font-bold mt-1 ${metricsA.defaultRate > 5 ? 'text-red-600' : 'text-emerald-600'}`}>
              {metricsA.defaultRate.toFixed(2)}%
            </p>
            <div className="mt-2 text-xs text-slate-400">Sobre total ativo</div>
          </div>
        </div>

        {/* Info Board */}
        {currentAnalysis && (
          <div className="bg-white border border-indigo-100 rounded-2xl p-6 shadow-sm animate-fade-in relative overflow-hidden my-6">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Sparkles size={80} className="text-indigo-600" />
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                <Sparkles size={24} />
              </div>
              <div>
                <h3 className="text-indigo-900 font-bold text-lg">Insight Estratégico Gemini</h3>
                <p className="text-sm text-slate-500">Análise de performance e riscos.</p>
              </div>
            </div>

            {(() => {
              let parsed = currentAnalysis;
              // No fallback needed if typed correctly, but just in case
              if ((parsed as any).text) return <p className="text-slate-700">{(parsed as any).text}</p>;

              return (
                <>
                  <div className="mb-6">
                    <p className="text-lg font-medium text-slate-800 italic border-l-4 border-indigo-500 pl-4 py-1">
                      "{parsed.summary}"
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {parsed.points?.map((point: any, idx: number) => (
                      <div key={idx} className={`p-4 rounded-xl border ${point.type === 'positive' ? 'bg-green-50/50 border-green-100' :
                        point.type === 'negative' ? 'bg-red-50/50 border-red-100' :
                          'bg-slate-50/50 border-slate-100'
                        }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs font-bold uppercase tracking-wider ${point.type === 'positive' ? 'text-green-700' :
                            point.type === 'negative' ? 'text-red-700' :
                              'text-slate-600'
                            }`}>{point.title}</span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">{point.content}</p>
                      </div>
                    ))}
                  </div>

                  {parsed.recommendation && (
                    <div className="bg-indigo-600 text-white rounded-xl p-5 flex gap-4 shadow-lg shadow-indigo-900/20">
                      <div className="mt-1"><Target size={20} /></div>
                      <div>
                        <h4 className="font-bold text-indigo-100 text-sm uppercase mb-1">Estratégia Recomendada</h4>
                        <p className="text-white text-sm font-medium">{parsed.recommendation}</p>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Segment Detail Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <ListChecks size={18} className="text-slate-500" />
            <h3 className="font-bold text-slate-800">Deep Dive: Performance por Segmento</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-3">Segmento</th>
                  <th className="px-6 py-3 text-right">Volume (R$)</th>
                  <th className="px-6 py-3 text-right">Cotas</th>
                  <th className="px-6 py-3 text-center">Taxa Adm</th>
                  <th className="px-6 py-3 text-center bg-red-50/50">Inad. Total</th>
                  <th className="px-6 py-3 text-center text-[10px] text-slate-400">Contem.</th>
                  <th className="px-6 py-3 text-center text-[10px] text-slate-400">Não Cont.</th>
                  <th className="px-6 py-3 text-center">Evasão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metricsA.segmentBreakdown.map((s) => (
                  <tr key={s.name} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-900">{s.name}</td>
                    <td className="px-6 py-3 text-right text-blue-700 font-bold bg-blue-50/20">
                      {s.balance > 0 ? `R$ ${(s.balance / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M` : '-'}
                    </td>
                    <td className="px-6 py-3 text-right">{s.active.toLocaleString('pt-BR')}</td>
                    <td className="px-6 py-3 text-center">{s.avgFee > 0 ? `${s.avgFee.toFixed(2)}%` : '-'}</td>
                    <td className="px-6 py-3 text-center bg-red-50/30">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.defaultRate > 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {s.defaultRate.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center text-xs text-slate-600">{s.defContemplated.toFixed(2)}%</td>
                    <td className="px-6 py-3 text-center text-xs text-slate-600">{s.defNonContemplated.toFixed(2)}%</td>
                    <td className="px-6 py-3 text-center text-slate-500">{s.dropoutRate.toFixed(2)}%</td>
                  </tr>
                ))}
                {metricsA.segmentBreakdown.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-4 text-slate-400">Sem dados segmentados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Mix Financeiro</h3>
            <div className="h-64">
              {metricsA.segmentsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={metricsA.segmentsData} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                      {metricsA.segmentsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `R$ ${(value / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`} />
                    <Legend verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">Sem dados financeiros</div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Evolução do Saldo</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metricsA.history}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={(val) => `R$${(val / 1000000).toFixed(0)}M`} />
                  <Tooltip formatter={(value: number) => [`R$ ${(value / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`, 'Saldo']} />
                  <Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderComparisonView = () => {
    if (loadingDetail) return <div className="text-center p-12"><Loader2 className="animate-spin inline" /></div>;
    if (!metricsA) return <p className="text-center text-slate-500">Selecione uma administradora para começar.</p>;

    // Fallback if B not selected or loading
    const mb = metricsB || { name: 'Selecione...', totalBalance: 0, totalActive: 0, avgTerm: 0, avgAdminFee: 0, defaultRate: 0, avgTicket: 0 };

    const diff = (valA: number, valB: number, inverse = false) => {
      const d = valA - valB;
      if (valB === 0) return null;
      const color = inverse
        ? (d < 0 ? 'text-green-600' : 'text-red-600')
        : (d > 0 ? 'text-green-600' : 'text-red-600');
      return <span className={`text-xs ml-2 font-bold ${color}`}>{d > 0 ? '+' : ''}{d.toFixed(2)}</span>;
    };

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
          <button
            onClick={() => setViewMode('ranking')}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            ← Voltar para Ranking
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-700">Comparando com:</span>
            <select
              value={adminBId}
              onChange={(e) => setAdminBId(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
            >
              <option value="">Selecione...</option>
              {rankingData.filter(r => r.cnpj_raiz !== adminAId).map(admin => (
                <option key={admin.cnpj_raiz} value={admin.cnpj_raiz}>{admin.nome_reduzido}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Admin A Card */}
          <div className="bg-white p-6 rounded-xl border border-blue-200 shadow-sm md:col-span-1">
            <h3 className="font-bold text-lg text-slate-900 mb-4">{metricsA.name}</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 uppercase">Volume Carteira</p>
                <p className="text-xl font-bold text-blue-700">R$ {(metricsA.totalBalance / 1_000_000).toFixed(1)}M</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Inadimplência</p>
                <p className="text-xl font-bold text-slate-800">{metricsA.defaultRate.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Taxa Adm.</p>
                <p className="text-xl font-bold text-slate-800">{metricsA.avgAdminFee.toFixed(2)}%</p>
              </div>
            </div>
          </div>

          {/* Comparison Center */}
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-center items-center text-center space-y-6">
            <h3 className="font-bold text-slate-400 text-sm uppercase">Diferencial (A vs B)</h3>

            <div className="w-full border-b border-slate-200 pb-2">
              <p className="text-xs text-slate-400">Diferença Volume</p>
              <p className="font-bold text-lg">
                {(metricsA.totalBalance - mb.totalBalance) > 0 ? '+' : ''}
                R$ {((metricsA.totalBalance - mb.totalBalance) / 1_000_000).toFixed(1)}M
              </p>
            </div>
            <div className="w-full border-b border-slate-200 pb-2">
              <p className="text-xs text-slate-400">Gap Inadimplência</p>
              <div className="flex items-center justify-center">
                {diff(metricsA.defaultRate, mb.defaultRate, true)}
              </div>
            </div>
          </div>

          {/* Admin B Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm md:col-span-1 opacity-90">
            <h3 className="font-bold text-lg text-slate-900 mb-4">{metricsB ? metricsB.name : 'Selecione...'}</h3>
            {metricsB ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase">Volume Carteira</p>
                  <p className="text-xl font-bold text-slate-600">R$ {(metricsB.totalBalance / 1_000_000).toFixed(1)}M</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">Inadimplência</p>
                  <p className="text-xl font-bold text-slate-800">{metricsB.defaultRate.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">Taxa Adm.</p>
                  <p className="text-xl font-bold text-slate-800">{metricsB.avgAdminFee.toFixed(2)}%</p>
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm italic">
                Selecione uma administradora para comparar
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Análise por Administradora</h2>
          <p className="text-slate-500">Raio-X financeiro e operacional consolidado.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {viewMode === 'detail' && (
            <>
              <div className="relative w-full md:min-w-[250px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <select
                  value={adminAId}
                  onChange={(e) => setAdminAId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 shadow-sm appearance-none outline-none transition-all"
                >
                  <option value="">Trocar Administradora...</option>
                  {rankingData.map(admin => (
                    <option key={admin.cnpj_raiz} value={admin.cnpj_raiz}>{admin.nome_reduzido || 'Desconhecida'}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setViewMode('comparison')}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl font-bold transition-all"
              >
                <Users size={18} /> Comparar
              </button>
            </>
          )}

          {viewMode === 'detail' && metricsA && isAdmin && (
            <button
              onClick={handleGenerateReport}
              disabled={loadingAi}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {loadingAi ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
              Análise AI
            </button>
          )}
        </div>
      </div>

      {currentAnalysis && viewMode === 'detail' && (
        <div className="bg-white border border-indigo-100 rounded-2xl p-6 shadow-sm animate-fade-in relative overflow-hidden my-6">
          {/* Render logic handled by renderSingleView internally typically, but keeping structure */}
        </div>
      )}

      {viewMode === 'ranking' && renderRankingView()}
      {viewMode === 'detail' && renderSingleView()}
      {viewMode === 'comparison' && renderComparisonView()}
    </div>
  );
};
