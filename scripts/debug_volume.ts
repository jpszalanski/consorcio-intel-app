import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({ projectId: 'consorcio-intel-app' });

async function debugDashboard() {
    console.log('=== DEBUGGING DASHBOARD DATA ===\n');

    // 1. Check if series_consolidadas has data
    console.log('1. Checking series_consolidadas table...');
    const [tableInfo] = await bigquery.query({
        query: `SELECT COUNT(*) as total FROM \`consorcio-intel-app.consorcio_data.series_consolidadas\``,
        location: 'US'
    });
    console.log(`   Total rows: ${tableInfo[0].total}`);

    // 2. Sample raw metricas_raw to see actual field names and formats
    console.log('\n2. Sampling metricas_raw JSON keys...');
    const [sampleRows] = await bigquery.query({
        query: `
            SELECT metricas_raw 
            FROM \`consorcio-intel-app.consorcio_data.series_consolidadas\` 
            LIMIT 1
        `,
        location: 'US'
    });
    if (sampleRows.length > 0) {
        const raw = sampleRows[0].metricas_raw;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        console.log('   Keys found:', Object.keys(parsed));
        console.log('   Sample values:');
        console.log(`     Quantidade_de_cotas_ativas_em_dia: "${parsed['Quantidade_de_cotas_ativas_em_dia']}"`);
        console.log(`     Quantidade_de_cotas_ativas_contempladas_inadimplentes: "${parsed['Quantidade_de_cotas_ativas_contempladas_inadimplentes']}"`);
        console.log(`     Quantidade_de_cotas_ativas_não_contempladas_inadimplentes: "${parsed['Quantidade_de_cotas_ativas_não_contempladas_inadimplentes']}"`);
        console.log(`     Valor_médio_do_bem: "${parsed['Valor_médio_do_bem']}"`);
        console.log(`     Taxa_de_administração: "${parsed['Taxa_de_administração']}"`);
    }

    // 3. Test the exact volume calculation
    console.log('\n3. Testing volume calculation...');
    const [volumeTest] = await bigquery.query({
        query: `
            SELECT 
                SUM(
                    (
                        SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) +
                        IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) +
                        IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                    )
                ) as total_quotas,
                
                SUM(
                    SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64)
                ) as sum_valor_bem,
                
                SUM(
                    (
                        SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64) +
                        IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_contempladas_inadimplentes') AS INT64), 0) +
                        IFNULL(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_não_contempladas_inadimplentes') AS INT64), 0)
                    ) * SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64)
                ) as total_volume
            FROM \`consorcio-intel-app.consorcio_data.series_consolidadas\`
        `,
        location: 'US'
    });
    console.log(`   Total Quotas: ${volumeTest[0].total_quotas}`);
    console.log(`   Sum Valor Bem: ${volumeTest[0].sum_valor_bem}`);
    console.log(`   Total Volume: ${volumeTest[0].total_volume}`);

    // 4. Check if Valor_médio_do_bem is NULL or has wrong format
    console.log('\n4. Checking Valor_médio_do_bem format...');
    const [formatCheck] = await bigquery.query({
        query: `
            SELECT 
                JSON_VALUE(metricas_raw, '$.Valor_médio_do_bem') as raw_value,
                SAFE_CAST(REPLACE(REPLACE(JSON_VALUE(metricas_raw, '$.Valor_médio_do_bem'), '.', ''), ',', '.') AS FLOAT64) as parsed_value
            FROM \`consorcio-intel-app.consorcio_data.series_consolidadas\`
            LIMIT 5
        `,
        location: 'US'
    });
    formatCheck.forEach((row: any, i: number) => {
        console.log(`   Row ${i + 1}: raw="${row.raw_value}" => parsed=${row.parsed_value}`);
    });

    console.log('\n=== DEBUGGING COMPLETE ===');
}

debugDashboard().catch(console.error);
