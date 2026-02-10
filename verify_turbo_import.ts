import { mapConsolidatedSeries, mapDetailedGroup, mapQuarterlyData } from './src/services/dataMapper';

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
