
export interface MarketShareIndicators {
    data_base: string;
    codigo_segmento: number;
    share_active_quotas: number;
    share_active_groups: number;
    share_sales: number;
    share_within_admin: number;
}

export interface GrowthIndicators {
    data_base: string;
    sales_count: number;
    prev_month_sales: number | null;
    monthly_growth: number | null;
    avg_ticket: number | null;
    constitution_rate: number | null;
    termination_rate: number | null;
    net_group_growth: number | null;
}

export interface PortfolioQualityIndicators {
    data_base: string;
    codigo_segmento: number;
    exclusion_index: number | null;
    monthly_exclusion_rate: number | null;
    contemplation_rate_accumulated: number | null;
    non_contemplation_rate: number | null;
    quittance_rate: number | null;
    pending_credit_rate: number | null;
    ownership_substitution_rate: number | null;
}

export interface DefaultIndicators {
    data_base: string;
    codigo_segmento: number;
    total_default_rate: number | null;
    contemplated_default_rate: number | null;
    non_contemplated_default_rate: number | null;
    adherence_rate: number | null;
    delay_rate: number | null;
}

export interface ContemplationIndicators {
    monthly: {
        data_base: string;
        codigo_segmento: number;
        monthly_contemplation_rate: number | null;
    }[];
    quarterly: {
        data_base: string;
        bid_contemplation_pct: number | null;
        lottery_contemplation_pct: number | null;
        quarterly_bid_rate: number | null;
        quarterly_lottery_rate: number | null;
        quarterly_adhesion_rate: number | null;
    }[];
}

export interface GeographicIndicators {
    data_base: string;
    uf: string;
    market_share_uf: number | null;
    geographic_concentration: number | null;
    exclusion_index_uf: number | null;
    exclusion_contemplated_rate: number | null;
    exclusion_non_contemplated_rate: number | null;
}

export interface FinancialOperationalIndicators {
    data_base: string;
    weighted_admin_fee: number | null;
    fee_spread: number | null;
    avg_credit_value: number | null;
    credit_evolution: number | null;
    avg_term: number | null;
    avg_group_size: number | null;
    avg_group_life: number | null;
    meeting_frequency_proxy: number | null;
    sales_per_group: number | null;
    contemplations_per_group: number | null;
}

export interface BenchmarkingRanking {
    data_base: string;
    cnpj_raiz: string;
    active_quotas: number;
    sales_count: number;
    avg_fee: number | null;
    ie_index: number | null;
    default_rate: number | null;
    rank_active_quotas: number;
    rank_sales: number;
    rank_fee: number;
    rank_ie: number;
    rank_default: number;
    gap_share: number | null;
    gap_efficiency: number | null;
    gap_price: number | null;
}
