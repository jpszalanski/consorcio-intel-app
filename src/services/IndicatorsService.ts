
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import {
    MarketShareIndicators,
    GrowthIndicators,
    PortfolioQualityIndicators,
    DefaultIndicators,
    ContemplationIndicators,
    GeographicIndicators,
    FinancialOperationalIndicators,
    BenchmarkingRanking
} from '../types/evolution';

const getMarketShareIndicators = httpsCallable<{ administratorId?: string; segmentId?: number }, MarketShareIndicators[]>(functions, 'getMarketShareIndicators');
const getGrowthIndicators = httpsCallable<{ administratorId?: string }, GrowthIndicators[]>(functions, 'getGrowthIndicators');
const getPortfolioQuality = httpsCallable<{ administratorId?: string; segmentId?: number }, PortfolioQualityIndicators[]>(functions, 'getPortfolioQuality');
const getDefaultIndicators = httpsCallable<{ administratorId?: string; segmentId?: number }, DefaultIndicators[]>(functions, 'getDefaultIndicators');
const getContemplationIndicators = httpsCallable<{ administratorId?: string; segmentId?: number }, ContemplationIndicators>(functions, 'getContemplationIndicators');
const getGeographicIndicators = httpsCallable<{ administratorId?: string; segmentId?: number }, GeographicIndicators[]>(functions, 'getGeographicIndicators');
const getFinancialOperationalIndicators = httpsCallable<{ administratorId?: string; segmentId?: number }, FinancialOperationalIndicators[]>(functions, 'getFinancialOperationalIndicators');
const getBenchmarkingRanking = httpsCallable<{ administratorId?: string; segmentId?: number }, BenchmarkingRanking[]>(functions, 'getBenchmarkingRanking');

export const IndicatorsService = {
    getMarketShare: async (administratorId?: string, segmentId?: number) => {
        const result = await getMarketShareIndicators({ administratorId, segmentId });
        return result.data;
    },
    getGrowth: async (administratorId?: string) => {
        const result = await getGrowthIndicators({ administratorId });
        return result.data;
    },
    getPortfolioQuality: async (administratorId?: string, segmentId?: number) => {
        const result = await getPortfolioQuality({ administratorId, segmentId });
        return result.data;
    },
    getDefault: async (administratorId?: string, segmentId?: number) => {
        const result = await getDefaultIndicators({ administratorId, segmentId });
        return result.data;
    },
    getContemplation: async (administratorId?: string, segmentId?: number) => {
        const result = await getContemplationIndicators({ administratorId, segmentId });
        return result.data;
    },
    getGeographic: async (administratorId?: string, segmentId?: number) => {
        const result = await getGeographicIndicators({ administratorId, segmentId });
        return result.data;
    },
    getFinancialOperational: async (administratorId?: string, segmentId?: number) => {
        const result = await getFinancialOperationalIndicators({ administratorId, segmentId });
        return result.data;
    },
    getBenchmarking: async (administratorId?: string, segmentId?: number) => {
        const result = await getBenchmarkingRanking({ administratorId, segmentId });
        return result.data;
    }
};
