import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardOverview } from './components/views/DashboardOverview';
import { CompetitiveAnalysis } from './components/views/CompetitiveAnalysis';
import { TrendAnalysis } from './components/views/TrendAnalysis';
import { RegionalAnalysis } from './components/views/RegionalAnalysis';
import { Menu } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardOverview />;
      case 'competitive':
        return <CompetitiveAnalysis />;
      case 'trends':
        return <TrendAnalysis />;
      case 'regional':
        return <RegionalAnalysis />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-96 text-slate-400">
            <p className="text-lg">Módulo em desenvolvimento</p>
            <p className="text-sm">Selecione outra aba no menu.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center h-16 px-4 bg-white border-b border-slate-200">
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
          <div className="max-w-7xl mx-auto animate-fade-in">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}