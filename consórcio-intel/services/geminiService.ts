import { GoogleGenAI } from "@google/genai";
import { SegmentType } from "../types";

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateMarketInsight = async (
  context: string,
  data: any
): Promise<string> => {
  try {
    if (!process.env.API_KEY) {
      return "Chave da API não configurada. Por favor, configure a variável de ambiente API_KEY para receber insights.";
    }

    const prompt = `
      Você é um especialista sênior em inteligência de mercado para consórcios no Brasil.
      Analise os seguintes dados e forneça um insight estratégico conciso (máximo 150 palavras).
      Foque em identificar oportunidades de crescimento, riscos ocultos ou anomalias nos dados.
      
      Contexto da Análise: ${context}
      Dados (JSON): ${JSON.stringify(data)}
      
      Formate a resposta em Markdown usando tópicos se necessário.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 } // Disable thinking for faster insights
      }
    });

    return response.text || "Não foi possível gerar insights no momento.";
  } catch (error) {
    console.error("Erro ao gerar insights:", error);
    return "Ocorreu um erro ao processar a análise inteligente. Verifique sua conexão ou cota de API.";
  }
};

export const predictDemand = async (
  segment: SegmentType,
  historicalData: any[]
): Promise<{ prediction: string; rationale: string }> => {
  try {
    if (!process.env.API_KEY) {
      return { prediction: "N/A", rationale: "API Key ausente." };
    }

    const prompt = `
      Com base na série histórica fornecida para o segmento de ${segment}, faça uma previsão qualitativa para os próximos 4 trimestres.
      Considere sazonalidade típica do mercado brasileiro e ciclos econômicos.
      
      Dados Históricos: ${JSON.stringify(historicalData.slice(-8))}
      
      Retorne um JSON com o formato:
      {
        "prediction": "Texto curto resumindo a tendência (ex: Crescimento moderado)",
        "rationale": "Explicação técnica baseada nos dados"
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response");
    
    return JSON.parse(text);

  } catch (error) {
    console.error("Erro na predição:", error);
    return { prediction: "Erro na Análise", rationale: "Não foi possível calcular a previsão." };
  }
};