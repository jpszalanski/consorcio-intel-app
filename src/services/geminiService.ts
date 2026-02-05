
import { GoogleGenAI } from "@google/genai";
import { BacenSegment } from "../types";
import { getFirestore, doc, getDoc } from "firebase/firestore";

// Default Prompts (Fallbacks & Seeding)
export const initialPrompts = {
  market_insight: `

      Retorne APENAS um JSON válido seguindo estritamente este formato para renderização:
      {
        "summary": "Manchete executiva de uma frase sobre a situação geral.",
        "points": [
          {
            "title": "Título curto do ponto (ex: Análise de Churn)",
            "content": "Explicação detalhada focada nos itens obrigatórios acima...",
            "type": "positive" | "negative" | "neutral" | "info"
          }
        ],
        "recommendation": "Uma ação estratégica recomendada baseada na análise."
      }
  `,
  demand_prediction: `
      Analise a série histórica do segmento oficial BACEN: {{segment}}.
      Projete a demanda para os próximos 12 meses.
      
      Considere:
      - Sazonalidade típica deste segmento.
      - Impacto da política monetária atual no crédito vs. consórcio.
      - Dados Históricos: {{historicalData}}
      
      Retorne estritamente um JSON no formato:
      {
        "prediction": "Frase curta da tendência (ex: Crescimento Moderado em Veículos Pesados)",
        "rationale": "Explicação técnica baseada em fundamentos econômicos."
      }
  `
};

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

// Helper: Fetch Prompt from Firestore or use Default
const getPromptTemplate = async (templateId: keyof typeof initialPrompts, variables: Record<string, any>) => {
  try {
    const db = getFirestore();
    const docRef = doc(db, 'prompt_templates', templateId);
    const docSnap = await getDoc(docRef);

    let template = initialPrompts[templateId];
    if (docSnap.exists() && docSnap.data().template) {
      template = docSnap.data().template;
    }

    // Replace Variables
    let populatedInfo = template;
    Object.entries(variables).forEach(([key, value]) => {
      const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      populatedInfo = populatedInfo.replace(new RegExp(`{{${key}}}`, 'g'), valStr);
    });

    return populatedInfo;
  } catch (error) {
    console.warn(`Failed to fetch prompt template ${templateId}, using fallback.`, error);
    // Fallback logic duplicated for safety
    let populatedInfo = initialPrompts[templateId];
    Object.entries(variables).forEach(([key, value]) => {
      const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      populatedInfo = populatedInfo.replace(new RegExp(`{{${key}}}`, 'g'), valStr);
    });
    return populatedInfo;
  }
};

export const generateMarketInsight = async (
  context: string,
  data: any
): Promise<AIAnalysisResult> => {
  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    const prompt = await getPromptTemplate('market_insight', {
      context,
      data
    });

    // CRITICAL: MODEL FIXED BY USER ORDER. DO NOT CHANGE WITHOUT EXPLICIT PERMISSION.
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
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    const prompt = await getPromptTemplate('demand_prediction', {
      segment,
      historicalData: JSON.stringify(historicalData.slice(-8))
    });

    // CRITICAL: MODEL FIXED BY USER ORDER. DO NOT CHANGE WITHOUT EXPLICIT PERMISSION.
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