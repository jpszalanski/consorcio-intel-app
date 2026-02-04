
// Verification Script
const parseFileName = (fileName: string) => {
    const name = fileName;

    const segmentsRegex = /^(\d{4})(\d{2})Segmentos_Consolidados/i;
    const realEstateRegex = /^(\d{4})(\d{2})Bens_Imoveis_Grupos/i;
    const moveisRegex = /^(\d{4})(\d{2})Bens_Moveis_Grupos/i;
    // Updated UF regex based on user input: 202509Consorcios_UF.csv
    const ufRegex = /^(\d{4})(\d{2})Consorcios_UF/i;

    let fileType = 'UNKNOWN';
    let referenceDate = null;
    let match = null;

    if ((match = name.match(segmentsRegex))) {
        fileType = 'segments';
    } else if ((match = name.match(realEstateRegex))) {
        fileType = 'real_estate';
    } else if ((match = name.match(moveisRegex))) {
        fileType = 'moveis';
    } else if ((match = name.match(ufRegex))) {
        fileType = 'regional_uf';
    }

    if (match) {
        referenceDate = `${match[1]}-${match[2]}`;
    }

    return { fileType, referenceDate };
};

const detectHeavyFile = (fileName: string): boolean => {
    return /Bens_Moveis_Grupos/i.test(fileName);
};

const runTests = () => {
    console.log("--- Testing Strict Import Logic ---");

    const tests = [
        { name: '202401Segmentos_Consolidados.csv', type: 'segments', heavy: false },
        { name: '202401Bens_Imoveis_Grupos.csv', type: 'real_estate', heavy: false },
        { name: '202401Bens_Moveis_Grupos.csv', type: 'moveis', heavy: true },
        { name: '202509Consorcios_UF.csv', type: 'regional_uf', heavy: false },
        { name: 'random_file.csv', type: 'UNKNOWN', heavy: false },
        { name: '202509Consorcios_UF_Extra.csv', type: 'regional_uf', heavy: false }, // Should assume prefix match is enough or strict full match? Code uses startsWith regex logic (^), so suffixes are allowed.
        { name: 'dados_uf.csv', type: 'UNKNOWN', heavy: false }, // Old format should fail
    ];

    tests.forEach(t => {
        const res = parseFileName(t.name);
        const heavy = detectHeavyFile(t.name);

        const typePass = res.fileType === t.type;
        const heavyPass = heavy === t.heavy;

        console.log(`File: ${t.name}`);
        console.log(`  Type: ${res.fileType} [${typePass ? 'PASS' : 'FAIL'}]`);
        console.log(`  Heavy: ${heavy} [${heavyPass ? 'PASS' : 'FAIL'}]`);
    });
};

runTests();
