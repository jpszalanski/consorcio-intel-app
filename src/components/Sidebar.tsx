
import React from 'react';
import { LayoutDashboard, TrendingUp, Map, PieChart, Activity, Menu, X, Database, Building2, Wifi, WifiOff, FileText, LogOut, LogIn, Users, Trophy, GitCompareArrows } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  dbStatus?: boolean; // Novo prop para status do banco
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isMobileOpen, setIsMobileOpen, dbStatus = false }) => {
  const { user, isAdmin, signOut } = useAuth();


  const menuItems = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'evolution', label: 'Painel Evolutivo', icon: TrendingUp },
    { id: 'admin_analysis', label: 'Análise por Adm.', icon: Building2 },
    { id: 'ranking', label: 'Ranking Administradoras', icon: Trophy },
    { id: 'comparison', label: 'Comparar Administradoras', icon: GitCompareArrows },
    { id: 'operational', label: 'Performance Oper.', icon: Activity },
    { id: 'competitive', label: 'Posicionamento Competitivo', icon: PieChart },
    { id: 'trends', label: 'Tendências de Mercado', icon: TrendingUp },
    { id: 'regional', label: 'Análise Regional', icon: Map },
    { id: 'import', label: 'Importar Dados', icon: Database },
    { id: 'file_control', label: 'Controle Arquivos', icon: FileText },
    { id: 'settings', label: 'Configurações AI', icon: Menu },
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
        className={`fixed top-0 left-0 z-30 h-full w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:flex flex flex-col ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex-none h-16 flex items-center justify-between px-6 bg-slate-950 border-b border-slate-800/50">
          <span className="text-xl font-bold tracking-tight text-blue-400">Consórcio<span className="text-white">Intel</span></span>
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden text-slate-400"
            aria-label="Fechar menu lateral"
          >
            <X size={20} />
          </button>
        </div>

        {/* User Profile - Top - Fixed */}
        <div className="flex-none px-6 py-4 border-b border-slate-800/30">
          {user ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-slate-300 text-xs truncate">
                <Users size={14} className="min-w-[14px] text-blue-500" />
                <span className="truncate font-medium">{user.email}</span>
              </div>
              <div className="flex items-center justify-between">
                {isAdmin && (
                  <span className="text-[10px] bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded border border-blue-800/50">Admin</span>
                )}
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-1 text-slate-500 hover:text-white text-[10px] transition-colors ml-auto"
                  title="Sair"
                >
                  <LogOut size={12} /> Sair
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setActiveTab('login')}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs py-2 rounded-lg transition-colors border border-slate-700"
            >
              <LogIn size={14} /> Fazer Login
            </button>
          )}

          {/* Discreet Status Indicators */}
          <div className="mt-4 pt-3 border-t border-slate-800/30 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity" title="Status API Gemini">
              <div className={`h-1.5 w-1.5 rounded-full ${import.meta.env.VITE_GEMINI_API_KEY ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-[10px] font-medium text-slate-400">AI {import.meta.env.VITE_GEMINI_API_KEY ? 'ON' : 'OFF'}</span>
            </div>
            <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity" title="Conexão Banco de Dados">
              {dbStatus ? <Wifi size={10} className="text-green-500" /> : <WifiOff size={10} className="text-red-500" />}
              <span className="text-[10px] font-medium text-slate-400">DB {dbStatus ? 'ON' : 'OFF'}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-2 mt-2 custom-scrollbar">
          {menuItems.filter(item => {
            // Admin-only items
            if (['import', 'file_control', 'settings'].includes(item.id)) {
              return isAdmin;
            }
            return true;
          }).map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileOpen(false);
                }}
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${activeTab === item.id
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

      </aside>
    </>
  );
};
