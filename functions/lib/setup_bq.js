"use strict";
// ============================================================================
// FUNCTION: setupBigQuerySchema (Admin Utility)
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupBigQuerySchema = void 0;
exports.setupBigQuerySchema = functions.https.onCall(async (data, context) => {
    try {
        const datasetId = 'consorcio_data';
        const tables = [
            {
                tableId: 'segmentos_consolidados',
                schema: [
                    { name: 'data_base', type: 'STRING', mode: 'REQUIRED' },
                    { name: 'cnpj_raiz', type: 'STRING', mode: 'REQUIRED' },
                    { name: 'codigo_segmento', type: 'INTEGER', mode: 'REQUIRED' },
                    { name: 'metricas_raw', type: 'JSON', mode: 'NULLABLE' }
                ]
            },
            {
                tableId: 'bens_imoveis_grupos',
                schema: [
                    { name: 'data_base', type: 'STRING', mode: 'REQUIRED' },
                    { name: 'cnpj_raiz', type: 'STRING', mode: 'REQUIRED' },
                    { name: 'codigo_grupo', type: 'STRING', mode: 'NULLABLE' },
                    { name: 'metricas_raw', type: 'JSON', mode: 'NULLABLE' }
                ]
            },
            {
                tableId: 'bens_moveis_grupos',
                schema: [
                    { name: 'data_base', type: 'STRING', mode: 'REQUIRED' },
                    { name: 'cnpj_raiz', type: 'STRING', mode: 'REQUIRED' },
                    { name: 'codigo_grupo', type: 'STRING', mode: 'NULLABLE' },
                    { name: 'metricas_raw', type: 'JSON', mode: 'NULLABLE' }
                ]
            },
            {
                tableId: 'dados_trimestrais_uf',
                schema: [
                    { name: 'data_base', type: 'STRING', mode: 'REQUIRED' },
                    { name: 'cnpj_raiz', type: 'STRING', mode: 'REQUIRED' },
                    { name: 'codigo_segmento', type: 'INTEGER', mode: 'REQUIRED' },
                    { name: 'uf', type: 'STRING', mode: 'REQUIRED' },
                    { name: 'metricas_raw', type: 'JSON', mode: 'NULLABLE' }
                ]
            }
        ];
        // Ensure dataset exists
        const [datasetExists] = await bigquery.dataset(datasetId).exists();
        if (!datasetExists) {
            console.log(`Creating dataset ${datasetId}...`);
            await bigquery.createDataset(datasetId, { location: BQ_LOCATION });
        }
        const results = [];
        for (const t of tables) {
            const table = bigquery.dataset(datasetId).table(t.tableId);
            const [exists] = await table.exists();
            if (!exists) {
                console.log(`Creating table ${t.tableId}...`);
                await table.create({ schema: t.schema });
                results.push(`Created ${t.tableId}`);
            }
            else {
                results.push(`Skipped ${t.tableId} (already exists)`);
            }
        }
        return { success: true, results };
    }
    catch (error) {
        console.error('setupBigQuerySchema Error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=setup_bq.js.map