
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
    return [...data.administrators].sort((a, b) => a.name.localeCompare(b.name));
  }, [data.administrators]);

  // Função central para calcular métricas de UMA administradora
  const getAdminMetrics = (cnpj: string, adminName: string) => {
    // Filtros por coleção
    const segmentData = data.segments.filter(o => o.cnpj === cnpj || o.adminName === adminName);
    const realEstateData = data.realEstateGroups.filter(o => o.cnpj === cnpj || o.adminName === adminName);
    const movablesData = data.movableGroups.filter(o => o.cnpj === cnpj || o.adminName === adminName);

    // Combinação
    const allRecords = [...segmentData, ...realEstateData, ...movablesData];
    if (allRecords.length === 0) return null;

    // Normalização
    const normalizedRecords = allRecords.map(r => {
        const isGroup = 'valorMedioBem' in r;
        const valorBem = isGroup ? (r as any).valorMedioBem : 0;
        const active = 'cotasAtivas' in r ? r.cotasAtivas : (r as any).activeQuotas || 0;
        const prazo = isGroup ? (r as any).prazoGrupo : 0;
        const activeGroups = r.gruposAtivos || 0;
        const sales = r.cotasComercializadas || 0;
        
        // CRITICAL: Force use of calculated balance if group data is available
        const calculatedBalance = valorBem * active;
        const balance = calculatedBalance > 0 ? calculatedBalance : (r.revenue || 0);

        return {
           period: r.period,
           activeQuotas: active,
           balance: balance,
           newSales: sales,
           dropouts: r.cotasExcluidas || 0,
           defaultCount: 'cotasInadimplentes' in r ? r.cotasInadimplentes : ('cotasAtivasInadimplentes' in r ? r.cotasAtivasInadimplentes : 0),
           taxaAdmin: r.taxaAdmin || 0,
           prazo,
           activeGroups,
           segment: r.segment
        };
    });

    const totalActive = normalizedRecords.reduce((acc, curr) => acc + curr.activeQuotas, 0);
    const totalBalance = normalizedRecords.reduce((acc, curr) => acc + curr.balance, 0); 
    const totalSales = normalizedRecords.reduce((acc, curr) => acc + curr.newSales, 0);
    const totalDropouts = normalizedRecords.reduce((acc, curr) => acc + curr.dropouts, 0);
    const totalDefault = normalizedRecords.reduce((acc, curr) => acc + curr.defaultCount, 0);
    
    // Breakdown por Segmento
    const segmentBreakdownMap = new Map();
    normalizedRecords.forEach(rec => {
       const seg = rec.segment || 'Outros';
       if (!segmentBreakdownMap.has(seg)) {
         segmentBreakdownMap.set(seg, { name: seg, active: 0, balance: 0, defaultCount: 0, fees: [], dropouts: 0 });
       }
       const entry = segmentBreakdownMap.get(seg);
       entry.active += rec.activeQuotas;
       entry.balance += rec.balance;
       entry.defaultCount += rec.defaultCount;
       entry.dropouts += rec.dropouts;
       if (rec.taxaAdmin > 0) entry.fees.push(rec.taxaAdmin);
    });

    const segmentBreakdown = Array.from(segmentBreakdownMap.values()).map(s => ({
       name: s.name,
       active: s.active,
       balance: s.balance,
       defaultRate: s.active > 0 ? (s.defaultCount / s.active) * 100 : 0,
       dropoutRate: s.active > 0 ? (s.dropouts / s.active) * 100 : 0,
       avgFee: s.fees.length > 0 ? s.fees.reduce((a:number, b:number) => a + b, 0) / s.fees.length : 0
    })).sort((a,b) => b.balance - a.balance);

    // Médias Ponderadas
    let weightedFeeSum = 0;
    let weightedTermSum = 0;
    let weightSum = 0; 
    let salesEfficiencySum = 0; 
    let groupsCount = 0;

    normalizedRecords.forEach(o => {
      const weight = o.balance || 1; 
      weightedFeeSum += o.taxaAdmin * weight;
      if (o.prazo > 0) weightedTermSum += o.prazo * weight;
      weightSum += weight;

      if (o.activeGroups > 0) {
          salesEfficiencySum += (o.newSales / o.activeGroups);
          groupsCount++;
      }
    });

    const avgAdminFee = weightSum > 0 ? weightedFeeSum / weightSum : 0;
    const avgTerm = weightSum > 0 ? weightedTermSum / weightSum : 0; 
    const salesPerGroup = groupsCount > 0 ? salesEfficiencySum / groupsCount : 0;

    const churnRate = totalActive > 0 ? (totalDropouts / totalActive) * 100 : 0;
    const defaultRate = totalActive > 0 ? (totalDefault / totalActive) * 100 : 0;
    const avgTicket = totalActive > 0 ? totalBalance / totalActive : 0;

    // Segmentos Pie
    const segmentsData = segmentBreakdown.map(s => ({ name: s.name, value: s.balance }));

    // History Line
    const historyMap = new Map<string, { period: string, balance: number, active: number }>();
    normalizedRecords.forEach(curr => {
       if (!historyMap.has(curr.period)) {
         historyMap.set(curr.period, { period: curr.period, balance: 0, active: 0 });
       }
       const h = historyMap.get(curr.period)!;
       h.balance += curr.balance;
       h.active += curr.activeQuotas;
    });

    const history = Array.from(historyMap.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-12);

    return {
      name: adminName,
      cnpj: cnpj,
      totalActive,
      totalBalance,
      totalSales,
      avgAdminFee,
      avgTerm,
      salesPerGroup,
      churnRate,
      defaultRate,
      avgTicket,
      segmentsData,
      segmentBreakdown,
      history,
      mainSegment: segmentBreakdown[0]?.name || 'Diversos'
    };
  };

  // Memoize data for the selected single view
  const metricsA = useMemo(() => {
     if(!adminAId) return null;
     const admin = data.administrators.find(a => a.cnpj === adminAId);
     if (!admin) return null;
     return getAdminMetrics(admin.cnpj, admin.name);
  }, [adminAId, data]);

  // Memoize Ranking Table Data (All Admins)
  const allAdminsMetrics = useMemo(() => {
    return data.administrators
      .map(admin => getAdminMetrics(admin.cnpj, admin.name))
      .filter(m => m !== null && m.totalActive > 0)
      .sort((a, b) => b!.totalBalance - a!.totalBalance); // Sort by Volume by default
  }, [data.administrators, data.segments, data.realEstateGroups, data.movableGroups]);

  const handleGenerateReport = async () => {
    if (!metricsA) return;
    setLoadingAi(true);
    
    const context = `
      Relatório Adm: ${metricsA.name}.
      - Saldo Carteira: R$ ${(metricsA.totalBalance/1000000).toFixed(1)}M
      - Prazo Médio Ponderado: ${metricsA.avgTerm.toFixed(0)} meses
      - Vendas/Grupo: ${metricsA.salesPerGroup.toFixed(1)} (Eficiência)
      - Taxa Adm: ${metricsA.avgAdminFee.toFixed(2)}%
      - Inadimplência: ${metricsA.defaultRate.toFixed(2)}%
    `;

    const result = await generateMarketInsight(context, {});
    setAiAnalysis(result.text);
    localStorage.setItem(`admin_analysis_${adminAId}`, result.text);
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
                <ListChecks size={18} className="text-slate-500"/>
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
                           {s.balance > 0 ? `R$ ${(s.balance/1000000).toFixed(1)}M` : '-'}
                        </td>
                        <td className="px-6 py-3 text-right">{s.active.toLocaleString()}</td>
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
                        <Tooltip formatter={(value:number) => `R$ ${(value/1000000).toFixed(1)}M`} />
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
                     <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                     <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} tickFormatter={(val) => `R$${(val/1000000).toFixed(0)}M`} />
                     <Tooltip formatter={(value: number) => [`R$ ${(value/1000000).toFixed(2)}M`, 'Saldo']} />
                     <Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={3} dot={{r:4}} />
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
                   <option key={admin.cnpj} value={admin.cnpj}>{admin.name}</option>
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
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 shadow-sm animate-fade-in relative">
          <div className="flex items-start gap-4">
             <div className="p-3 bg-indigo-100 rounded-lg text-indigo-600">
               <Sparkles size={24} />
             </div>
             <div>
                <h3 className="text-indigo-900 font-bold text-lg mb-2">Insight Estratégico Gemini</h3>
                <div className="prose prose-sm text-slate-700 max-w-none">
                  {aiAnalysis}
                </div>
             </div>
          </div>
        </div>
      )}

      {viewMode === 'ranking' ? renderRankingView() : renderSingleView()}
    </div>
  );
};
