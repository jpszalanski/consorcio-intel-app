
import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({ projectId: 'consorcio-intel-app', location: 'US' });
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
            { name: 'codigo_grupo', type: 'STRING', mode: 'NULLABLE' }, // Assuming groups have codes
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
    },
    {
        tableId: 'base_segmentos',
        schema: [
            { name: 'codigo_segmento', type: 'INTEGER', mode: 'REQUIRED' },
            { name: 'nome_segmento', type: 'STRING', mode: 'REQUIRED' }
        ]
    }
];

async function createTables() {
    try {
        // Ensure dataset exists
        const [datasetExists] = await bigquery.dataset(datasetId).exists();
        if (!datasetExists) {
            console.log(`Creating dataset ${datasetId}...`);
            await bigquery.createDataset(datasetId);
        }

        for (const t of tables) {
            const table = bigquery.dataset(datasetId).table(t.tableId);
            const [exists] = await table.exists();

            if (exists) {
                console.log(`Table ${t.tableId} already exists. Skipping.`);
            } else {
                console.log(`Creating table ${t.tableId}...`);
                await table.create({ schema: t.schema });
                console.log(`Table ${t.tableId} created.`);

                // Seed base_segmentos if just created
                if (t.tableId === 'base_segmentos') {
                    console.log('Seeding base_segmentos...');
                    const segmentsToSeed = [
                        { codigo_segmento: 1, nome_segmento: 'Imóveis' },
                        { codigo_segmento: 2, nome_segmento: 'Veículos Pesados' },
                        { codigo_segmento: 3, nome_segmento: 'Automóveis' },
                        { codigo_segmento: 4, nome_segmento: 'Motocicletas' },
                        { codigo_segmento: 5, nome_segmento: 'Bens Móveis Duráveis' },
                        { codigo_segmento: 6, nome_segmento: 'Serviços' }
                    ];
                    await table.insert(segmentsToSeed);
                    console.log('Seeding complete.');
                }
            }
        }
    } catch (error) {
        console.error('Error creating tables:', error);
    }
}

createTables();
