
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardOverview } from './components/views/DashboardOverview';
import { CompetitiveAnalysis } from './components/views/CompetitiveAnalysis';
import { TrendAnalysis } from './components/views/TrendAnalysis';
import { RegionalAnalysis } from './components/views/RegionalAnalysis';
import { DataImport } from './components/views/DataImport';
import { Menu } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setRefreshKey(prev => prev + 1);
    window.addEventListener('dataUpdate', handleUpdate);
    return () => window.removeEventListener('dataUpdate', handleUpdate);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardOverview key={refreshKey} />;
      case 'competitive':
        return <CompetitiveAnalysis key={refreshKey} />;
      case 'trends':
        return <TrendAnalysis key={refreshKey} />;
      case 'regional':
        return <RegionalAnalysis key={refreshKey} />;
      case 'import':
        return <DataImport />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
            <div className="bg-slate-100 p-8 rounded-full mb-4">
               <Menu size={48} className="text-slate-300" />
            </div>
            <p className="text-lg font-semibold">Módulo em desenvolvimento</p>
            <p className="text-sm">Esta funcionalidade será liberada na próxima versão.</p>
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
