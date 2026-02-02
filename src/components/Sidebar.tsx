
import React from 'react';
import { LayoutDashboard, TrendingUp, Map, PieChart, Briefcase, Activity, Menu, Database, Building2, Wifi, WifiOff } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  dbStatus?: boolean; // Novo prop para status do banco
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isMobileOpen, setIsMobileOpen, dbStatus = false }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'admin_analysis', label: 'Análise por Adm.', icon: Building2 },
    { id: 'operational', label: 'Performance Oper.', icon: Activity }, // Novo Item
    { id: 'competitive', label: 'Posicionamento Competitivo', icon: PieChart },
    { id: 'trends', label: 'Tendências de Mercado', icon: TrendingUp },
    { id: 'regional', label: 'Análise Regional', icon: Map },
    { id: 'import', label: 'Importar Dados', icon: Database },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-20 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed top-0 left-0 z-30 h-full w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:block ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-6 bg-slate-950 border-b border-slate-800/50">
          <span className="text-xl font-bold tracking-tight text-blue-400">Consórcio<span className="text-white">Intel</span></span>
          <button onClick={() => setIsMobileOpen(false)} className="lg:hidden text-slate-400">
            <Menu size={20} />
          </button>
        </div>

        <nav className="p-4 space-y-2 mt-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                  activeTab === item.id
                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/50 scale-105'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-full p-6 border-t border-slate-800 bg-slate-950/50">
          <div className="rounded-xl bg-slate-800/50 p-4 border border-slate-700/50 space-y-3">
            <div>
              <h4 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-widest">Status da API</h4>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${process.env.API_KEY ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-xs font-medium text-slate-300">
                  {process.env.API_KEY ? 'Gemini 3 Pro' : 'Chave Offline'}
                </span>
              </div>
            </div>
            
            <div className="pt-3 border-t border-slate-700/50">
              <h4 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-widest">Banco de Dados</h4>
              <div className="flex items-center gap-2">
                {dbStatus ? <Wifi size={14} className="text-green-500" /> : <WifiOff size={14} className="text-red-500" />}
                <span className={`text-xs font-medium ${dbStatus ? 'text-green-400' : 'text-red-400'}`}>
                  {dbStatus ? 'Firestore Online' : 'Desconectado'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
