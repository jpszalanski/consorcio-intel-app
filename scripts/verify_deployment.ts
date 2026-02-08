
import fetch from 'node-fetch';

const PROJECT_ID = 'consorcio-intel-app';
const REGION = 'us-central1';
const BASE_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

const functionsToTest = [
    'getMarketShareIndicators',
    'getGrowthIndicators',
    'getPortfolioQuality',
    'getDefaultIndicators',
    'getContemplationIndicators',
    'getGeographicIndicators',
    'getFinancialOperationalIndicators',
    'getBenchmarkingRanking',
    'getRegionalData',
    'getTrendData',
    'getDashboardData'
];

async function verifyFunctions() {
    console.log(`Verifying functions for project: ${PROJECT_ID} in ${REGION}...\n`);

    for (const funcName of functionsToTest) {
        const url = `${BASE_URL}/${funcName}`;
        try {
            // onCall functions expect a JSON body with a 'data' key
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    data: {
                        administratorId: 'test-verification-id',
                        segmentId: 1
                    }
                })
            });

            if (response.ok) {
                const json = await response.json();
                console.log(`✅ ${funcName}: OK (Status ${response.status})`);
                // console.log('   Response:', JSON.stringify(json).substring(0, 100) + '...');
            } else {
                console.error(`❌ ${funcName}: FAILED (Status ${response.status})`);
                const text = await response.text();
                // console.error('   Error:', text.substring(0, 200));

                // If 403/401 it means it exists but requires auth (which is good, it means not 404)
                if (response.status === 401 || response.status === 403) {
                    console.log(`   (Note: Auth error is expected/acceptable, confirms function exists)`);
                }
            }
        } catch (error) {
            console.error(`❌ ${funcName}: NETWORK ERROR`, error);
        }
    }
}

verifyFunctions();
