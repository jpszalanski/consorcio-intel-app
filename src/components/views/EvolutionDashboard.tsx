
import React, { useState, useEffect } from 'react';
import { Loader2, TrendingUp, Users, PieChart, Activity } from "lucide-react";
import { IndicatorsService } from '../../services/IndicatorsService';
import { MarketShareIndicators, GrowthIndicators, PortfolioQualityIndicators, DefaultIndicators } from '../../types/evolution';
import { useAuth } from '../../hooks/useAuth';

// Simple UI Components
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${className || ''}`}>
        {children}
    </div>
);

const CardHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={`p-6 pb-2 ${className || ''}`}>
        {children}
    </div>
);

const CardTitle = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h3 className={`font-semibold tracking-tight ${className || ''}`}>
        {children}
    </h3>
);

const CardDescription = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <p className={`text-sm text-slate-500 mt-1 ${className || ''}`}>
        {children}
    </p>
);

const CardContent = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={`p-6 pt-2 ${className || ''}`}>
        {children}
    </div>
);

// Custom Tabs Implementation
const Tabs = ({ defaultValue, className, onValueChange, children }: any) => {
    const [activeTab, setActiveTab] = useState(defaultValue);

    // Clone children to pass down active state
    const childrenWithProps = React.Children.map(children, child => {
        if (React.isValidElement(child)) {
            return React.cloneElement(child, { value: activeTab, onValueChange: (v: string) => { setActiveTab(v); if (onValueChange) onValueChange(v); } } as any);
        }
        return child;
    });

    return <div className={className}>{childrenWithProps}</div>;
};

const TabsList = ({ children, className }: any) => (
    <div className={`inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500 ${className}`}>
        {children}
    </div>
);

const TabsTrigger = ({ value, children, onValueChange, value: activeValue }: any) => (
    <button
        type="button"
        onClick={() => onValueChange(value)}
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 
        ${activeValue === value ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-slate-200/50 hover:text-slate-700'}`}
    >
        {children}
    </button>
);

const TabsContent = ({ value, children, value: activeValue, className }: any) => {
    if (value !== activeValue) return null;
    return <div className={className}>{children}</div>;
};
const MarketShareSection = ({ data }: { data: MarketShareIndicators[] }) => (
    <Card className="mb-6">
        <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
                <PieChart className="h-5 w-5 text-indigo-600" />
                Participação de Mercado
            </CardTitle>
            <CardDescription>Análise de Market Share por Cotas e Vendas</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="p-4 bg-slate-50 rounded-lg text-center text-slate-500">
                {data.length > 0 ? `${data.length} registros carregados` : "Nenhum dado disponível"}
                <br />
                <span className="text-xs">Gráficos de Market Share serão exibidos aqui.</span>
            </div>
        </CardContent>
    </Card>
);

const GrowthSection = ({ data }: { data: GrowthIndicators[] }) => (
    <Card className="mb-6">
        <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                Crescimento e Expansão
            </CardTitle>
        </CardHeader>
        <CardContent>
            <div className="p-4 bg-slate-50 rounded-lg text-center text-slate-500">
                {data.length > 0 ? `${data.length} registros carregados` : "Nenhum dado disponível"}
                <br />
                <span className="text-xs">Tendências de Vendas e Ticket Médio.</span>
            </div>
        </CardContent>
    </Card>
);

const QualitySection = ({ data }: { data: PortfolioQualityIndicators[] }) => (
    <Card className="mb-6">
        <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                Qualidade da Carteira
            </CardTitle>
        </CardHeader>
        <CardContent>
            <div className="p-4 bg-slate-50 rounded-lg text-center text-slate-500">
                {data.length > 0 ? `${data.length} registros carregados` : "Nenhum dado disponível"}
                <br />
                <span className="text-xs">Índices de Exclusão e Contemplação.</span>
            </div>
        </CardContent>
    </Card>
);

export const EvolutionDashboard = () => {
    const { user } = useAuth(); // Import useAuth hook
    const [isLoading, setIsLoading] = useState(true);
    const [period, setPeriod] = useState<'monthly' | 'quarterly'>('monthly');
    const [marketShareData, setMarketShareData] = useState<MarketShareIndicators[]>([]);
    const [growthData, setGrowthData] = useState<GrowthIndicators[]>([]);
    const [qualityData, setQualityData] = useState<PortfolioQualityIndicators[]>([]);

    useEffect(() => {
        const loadData = async () => {
            // Wait for user to be available
            if (!user) {
                // If checking auth or not logged in, we might want to wait or handle it.
                // Assuming parent handles redirection if not logged in.
                setIsLoading(false);
                return;
            }

            try {
                setIsLoading(true);
                // Load foundational data with administratorId
                const [msData, grData, qData] = await Promise.all([
                    IndicatorsService.getMarketShare(user.uid),
                    IndicatorsService.getGrowth(user.uid),
                    IndicatorsService.getPortfolioQuality(user.uid)
                ]);

                setMarketShareData(msData || []);
                setGrowthData(grData || []);
                setQualityData(qData || []);

            } catch (error) {
                console.error("Failed to load dashboard data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        if (user) {
            loadData();
        }
    }, [user]);

    if (isLoading) {
        return (
            <div className="flex h-96 items-center justify-center flex-col gap-4 text-slate-400">
                <Loader2 className="animate-spin text-indigo-600" size={48} />
                <p>Carregando Dashboard Evolutivo...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-900 to-indigo-600 bg-clip-text text-transparent">
                        Painel Evolutivo
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Análise consolidada de indicadores de mercado e performance.
                    </p>
                </div>

                <Tabs defaultValue="monthly" className="w-[400px]" onValueChange={(v) => setPeriod(v as 'monthly' | 'quarterly')}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="monthly">Visão Mensal</TabsTrigger>
                        <TabsTrigger value="quarterly">Visão Trimestral</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <TabsContent value="monthly" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <MarketShareSection data={marketShareData} />
                    <GrowthSection data={growthData} />
                </div>
                <div className="grid grid-cols-1 gap-6">
                    <QualitySection data={qualityData} />
                </div>
            </TabsContent>

            <TabsContent value="quarterly" className="mt-6">
                <Card>
                    <CardContent className="py-10 text-center text-slate-500">
                        Visão Trimestral em desenvolvimento (Dados UF).
                    </CardContent>
                </Card>
            </TabsContent>
        </div>
    );
};
