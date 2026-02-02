// Mock Enums
const BacenSegment = {
    IMOVEIS: 1,
    VEICULOS_LEVES: 3
};

// --- HELPERS ---
const normalizeKey = (str: string) => {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
};

const findValue = (row: any, candidates: (string | string[])[]): any => {
    const keys = Object.keys(row);
    const normalizedKeys = keys.map(k => ({ key: k, norm: normalizeKey(k) }));
    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            const match = normalizedKeys.find(nk => nk.norm === normalizeKey(candidate));
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
    const cleanStr = String(val).trim().replace(/[R$\s]/g, '');
    if (cleanStr.includes(',')) {
        return Number(cleanStr.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return Number(cleanStr.replace(/\./g, '')) || 0;
};

// --- STRICT LOGIC TO TEST (Mirrors dataStore.ts Phase 2) ---

// 1.1 Consolidated Series
const mapConsolidatedSeries = (row: any) => {
    const adminName = findValue(row, ['Nome_da_Administradora']);
    if (!adminName) return null;

    // Strict Rule: No Balance/Volume calculation here.
    return {
        adminName: String(adminName).trim(),
        volume: 0, // Should always be 0
        cotasAtivasTotal: parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_em_dia'])) +
            parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_inadimplentes'])) +
            parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_não_contempladas_inadimplentes']))
    };
};

// 1.2 Detailed Group
const mapDetailedGroup = (row: any) => {
    const valorMedio = parseBrazilNum(findValue(row, ['Valor_médio_do_bem', 'Valor do Bem']));

    const emDia = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_em_dia']));
    const contInad = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_contempladas_inadimplentes']));
    const naoContInad = parseBrazilNum(findValue(row, ['Quantidade_de_cotas_ativas_não_contempladas_inadimplentes']));

    const totalActive = emDia + contInad + naoContInad;
    let balance = totalActive * valorMedio;

    // Fallback logic
    if (balance === 0) {
        balance = parseBrazilNum(findValue(row, ['Saldo_Devedor', 'Saldo']));
    }

    return {
        valorMedio,
        totalActive,
        balance
    };
};

// --- EXECUTE TESTS ---
const runTest = () => {
    console.log("=== STRICT DATA STRATEGY VERIFICATION ===");

    // 1. Detailed Group -> Should Calculate Balance Correctly
    const groupRow = {
        'Valor_médio_do_bem': '200.000,00',
        'Quantidade_de_cotas_ativas_em_dia': '4',
        'Quantidade_de_cotas_ativas_contempladas_inadimplentes': '1',
        'Quantidade_de_cotas_ativas_não_contempladas_inadimplentes': '0'
    };
    // Active = 4 + 1 + 0 = 5. Balance = 5 * 200k = 1M
    const groupRes = mapDetailedGroup(groupRow);
    const pass1 = groupRes?.balance === 1000000;
    console.log(`1. Group Balance Calculation: ${pass1 ? '✅ PASS' : '❌ FAIL'} (Expected 1M, Got ${groupRes?.balance})`);

    // 2. Consolidated Series -> Should have 0 Volume
    const segRow = {
        'Nome_da_Administradora': 'Seg Bank',
        'Quantidade_de_cotas_ativas_em_dia': '50',
        'Saldo_Devedor': '5.000.000,00' // Trap! Should be ignored
    };
    const segRes = mapConsolidatedSeries(segRow);
    const pass2 = segRes?.volume === 0;
    console.log(`2. Segment Strict Volume:     ${pass2 ? '✅ PASS' : '❌ FAIL'} (Expected 0, Got ${segRes?.volume})`);

    // 3. Consolidated Series -> Should Sum Active correctly
    const pass3 = segRes?.cotasAtivasTotal === 50;
    console.log(`3. Segment Active Sum:        ${pass3 ? '✅ PASS' : '❌ FAIL'} (Expected 50, Got ${segRes?.cotasAtivasTotal})`);
};

runTest();
