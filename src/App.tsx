import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardOverview } from './components/views/DashboardOverview';
import { AdministratorAnalysis } from './components/views/AdministratorAnalysis';
import { AdministratorRanking } from './components/views/AdministratorRanking';
import { AdministratorComparison } from './components/views/AdministratorComparison';
import { OperationalPerformance } from './components/views/OperationalPerformance';
import { CompetitiveAnalysis } from './components/views/CompetitiveAnalysis';
import { TrendAnalysis } from './components/views/TrendAnalysis';
import { RegionalAnalysis } from './components/views/RegionalAnalysis';
import { DataImport } from './components/views/DataImport';
import { FileControlView } from './components/views/FileControlView';
import { EvolutionDashboard } from './components/views/EvolutionDashboard';
import { PromptSettings } from './components/views/PromptSettings';
import { LoginView } from './components/views/LoginView';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Menu, Loader2 } from 'lucide-react';
import { dataStore } from './services/dataStore';

import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from './components/common/ErrorBoundary';



function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState(false);

  // Connection Check Only
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      const isConnected = await dataStore.checkConnection();
      setDbStatus(isConnected);
      setIsLoading(false);
    };
    checkAuth();
  }, []);

  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!loading && !user && activeTab !== 'dashboard') {
      setShowLogin(true);
    } else {
      setShowLogin(false);
    }
  }, [user, activeTab, loading]);

  useEffect(() => {
    const handleTabChange = (e: CustomEvent) => {
      setActiveTab(e.detail);
    };
    window.addEventListener('changeTab', handleTabChange as EventListener);
    return () => window.removeEventListener('changeTab', handleTabChange as EventListener);
  }, []);

  const renderContent = () => {
    if (isLoading || loading) {
      return (
        <div className="flex h-[80vh] items-center justify-center flex-col gap-4 text-slate-400">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p>Carregando...</p>
        </div>
      );
    }

    if (showLogin) {
      return <LoginView onLoginSuccess={() => setShowLogin(false)} />;
    }

    return (
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        {(() => {
          switch (activeTab) {
            case 'dashboard':
              return <DashboardOverview />;
            case 'evolution':
              return <EvolutionDashboard />;
            case 'admin_analysis':
              return <AdministratorAnalysis />;
            case 'ranking':
              return <AdministratorRanking />;
            case 'comparison':
              return <AdministratorComparison />;
            case 'operational':
              return <OperationalPerformance />;
            case 'competitive':
              return <CompetitiveAnalysis />;
            case 'trends':
              return <TrendAnalysis />;
            case 'regional':
              return <RegionalAnalysis />;
            case 'import':
              return <DataImport />;
            case 'file_control':
              return <FileControlView />;
            case 'settings':
              return <PromptSettings />;



            default:
              return (
                <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
                  <Menu size={48} className="text-slate-300 mb-4" />
                  <p className="text-lg font-semibold">Módulo em desenvolvimento</p>
                </div>
              );
          }
        })()}
      </ErrorBoundary>
    );
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
            aria-label="Abrir menu de navegação"
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

export default function AppWrapper() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
