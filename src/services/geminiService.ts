
import { GoogleGenAI } from "@google/genai";
import { BacenSegment } from "../types";

export interface AIAnalysisResult {
  summary: string;
  points: {
    title: string;
    content: string;
    type: 'positive' | 'negative' | 'neutral' | 'info';
  }[];
  recommendation: string;
  sources?: { uri: string; title: string }[];
}

export const generateMarketInsight = async (
  context: string,
  data: any
): Promise<AIAnalysisResult> => {
  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    const prompt = `
      Você é um especialista em análise regulatória e mercadológica do Consórcio.
      Analise os dados fornecidos.
      
      Contexto: ${context}
      Dados (JSON): ${JSON.stringify(data)}

      Retorne APENAS um JSON válido seguindo estritamente este formato:
      {
        "summary": "Manchete executiva de uma frase sobre a situação geral.",
        "points": [
          {
            "title": "Título curto do ponto",
            "content": "Explicação detalhada...",
            "type": "positive" | "negative" | "neutral" | "info"
          }
        ],
        "recommendation": "Uma ação estratégica recomendada."
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text;
    if (!text) throw new Error("Resposta vazia da IA");

    const parsed = JSON.parse(text) as AIAnalysisResult;

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.filter(chunk => chunk.web)
      ?.map(chunk => ({
        uri: chunk.web?.uri || '',
        title: chunk.web?.title || 'Fonte externa'
      })) || [];

    return {
      ...parsed,
      sources: sources.length > 0 ? sources : undefined
    };

  } catch (error) {
    console.error("Erro ao gerar insights:", error);
    return {
      summary: "Não foi possível gerar a análise.",
      points: [
        { title: "Erro Técnico", content: "Ocorreu uma falha na comunicação com a IA.", type: "negative" }
      ],
      recommendation: "Tente novamente em instantes."
    };
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