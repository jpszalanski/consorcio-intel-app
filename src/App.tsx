
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardOverview } from './components/views/DashboardOverview';
import { AdministratorAnalysis } from './components/views/AdministratorAnalysis';
import { OperationalPerformance } from './components/views/OperationalPerformance';
import { CompetitiveAnalysis } from './components/views/CompetitiveAnalysis';
import { TrendAnalysis } from './components/views/TrendAnalysis';
import { RegionalAnalysis } from './components/views/RegionalAnalysis';
import { DataImport } from './components/views/DataImport';
import { Menu, Loader2 } from 'lucide-react';
import { dataStore } from './services/dataStore';
import { AppDataStore } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  // Estado Global de Dados (Cache simples)
  const [globalData, setGlobalData] = useState<AppDataStore | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState(false);

  // Carregamento inicial de dados
  const fetchData = async () => {
    setIsLoading(true);
    
    // Verifica conexão primeiro
    const isConnected = await dataStore.checkConnection();
    setDbStatus(isConnected);

    const data = await dataStore.fetchData();
    setGlobalData(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
    // Ouve atualizações vindas do DataImport ou DataStore
    window.addEventListener('dataUpdate', fetchData);
    return () => window.removeEventListener('dataUpdate', fetchData);
  }, []);

  const renderContent = () => {
    if (isLoading && activeTab !== 'import') {
      return (
        <div className="flex h-[80vh] items-center justify-center flex-col gap-4 text-slate-400">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p>Carregando dados do Firestore...</p>
          {!dbStatus && <p className="text-xs text-amber-500">Tentando estabelecer conexão segura...</p>}
        </div>
      );
    }

    // Se não houver dados globais (exceto na importação), evita crash
    if (!globalData && activeTab !== 'import') {
       return <DataImport />; 
    }

    switch (activeTab) {
      case 'dashboard':
        return <DashboardOverview data={globalData!} />;
      case 'admin_analysis':
        return <AdministratorAnalysis data={globalData!} />;
      case 'operational':
        return <OperationalPerformance data={globalData!} />;
      case 'competitive':
        return <CompetitiveAnalysis data={globalData!} />;
      case 'trends':
        return <TrendAnalysis data={globalData!} />;
      case 'regional':
        return <RegionalAnalysis data={globalData!} />;
      case 'import':
        return <DataImport />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
            <Menu size={48} className="text-slate-300 mb-4" />
            <p className="text-lg font-semibold">Módulo em desenvolvimento</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        dbStatus={dbStatus}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center h-16 px-6 bg-white border-b border-slate-200">
          <button 
            onClick={() => setIsMobileOpen(true)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <Menu size={24} />
          </button>
          <span className="ml-4 font-bold text-slate-900">Consórcio Intel</span>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto pb-12">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
