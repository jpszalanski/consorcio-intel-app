
import { BigQuery } from "@google-cloud/bigquery";
import * as path from "path";

// Initialize BigQuery
// Assumes user has local credentials or GOOGLE_APPLICATION_CREDENTIALS set.
// If this fails, we might need to ask user to authenticate via gcloud.
const bigquery = new BigQuery({ projectId: 'consorcio-intel-app' });
const DATASET_ID = 'consorcio_data';
const BQ_LOCATION = 'us-central1';

async function diagnose() {
    console.log("--- Starting Diagnosis ---");

    try {
        // 1. Check Table Existence
        const [exists] = await bigquery.dataset(DATASET_ID).table('series_consolidadas').exists();
        if (!exists) {
            console.error("❌ Table 'series_consolidadas' DOES NOT EXIST.");
            return;
        }
        console.log("✅ Table 'series_consolidadas' found.");

        // 2. Inspect Raw Data (First 5 rows)
        const queryRaw = `
            SELECT data_base, codigo_segmento, metricas_raw
            FROM \`consorcio-intel-app.consorcio_data.series_consolidadas\`
            LIMIT 5
        `;
        const [rowsRaw] = await bigquery.query({ query: queryRaw, location: BQ_LOCATION });
        console.log("\n--- Raw Data Sample (5 rows) ---");
        rowsRaw.forEach((row: any, i: number) => {
            console.log(`\nRow ${i + 1}:`);
            console.log(`  data_base: '${row.data_base}' (Type: ${typeof row.data_base})`);
            console.log(`  codigo_segmento: ${row.codigo_segmento}`);
            console.log(`  metricas_raw (substring): ${String(row.metricas_raw).substring(0, 200)}...`);

            // Try Parsing JSON
            try {
                const json = JSON.parse(row.metricas_raw);
                console.log(`  [JSON Check] Parsed OK.`);
                console.log(`  [JSON Keys Sample]: ${Object.keys(json).slice(0, 5).join(', ')}`);

                // key check
                const testKey = 'Quantidade_de_cotas_ativas_em_dia';
                console.log(`  [Value Check] '${testKey}': ${json[testKey]}`);
                // Check for underscore vs space
                const testKeySpace = 'Quantidade de cotas ativas em dia';
                console.log(`  [Value Check Space] '${testKeySpace}': ${json[testKeySpace]}`);

            } catch (e: any) {
                console.error(`  ❌ JSON Parse Error: ${e.message}`);
            }
        });

        // CHECK ADMINISTRADORAS
        console.log('\n--- Checking Administradoras Table ---');
        try {
            const queryAdmin = `
            SELECT cnpj_raiz, metricas_raw
            FROM \`consorcio-intel-app.consorcio_data.administradoras\`
            LIMIT 3
        `;
            const [rows] = await bigquery.query({ query: queryAdmin, location: 'US' });

            console.log(`Found ${rows.length} admin rows.`);
            rows.forEach((row: any, i: number) => {
                console.log(`\n[Admin Row ${i + 1}] CNPJ: ${row.cnpj_raiz}`);
                try {
                    const parsed = JSON.parse(row.metricas_raw);
                    console.log('Keys:', Object.keys(parsed));
                    console.log('Sample Values:', {
                        'Qtd Cotas Ativas': parsed['Quantidade_de_cotas_ativas_em_dia'],
                        'Valor Bem': parsed['Valor_médio_do_bem']
                    });
                } catch (e) {
                    console.log('Raw JSON (Parse Error):', row.metricas_raw);
                }
            });

        } catch (e: any) {
            console.error("Admin Query Failed:", e.message);
        }

        // 3. Test Aggregation Query (Simulating getDashboardData)
        const queryAgg = `
        SELECT
            data_base,
            COUNT(*) as count,
            SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade_de_cotas_ativas_em_dia') AS INT64)) as test_sum_active,
             SUM(SAFE_CAST(JSON_VALUE(metricas_raw, '$.Quantidade de cotas ativas em dia') AS INT64)) as test_sum_active_spaces
        FROM \`consorcio-intel-app.consorcio_data.series_consolidadas\`
        GROUP BY data_base
        ORDER BY data_base DESC
        LIMIT 5
    `;
        console.log("\n--- Testing Aggregation Query ---");
        const [rowsAgg] = await bigquery.query({ query: queryAgg, location: BQ_LOCATION });
        console.log("Aggregation Results:");
        console.table(rowsAgg);


    } catch (error: any) {
        console.error("Diagnosis Failed:", error);
    }
}

diagnose();
