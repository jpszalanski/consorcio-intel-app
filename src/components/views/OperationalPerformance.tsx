
import React, { useState, useMemo } from 'react';
import { AppDataStore } from '../../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ScatterChart, Scatter, ZAxis, Legend, Cell, PieChart, Pie 
} from 'recharts';
import { Activity, ArrowRightLeft, TrendingDown, Search, Scale } from 'lucide-react';

interface Props {
  data: AppDataStore;
}

export const OperationalPerformance: React.FC<Props> = ({ data }) => {
  const [selectedAdminId, setSelectedAdminId] = useState<string>('');
  
  // Lista única de administradoras que possuem dados operacionais (Regional Data)
  const validAdmins = useMemo(() => {
    // Normaliza nomes para garantir match
    const adminsWithData = new Set(data.regional.map(r => r.adminName?.trim()));
    return data.administrators
      .filter(a => adminsWithData.has(a.name?.trim()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Cálculo de Métricas de Mercado (Scatter Plot)
  const marketScatterData = useMemo(() => {
    const adminMap = new Map();

    data.regional.forEach(reg => {
      const name = reg.adminName?.trim();
      if (!name) return;
      
      if (!adminMap.has(name)) {
        adminMap.set(name, { 
          name: name, 
          adhesions: 0, 
          dropouts: 0, 
          totalActive: 0 
        });
      }
      const curr = adminMap.get(name);
      curr.adhesions += (reg.newAdhesionsQuarter || 0);
      curr.dropouts += (reg.dropoutNonContemplated || 0);
      curr.totalActive += (reg.totalActive || 0);
    });

    return Array.from(adminMap.values())
      .filter(a => a.totalActive > 500) // Filtro de relevância
      .map(a => ({
        name: a.name,
        churnRate: a.totalActive > 0 ? (a.dropouts / a.totalActive) * 100 : 0,
        growthRate: a.totalActive > 0 ? (a.adhesions / a.totalActive) * 100 : 0,
        replacementRatio: a.dropouts > 0 ? a.adhesions / a.dropouts : 0,
        size: a.totalActive
      }));
  }, [data.regional]);

  // Métricas da Administradora Selecionada
  const selectedMetrics = useMemo(() => {
    if (!selectedAdminId) return null;
    const admin = data.administrators.find(a => a.cnpj === selectedAdminId);
    if (!admin) return null;

    const regionalData = data.regional.filter(r => r.adminName?.trim() === admin.name?.trim());

    const totalAdhesions = regionalData.reduce((acc, curr) => acc + (curr.newAdhesionsQuarter || 0), 0);
    const totalDropouts = regionalData.reduce((acc, curr) => acc + (curr.dropoutNonContemplated || 0), 0);
    const totalActive = regionalData.reduce((acc, curr) => acc + (curr.totalActive || 0), 0);
    const totalBid = regionalData.reduce((acc, curr) => acc + (curr.activeContemplatedBid || 0), 0);
    const totalLottery = regionalData.reduce((acc, curr) => acc + (curr.activeContemplatedLottery || 0), 0);

    const replacementRatio = totalDropouts > 0 ? totalAdhesions / totalDropouts : 0;
    
    // Score de saúde ponderado
    const scoreChurn = Math.max(0, 100 - ((totalDropouts / (totalActive || 1)) * 400)); // Churn alto penaliza muito
    const scoreReposition = Math.min(100, replacementRatio * 50); // Reposição > 2x é 100
    const healthScore = (scoreChurn * 0.6) + (scoreReposition * 0.4);

    // Dados por Região para Gráfico
    const regionChartData = regionalData.reduce((acc: any[], curr) => {
      const region = curr.region || 'Outra';
      const existing = acc.find(x => x.region === region);
      if (existing) {
        existing.adhesions += (curr.newAdhesionsQuarter || 0);
        existing.dropouts += (curr.dropoutNonContemplated || 0);
      } else {
        acc.push({ 
          region: region, 
          adhesions: (curr.newAdhesionsQuarter || 0), 
          dropouts: (curr.dropoutNonContemplated || 0) 
        });
      }
      return acc;
    }, []);

    return {
      name: admin.name,
      totalActive,
      replacementRatio,
      churnRate: totalActive > 0 ? (totalDropouts / totalActive) * 100 : 0,
      contemplationMix: [
        { name: 'Sorteio', value: totalLottery, color: '#10b981' },
        { name: 'Lance', value: totalBid, color: '#3b82f6' }
      ],
      regionChartData,
      healthScore
    };
  }, [selectedAdminId, data]);

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
            {validAdmins.map(admin => (
              <option key={admin.cnpj} value={admin.cnpj}>{admin.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedAdminId ? (
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
                <Scatter name="Administradoras" data={marketScatterData} fill="#3b82f6">
                  {marketScatterData.map((entry, index) => (
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
        selectedMetrics && (
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
                <h3 className="font-bold text-slate-800 mb-6">Fluxo Líquido por Região</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedMetrics.regionChartData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="region" type="category" width={100} tick={{fontSize: 12}} />
                      <Tooltip cursor={{fill: 'transparent'}} />
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
