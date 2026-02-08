
import React, { useState, useMemo, useEffect } from 'react';
import { AppDataStore } from '../../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, Legend, Cell, PieChart, Pie
} from 'recharts';
import { Activity, ArrowRightLeft, TrendingDown, Search, Scale, Loader2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';



interface MarketScatterRow {
  cnpj_raiz: string;
  nome_reduzido: string;
  adesoes: number | string;
  total_dropouts: number | string;
  total_active: number | string;
}

interface AdminDetailRow {
  segment_code: number | string;
  segment_name: string;
  adesoes: number | string;
  total_dropouts: number | string;
  total_active: number | string;
  stock_bid: number | string;
  stock_lottery: number | string;
}

export const OperationalPerformance: React.FC = () => {
  const { user } = useAuth();
  const [selectedAdminId, setSelectedAdminId] = useState<string>('');

  const [scatterData, setScatterData] = useState<MarketScatterRow[]>([]);
  const [loadingScatter, setLoadingScatter] = useState(true);

  const [detailRows, setDetailRows] = useState<AdminDetailRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // 1. Fetch Market Overview (Scatter)
  useEffect(() => {
    const fetchMarket = async () => {
      // Add check for user
      if (!user) return;

      try {

        const getOps = httpsCallable<{ mode: string; administratorId: string }, { data: MarketScatterRow[] }>(functions, 'getOperationalData');
        const result = await getOps({ mode: 'market', administratorId: user.uid });
        setScatterData(result.data.data);
      } catch (error) {
        console.error("Error fetching market ops", error);
      } finally {
        setLoadingScatter(false);
      }
    };

    if (user) fetchMarket();
  }, [user]);

  // 2. Fetch Detail
  useEffect(() => {
    if (!selectedAdminId || !user) return;
    const fetchDetail = async () => {
      setLoadingDetail(true);
      try {

        const getOps = httpsCallable<{ mode: string; cnpj: string; administratorId: string }, { data: AdminDetailRow[] }>(functions, 'getOperationalData');
        const result = await getOps({ mode: 'detail', cnpj: selectedAdminId, administratorId: user.uid });
        setDetailRows(result.data.data);
      } catch (error) {
        console.error("Error fetching detail ops", error);
      } finally {
        setLoadingDetail(false);
      }
    };
    fetchDetail();
  }, [selectedAdminId, user]);

  // Transform Scatter Data for Chart
  const marketScatterChartData = useMemo(() => {
    return scatterData.map(d => {
      const active = Number(d.total_active) || 0;
      const adesoes = Number(d.adesoes) || 0;
      const dropouts = Number(d.total_dropouts) || 0;

      return {
        name: d.nome_reduzido || 'Unknown',
        cnpj: d.cnpj_raiz,
        size: active,
        churnRate: active > 0 ? (dropouts / active) * 100 : 0,
        growthRate: active > 0 ? (adesoes / active) * 100 : 0,
      };
    });
  }, [scatterData]);

  // Aggregate Detail Metrics
  const selectedMetrics = useMemo(() => {
    if (!selectedAdminId || detailRows.length === 0) return null;

    let totalAdhesions = 0;
    let totalDropouts = 0;
    let totalActive = 0;
    let sumBid = 0;
    let sumLottery = 0;

    const regionChartData = detailRows.map(r => {
      const ads = Number(r.adesoes) || 0;
      const drops = Number(r.total_dropouts) || 0; // Using Total Dropouts for Region Chart too
      const act = Number(r.total_active) || 0;

      totalAdhesions += ads;
      totalDropouts += drops;
      totalActive += act;
      sumBid += (Number(r.stock_bid) || 0);
      sumLottery += (Number(r.stock_lottery) || 0);

      return {
        region: r.segment_name || `Segmento ${r.segment_code}`,
        adhesions: ads,
        dropouts: drops
      };
    }).sort((a, b) => b.adhesions - a.adhesions).slice(0, 15);

    const replacementRatio = totalDropouts > 0 ? totalAdhesions / totalDropouts : 0;

    // Score
    const scoreChurn = Math.max(0, 100 - ((totalDropouts / (totalActive || 1)) * 400));
    const scoreReposition = Math.min(100, replacementRatio * 50);
    const healthScore = (scoreChurn * 0.6) + (scoreReposition * 0.4);

    return {
      name: scatterData.find(s => s.cnpj_raiz === selectedAdminId)?.nome_reduzido || 'Selecionada',
      totalActive,
      replacementRatio,
      churnRate: totalActive > 0 ? (totalDropouts / totalActive) * 100 : 0,
      contemplationMix: [
        { name: 'Sorteio', value: sumLottery, color: '#10b981' },
        { name: 'Lance', value: sumBid, color: '#3b82f6' }
      ],
      regionChartData,
      healthScore
    };
  }, [selectedAdminId, detailRows, scatterData]);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="text-blue-600" />
            Performance Operacional
          </h2>
          <p className="text-slate-500">Benchmark de eficiência, churn e saúde da carteira das administradoras.</p>
        </div>

        <div className="w-full md:w-80 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <select
            value={selectedAdminId}
            onChange={(e) => setSelectedAdminId(e.target.value)}
            className="block w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 shadow-sm appearance-none cursor-pointer"
          >
            <option value="">Visão Geral do Mercado (Scatter)</option>
            {[...scatterData].sort((a, b) => (a.nome_reduzido || '').localeCompare(b.nome_reduzido || '')).map(admin => (
              <option key={admin.cnpj_raiz} value={admin.cnpj_raiz}>{admin.nome_reduzido || 'Desconhecida'}</option>
            ))}
          </select>
        </div>
      </div>

      {loadingScatter ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <Loader2 className="animate-spin mb-4" size={32} />
          <p>Carregando mercado...</p>
        </div>
      ) : !selectedAdminId ? (
        // VISÃO DE MERCADO
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="mb-6 flex justify-between items-end">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Matriz de Eficiência (Vendas vs Evasão)</h3>
              <p className="text-sm text-slate-500">Comparativo de todas as administradoras importadas.</p>
            </div>
          </div>

          <div className="h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="churnRate" name="Churn %" unit="%" label={{ value: 'Taxa de Evasão (Churn)', position: 'bottom', offset: 0 }} />
                <YAxis type="number" dataKey="growthRate" name="Vendas %" unit="%" label={{ value: 'Taxa de Novas Vendas', angle: -90, position: 'left' }} />
                <ZAxis type="number" dataKey="size" range={[50, 400]} name="Cotas Ativas" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 border border-slate-200 shadow-xl rounded-lg text-xs z-50">
                          <p className="font-bold text-slate-900 mb-1">{data.name}</p>
                          <p className="text-emerald-600">Vendas: {data.growthRate.toFixed(2)}%</p>
                          <p className="text-red-500">Evasão: {data.churnRate.toFixed(2)}%</p>
                          <p className="text-slate-500 mt-1">Cotas Ativas: {data.size.toLocaleString()}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Administradoras" data={marketScatterChartData} fill="#3b82f6">
                  {marketScatterChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.growthRate > entry.churnRate ? '#10b981' : '#ef4444'} fillOpacity={0.6} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4 text-xs text-slate-500">
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded-full opacity-60"></div> Carteira em Expansão (Vendas {'>'} Churn)</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded-full opacity-60"></div> Carteira em Contração (Churn {'>'} Vendas)</div>
          </div>
        </div>
      ) : (
        // VISÃO DETALHADA
        loadingDetail ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Loader2 className="animate-spin mb-4" size={32} />
            <p>Carregando detalhes...</p>
          </div>
        ) : selectedMetrics && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-10 ${selectedMetrics.healthScore > 60 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <h3 className="text-sm font-medium text-slate-500 mb-1">Score Operacional</h3>
                <div className="text-3xl font-bold text-slate-900">{selectedMetrics.healthScore.toFixed(0)}</div>
                <div className="text-xs text-slate-400 mt-2">Índice de saúde da carteira</div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-1">
                  <ArrowRightLeft size={14} /> Reposição
                </h3>
                <div className={`text-3xl font-bold ${selectedMetrics.replacementRatio >= 1 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {selectedMetrics.replacementRatio.toFixed(2)}x
                </div>
                <div className="text-xs text-slate-400 mt-2">Novas vendas vs. Saídas</div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-1">
                  <TrendingDown size={14} /> Churn Rate
                </h3>
                <div className="text-3xl font-bold text-amber-600">
                  {selectedMetrics.churnRate.toFixed(2)}%
                </div>
                <div className="text-xs text-slate-400 mt-2">Desistência sobre ativo</div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-1">
                  <Scale size={14} /> Mix Contemplação
                </h3>
                <div className="text-lg font-bold text-blue-600 mt-1">
                  {((selectedMetrics.contemplationMix[1].value / (selectedMetrics.contemplationMix[0].value + selectedMetrics.contemplationMix[1].value || 1)) * 100).toFixed(0)}% Lance
                </div>
                <div className="text-xs text-slate-400 mt-1">vs. Sorteio</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-6">Fluxo Líquido por Segmento</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedMetrics.regionChartData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="region" type="category" width={100} tick={{ fontSize: 12 }} />
                      <Tooltip cursor={{ fill: 'transparent' }} />
                      <Legend />
                      <Bar dataKey="adhesions" name="Entradas (Vendas)" fill="#10b981" barSize={20} radius={[0, 4, 4, 0]} />
                      <Bar dataKey="dropouts" name="Saídas (Desistências)" fill="#ef4444" barSize={20} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-2">Perfil de Contemplação</h3>
                <div className="h-64 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={selectedMetrics.contemplationMix}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {selectedMetrics.contemplationMix.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
};
