
import React, { useState, useMemo, useEffect } from 'react';
import { AppDataStore } from '../../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell
} from 'recharts';
import {
  Building2, Search, TrendingUp, Users, Clock,
  Target, ArrowRightLeft, Scale, RefreshCw, AlertTriangle, BadgePercent, Wallet, ListChecks, Coins,
  Loader2, Sparkles, ChevronRight, Trophy
} from 'lucide-react';
import { generateMarketInsight } from '../../services/geminiService';

interface Props {
  data: AppDataStore;
}

const COLORS = ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const AdministratorAnalysis: React.FC<Props> = ({ data }) => {
  const [viewMode, setViewMode] = useState<'ranking' | 'detail'>('ranking');
  const [adminAId, setAdminAId] = useState<string>('');

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (adminAId && viewMode === 'detail') {
      const saved = localStorage.getItem(`admin_analysis_${adminAId}`);
      setAiAnalysis(saved);
    } else {
      setAiAnalysis(null);
    }
  }, [adminAId, viewMode]);

  const sortedAdmins = useMemo(() => {
    return [...data.administrators].sort((a, b) => (a.nome_reduzido || '').localeCompare(b.nome_reduzido || ''));
  }, [data.administrators]);

  // Função central para calcular métricas de UMA administradora
  const getAdminMetrics = (cnpj: string, adminName: string) => {
    // 1. Filtrar Grupos Detalhados (Fonte Financeira e Operacional)
    const groups = data.detailedGroups.filter(g => g.cnpj_raiz === cnpj);

    // Se não houver grupos detalhados, tenta fallback (apenas metadados ou consolidado básico se necessário)
    if (groups.length === 0) {
      // Retornar objeto vazio ou nulo? 
      // Se retornar nulo, ele é filtrado do ranking. 
      // Vamos retornar nulo para não poluir o ranking com fantasmas.
      return null;
    }

    // Calculadoras
    let totalActive = 0;
    let totalBalance = 0;

    const segMap = new Map<string, {
      code: string;
      active: number;
      balance: number;
      defaults: number;
      feesSum: number; // Sum of fees * active for weighted
      termSum: number; // Sum of term * active for weighted
      count: number;
      dropouts: number;
    }>();

    // Map para Histórico (Agrupado por Data Base)
    const historyMap = new Map<string, number>();

    groups.forEach(g => {
      // Métricas básicas do grupo
      // Fórmula Ativas: Em dia + Contempladas Inad + Não Contempladas Inad
      const active = (g.metricas_cotas?.ativas_em_dia || 0) +
        (g.metricas_cotas?.contempladas_inadimplentes || 0) +
        (g.metricas_cotas?.nao_contempladas_inadimplentes || 0);

      const avgVal = g.caracteristicas?.valor_medio_do_bem || 0;
      const vol = active * avgVal;

      // Histórico
      const db = g.data_base;
      historyMap.set(db, (historyMap.get(db) || 0) + vol);

      // Apenas processar métricas do período MAIS RECENTE para o Report "Atual"
      // Como data.detailedGroups pode ter histórico, precisamos filtrar para o "Snapshot Atual".
      // O ideal seria que 'groups' já viesse filtrado pelo período mais recente ou que o AppDataStore já separasse?
      // DataStore carrega TUDO. Vamos assumir que para "Totais" pegamos o último período de cada grupo ÚNICO?
      // Ou assumimos que o Dashboard mostra o "Estado Atual" baseado na data_base mais recente encontrada no dataset?
    });

    // Encontrar Data Base mais recente no dataset desta ADM para o Snapshot
    const dates = Array.from(historyMap.keys()).sort();
    const latestDate = dates[dates.length - 1];

    // Filtrar apenas grupos da última data para métricas pontuais
    const currentGroups = groups.filter(g => g.data_base === latestDate);

    let currentTotalActive = 0;
    let currentTotalBalance = 0;
    let currentDefaults = 0;
    let currentFeesWeighted = 0;
    let currentTermsWeighted = 0;
    let currentSales = 0; // Proxies might be weak here

    currentGroups.forEach(g => {
      const active = (g.metricas_cotas?.ativas_em_dia || 0) +
        (g.metricas_cotas?.contempladas_inadimplentes || 0) +
        (g.metricas_cotas?.nao_contempladas_inadimplentes || 0);
      const avgVal = g.caracteristicas?.valor_medio_do_bem || 0;
      const vol = active * avgVal;

      currentTotalActive += active;
      currentTotalBalance += vol;

      const defs = (g.metricas_cotas?.contempladas_inadimplentes || 0) +
        (g.metricas_cotas?.nao_contempladas_inadimplentes || 0);
      currentDefaults += defs;

      currentFeesWeighted += (g.caracteristicas?.taxa_de_administracao || 0) * active;
      currentTermsWeighted += (g.caracteristicas?.prazo_do_grupo_em_meses || 0) * active;
      currentSales += (g.metricas_cotas?.contempladas_no_mes || 0); // Using contemplations as proxy for activity if sales not explicit

      // Segments
      const segCode = String(g.codigo_segmento || '99');
      if (!segMap.has(segCode)) {
        segMap.set(segCode, { code: segCode, active: 0, balance: 0, defaults: 0, feesSum: 0, termSum: 0, count: 0, dropouts: 0 });
      }
      const s = segMap.get(segCode)!;
      s.active += active;
      s.balance += vol;
      s.defaults += defs;
      s.feesSum += (g.caracteristicas?.taxa_de_administracao || 0); // Simple avg for segment details table (or weighted?) Table says 'Taxa Adm'. Weighted is better.
      s.count++;
      s.dropouts += (g.metricas_cotas?.excluidas || 0);
    });

    const avgAdminFee = currentTotalActive > 0 ? currentFeesWeighted / currentTotalActive : 0;
    const avgTerm = currentTotalActive > 0 ? currentTermsWeighted / currentTotalActive : 0;
    const defaultRate = currentTotalActive > 0 ? (currentDefaults / currentTotalActive) * 100 : 0;
    const avgTicket = currentTotalActive > 0 ? currentTotalBalance / currentTotalActive : 0;
    const salesPerGroup = currentGroups.length > 0 ? currentSales / currentGroups.length : 0;

    // Helper Nomes Segmentos
    const getSegName = (c: string) => {
      if (c === '1') return 'Imóveis';
      if (c === '2') return 'Pesados';
      if (c === '3') return 'Leves';
      if (c === '4') return 'Motos';
      if (c === '6') return 'Serviços';
      return 'Outros';
    };

    // Prepare Charts Data
    const segmentBreakdown = Array.from(segMap.values()).map(s => ({
      name: getSegName(s.code),
      balance: s.balance,
      active: s.active,
      avgFee: s.count > 0 ? s.feesSum / s.count : 0, // Keeping simple average for table column per group count logic
      defaultRate: s.active > 0 ? (s.defaults / s.active) * 100 : 0,
      dropoutRate: s.active > 0 ? (s.dropouts / s.active) * 100 : 0
    })).sort((a, b) => b.balance - a.balance);

    const segmentsData = segmentBreakdown.map(s => ({ name: s.name, value: s.balance }));
    const mainSegment = segmentsData.length > 0 ? segmentsData[0].name : 'Geral';

    const history = dates.map(d => ({ period: d, balance: historyMap.get(d) || 0 }));

    return {
      cnpj,
      name: adminName,
      totalBalance: currentTotalBalance,
      totalActive: currentTotalActive,
      avgTicket,
      defaultRate,
      salesPerGroup,
      avgAdminFee,
      avgTerm,
      mainSegment,
      segmentsData,
      segmentBreakdown,
      history
    };
  };

  // Memoize data for the selected single view
  const metricsA = useMemo(() => {
    if (!adminAId) return null;
    const admin = data.administrators.find(a => a.cnpj_raiz === adminAId); // Changed cnpj to cnpj_raiz
    if (!admin) return null;
    return getAdminMetrics(admin.cnpj_raiz, admin.nome_reduzido);
  }, [adminAId, data]);

  // Memoize Ranking Table Data (All Admins)
  const allAdminsMetrics = useMemo(() => {
    return data.administrators
      .map(admin => getAdminMetrics(admin.cnpj_raiz, admin.nome_reduzido))
      .filter(m => m !== null && m.totalActive > 0)
      .sort((a, b) => b!.totalBalance - a!.totalBalance); // Sort by Volume by default
  }, [data.administrators, data.consolidated, data.detailedGroups]);

  const handleGenerateReport = async () => {
    if (!metricsA) return;
    setLoadingAi(true);

    const context = `
      Relatório Adm: ${metricsA.name}.
      - Saldo Carteira: R$ ${(metricsA.totalBalance / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M
      - Prazo Médio Ponderado: ${metricsA.avgTerm.toFixed(0)} meses
      - Vendas/Grupo: ${metricsA.salesPerGroup.toFixed(1)} (Eficiência)
      - Taxa Adm: ${metricsA.avgAdminFee.toFixed(2)}%
      - Inadimplência: ${metricsA.defaultRate.toFixed(2)}%
    `;

    const result = await generateMarketInsight(context, {});
    const jsonStr = JSON.stringify(result);
    setAiAnalysis(jsonStr);
    localStorage.setItem(`admin_analysis_${adminAId}`, jsonStr);
    setLoadingAi(false);
  };

  const renderRankingView = () => (
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
          {allAdminsMetrics.length} players listados
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
              <th className="px-6 py-4">Principal Segmento</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allAdminsMetrics.map((admin, idx) => (
              <tr key={admin!.cnpj} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4 text-center font-bold text-slate-400">
                  {idx + 1}
                </td>
                <td className="px-6 py-4 font-bold text-slate-800">
                  {admin!.name}
                </td>
                <td className="px-6 py-4 text-right font-medium text-blue-700 bg-blue-50/30">
                  R$ {(admin!.totalBalance / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M
                </td>
                <td className="px-6 py-4 text-right text-slate-700">
                  {admin!.totalActive.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right text-slate-500">
                  R$ {admin!.avgTicket.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${admin!.defaultRate > 5 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {admin!.defaultRate.toFixed(2)}%
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-slate-500 uppercase font-medium">
                  {admin!.mainSegment}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => {
                      setAdminAId(admin!.cnpj);
                      setViewMode('detail');
                    }}
                    className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                    title="Ver Detalhes"
                  >
                    <ChevronRight size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {allAdminsMetrics.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400">
                  <p className="mb-2">Nenhum dado financeiro encontrado.</p>
                  <p className="text-xs">Certifique-se de importar arquivos de "Bens Imóveis" ou "Móveis" que contenham o campo "Valor Médio do Bem".</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSingleView = () => {
    if (!metricsA) return null;

    return (
      <div className="space-y-6 animate-fade-in">
        <button
          onClick={() => setViewMode('ranking')}
          className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 mb-2"
        >
          ← Voltar para Ranking
        </button>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10"><Wallet size={40} /></div>
            <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Saldo de Carteira</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">R$ {(metricsA.totalBalance / 1_000_000).toFixed(1)} M</p>
            <div className="mt-2 text-xs flex items-center gap-1 text-slate-400 font-medium">
              <Users size={12} /> {metricsA.totalActive.toLocaleString()} cotas ativas
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
                  <th className="px-6 py-3 text-center">Inadimplência</th>
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
                    <td className="px-6 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.defaultRate > 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {s.defaultRate.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center text-slate-500">{s.dropoutRate.toFixed(2)}%</td>
                  </tr>
                ))}
                {metricsA.segmentBreakdown.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-4 text-slate-400">Sem dados segmentados.</td></tr>
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

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Análise por Administradora</h2>
          <p className="text-slate-500">Raio-X financeiro e operacional consolidado.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {viewMode === 'detail' && (
            <div className="relative w-full md:min-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select
                value={adminAId}
                onChange={(e) => setAdminAId(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 shadow-sm appearance-none outline-none transition-all"
              >
                <option value="">Trocar Administradora...</option>
                {sortedAdmins.map(admin => (
                  <option key={admin.cnpj_raiz} value={admin.cnpj_raiz}>{admin.nome_reduzido}</option>
                ))}
              </select>
            </div>
          )}

          {viewMode === 'detail' && metricsA && (
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

      {aiAnalysis && viewMode === 'detail' && (
        <div className="bg-white border border-indigo-100 rounded-2xl p-6 shadow-sm animate-fade-in relative overflow-hidden">
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
            let parsed;
            try {
              parsed = typeof aiAnalysis === 'string' ? JSON.parse(aiAnalysis) : aiAnalysis;
            } catch (e) { return <p className="text-slate-500">Erro ao ler análise.</p>; }

            // Fallback for old text format if exists in localStorage
            if (parsed.text) return <p className="text-slate-700">{parsed.text}</p>;

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

      {viewMode === 'ranking' ? renderRankingView() : renderSingleView()}
    </div>
  );
};
