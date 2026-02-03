// MOCKING TIMESTAMP
// import { Timestamp } from 'firebase/firestore'; 
// Actually, let's MOCK Timestamp or remove it if not used in logic critically.
// mapConsolidatedSeries uses Timestamp.now() in _fonte. We can mock it.

// --- MOCKS ---
const Timestamp = { now: () => ({ seconds: 123, nanoseconds: 0 }) };

// --- HELPERS (From dataStore.ts) ---
const normalizeKey = (str: string) => {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
};

const findValue = (row: any, candidates: (string | string[])[]): any => {
    const keys = Object.keys(row);
    const normalizedKeys = keys.map(k => ({ key: k, norm: normalizeKey(k) }));

    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            const target = normalizeKey(candidate);
            const match = normalizedKeys.find(nk => nk.norm === target);
            if (match) return row[match.key];
        } else if (Array.isArray(candidate)) {
            const targetParts = candidate.map(normalizeKey);
            const match = normalizedKeys.find(nk => targetParts.every(part => nk.norm.includes(part)));
            if (match) return row[match.key];
        }
    }
    return undefined;
};

const parseBrazilNum = (val: any): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return val;
    const str = String(val).trim();
    if (str === '' || str === '-') return 0;
    const cleanStr = str.replace(/[R$\s]/g, '');
    if (cleanStr.includes(',')) {
        return Number(cleanStr.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return Number(cleanStr.replace(/\./g, '')) || 0;
};

// --- MAPPERS (From dataStore.ts) ---

const mapConsolidatedSeries = (row: any) => {
    const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    if (!cnpj) return null;

    const segCode = parseInt(String(findValue(row, ['Código_do_segmento', 'Codigo']) || '0').replace(/\D/g, ''));
    const database = String(findValue(row, ['Data_base']) || '');

    // Raw Metrics
    const emDia = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_em_dia']));
    const contInad = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_inadimplentes']));
    const naoContInad = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_não_contempladas_inadimplentes']));
    const contempladasAcum = parseBrazilNum(findValue(row, ['Quantidade_acumulada_de_cotas_ativas_contempladas']));
    const naoContempladas = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_não_contempladas']));
    const contempladasMes = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_no_mês']));
    const excluidas = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_excluídas']));
    const quitadas = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_quitadas']));
    const creditoPendente = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_com_crédito_pendente_de_utilização']));
    const excluidasComercializar = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_excluídas_a_comercializar']));

    // Calculations (Section 2)
    const cotasAtivasTotal = emDia + contInad + naoContInad;
    const taxaInadTotal = cotasAtivasTotal > 0 ? (contInad + naoContInad) / cotasAtivasTotal : 0;
    const taxaContemplacaoMensal = cotasAtivasTotal > 0 ? contempladasMes / cotasAtivasTotal : 0;
    const taxaExclusao = (cotasAtivasTotal + excluidas) > 0 ? excluidas / (cotasAtivasTotal + excluidas) : 0;
    const taxaQuitacao = cotasAtivasTotal > 0 ? quitadas / cotasAtivasTotal : 0;
    const taxaCreditoPendente = contempladasAcum > 0 ? creditoPendente / contempladasAcum : 0;
    const taxaSubstituicao = excluidas > 0 ? excluidasComercializar / excluidas : 0;

    return {
        id: `${cnpj}_${segCode}_${database}`,
        cnpj_raiz: cnpj,
        codigo_segmento: segCode,
        data_base: database,
        tipo_segmento: segCode === 1 ? 'imoveis' : 'moveis',
        indicadores_calculados: {
            cotas_ativas_total: cotasAtivasTotal,
            taxa_inadimplencia_total: taxaInadTotal,
            taxa_contemplacao_mensal: taxaContemplacaoMensal,
            taxa_exclusao: taxaExclusao,
            taxa_quitacao: taxaQuitacao,
            taxa_credito_pendente: taxaCreditoPendente,
            taxa_substituicao_titularidade: taxaSubstituicao
        }
    };
};

const mapDetailedGroup = (row: any, type: 'imoveis' | 'moveis') => {
    const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    const grupo = String(findValue(row, ['Código_do_grupo', 'Codigo']) || '');
    const database = String(findValue(row, ['Data_base']) || '');
    if (!cnpj || !grupo) return null;

    // Segment Handling (1.3 Rule)
    let segCode = 1;
    if (type === 'imoveis') {
        segCode = 1;
    } else {
        // 32 -> 3
        const rawSeg = String(findValue(row, ['Código_do_segmento', 'Codigo']) || '0').replace(/\D/g, '');
        segCode = parseInt(rawSeg.substring(0, 1)); // Take first digit or logic from 1.3
        if (rawSeg.length === 2 && parseInt(rawSeg) > 10) segCode = Math.floor(parseInt(rawSeg) / 10);
    }

    // ID Generation (3.1)
    const id = type === 'imoveis'
        ? `${cnpj}_${grupo}_${database}`
        : `${cnpj}_${grupo}_${segCode}_${database}`;

    // Metrics
    const emDia = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_em_dia']));
    const contInad = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_inadimplentes']));
    const naoContInad = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_não_contempladas_inadimplentes']));

    return {
        id,
        cnpj_raiz: cnpj,
        codigo_grupo: grupo,
        data_base: database,
        codigo_segmento: segCode,
        metricas_cotas: {
            ativas_em_dia: emDia,
            contempladas_inadimplentes: contInad,
            nao_contempladas_inadimplentes: naoContInad
        }
    };
};

const mapQuarterlyData = (row: any) => {
    const cnpj = String(findValue(row, ['CNPJ_da_Administradora']) || '').replace(/\D/g, '');
    const uf = String(findValue(row, ['Unidade_da_Federação_do_consorciado', 'UF']) || '').toUpperCase();
    const database = String(findValue(row, ['Data_base']) || '');
    const segCode = parseInt(String(findValue(row, ['Código_do_segmento', 'Codigo']) || '0'));

    if (!cnpj || !uf) return null;

    return {
        id: `${cnpj}_${uf}_${segCode}_${database}`,
        cnpj_raiz: cnpj,
        uf,
        codigo_segmento: segCode,
        data_base: database
    };
};

// --- RUN CHECK ---

const generateSegmentRow = (i: number) => ({
    'CNPJ_da_Administradora': '12345678',
    'Nome_da_Administradora': `Admin Test ${i}`,
    'Código_do_segmento': '1',
    'Data_base': '2024-01',
    'Quantidade_de_cotas_ativas_em_dia': String(100 + i),
    'Quantidade_de_cotas_ativas_contempladas_inadimplentes': '10',
    'Quantidade_de_cotas_ativas_não_contempladas_inadimplentes': '5',
    'Quantidade_de_cotas_excluídas': '1',
    'Quantidade_de_cotas_ativas_quitadas': '20'
});

const generateGroupRow = (i: number, type: 'imoveis' | 'moveis') => ({
    'CNPJ_da_Administradora': '12345678',
    'Código_do_grupo': `GR${i}`,
    'Data_base': '2024-01',
    'Código_do_segmento': type === 'moveis' ? '31' : '1',
    'Valor_médio_do_bem': '100.000,00',
    'Quantidade_de_cotas_ativas_em_dia': String(10 + i),
    'Quantidade_de_cotas_ativas_contempladas_inadimplentes': '0',
    'Quantidade_de_cotas_ativas_não_contempladas_inadimplentes': '0'
});

const generateUFRow = (i: number) => ({
    'CNPJ_da_Administradora': '12345678',
    'Unidade_da_Federação_do_consorciado': i % 2 === 0 ? 'SP' : 'RJ',
    'Data_base': '2024-03',
    'Código_do_segmento': '1'
});

async function runTests() {
    console.log("=== INITIATING UPLOAD VERIFICATION (10 RECORDS EACH) ===");

    try {
        console.log("\nTesting [Segments]...");
        for (let i = 0; i < 10; i++) {
            const row = generateSegmentRow(i);
            const res = mapConsolidatedSeries(row);
            if (!res) throw new Error(`Segment Map returned null`);
            const expected = 100 + i + 10 + 5;
            if (res.indicadores_calculados.cotas_ativas_total !== expected) throw new Error(`Segment Logic Error`);
            process.stdout.write(".");
        }
        console.log(" ✅ PASS");

        console.log("\nTesting [Groups - Imoveis]...");
        for (let i = 0; i < 10; i++) {
            const row = generateGroupRow(i, 'imoveis');
            const res = mapDetailedGroup(row, 'imoveis');
            if (!res) throw new Error(`Group Map returned null`);
            if (res.codigo_segmento !== 1) throw new Error(`Group Segment Error`);
            process.stdout.write(".");
        }
        console.log(" ✅ PASS");

        console.log("\nTesting [Groups - Moveis 31->3]...");
        for (let i = 0; i < 10; i++) {
            const row = generateGroupRow(i, 'moveis');
            const res = mapDetailedGroup(row, 'moveis');
            if (!res) throw new Error(`Group Map returned null`);
            if (res.codigo_segmento !== 3) throw new Error(`Group Moveis Logic Error`);
            process.stdout.write(".");
        }
        console.log(" ✅ PASS");

        console.log("\nTesting [UF]...");
        for (let i = 0; i < 10; i++) {
            const row = generateUFRow(i);
            const res = mapQuarterlyData(row);
            if (!res) throw new Error(`UF Map returned null`);
            if (res.uf !== (i % 2 === 0 ? 'SP' : 'RJ')) throw new Error("UF Logic Error");
            process.stdout.write(".");
        }
        console.log(" ✅ PASS");

        console.log("\n\n🎉 ALL 10-RECORD TESTS PASSED successfully.");

    } catch (err) {
        console.error("\n❌ FAILED:", err);
        process.exit(1);
    }
}

runTests();
