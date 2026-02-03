
import { GoogleGenAI } from "@google/genai";
import { BacenSegment } from "../types";

export interface MarketInsightResult {
  text: string;
  sources?: { uri: string; title: string }[];
}

export const generateMarketInsight = async (
  context: string,
  data: any
): Promise<MarketInsightResult> => {
  try {
    // Inicialização do cliente Gemini seguindo as diretrizes oficiais de segurança e SDK
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    const prompt = `
      Você é um especialista em análise regulatória e mercadológica do Banco Central do Brasil (BACEN) para o setor de consórcios.
      Analise os dados fornecidos considerando as Circulares (ex: Circular 3.679/14) e os documentos padrões (2080, 4010).

      Contexto: ${context}
      Dados do App (JSON): ${JSON.stringify(data)}

      Foque sua análise em:
      1. Variação de adesões vs. desistências (Churn da carteira).
      2. Correlação com Selic e inflação (IPCA) para os Segmentos 1 a 6.
      3. Oportunidades regionais baseadas nos "Dados por UF".

      Use o Google Search para validar o cenário macroeconômico atual.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.filter(chunk => chunk.web)
      ?.map(chunk => ({
        uri: chunk.web?.uri || '',
        title: chunk.web?.title || 'Fonte externa'
      })) || [];

    return {
      text: response.text || "Não foi possível gerar insights no momento.",
      sources: sources.length > 0 ? sources : undefined
    };
  } catch (error) {
    console.error("Erro ao gerar insights:", error);
    return { text: "Ocorreu um erro ao processar a análise inteligente." };
  }
};

export const predictDemand = async (
  segment: BacenSegment,
  historicalData: any[]
): Promise<{ prediction: string; rationale: string }> => {
  try {
    // Inicialização do cliente Gemini seguindo as diretrizes oficiais de segurança e SDK
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    const prompt = `
      Analise a série histórica do segmento oficial BACEN: ${segment}.
      Projete a demanda para os próximos 12 meses.
      
      Considere:
      - Sazonalidade típica deste segmento.
      - Impacto da política monetária atual no crédito vs. consórcio.
      - Dados Históricos: ${JSON.stringify(historicalData.slice(-8))}
      
      Retorne estritamente um JSON no formato:
      {
        "prediction": "Frase curta da tendência (ex: Crescimento Moderado em Veículos Pesados)",
        "rationale": "Explicação técnica baseada em fundamentos econômicos."
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("Resposta vazia");

    return JSON.parse(text);
  } catch (error) {
    console.error("Erro na predição:", error);
    return {
      prediction: "Tendência de Estabilidade",
      rationale: "Não foi possível realizar a predição avançada por limitações técnicas temporárias."
    };
  }
};