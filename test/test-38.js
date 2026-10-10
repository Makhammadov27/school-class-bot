import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testModels() {
  const models = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"];
  for (const m of models) {
    try {
      console.log(`Sinov: ${m}...`);
      const res = await ai.models.generateContent({
        model: m,
        contents: "Test: 1+1=?",
      });
      console.log(`✅ ${m} muvaffaqiyatli ishladi: ${res.text.trim()}`);
      break;
    } catch (e) {
      console.warn(`⚠️ ${m} xato: ${e.message}`);
    }
  }
}

testModels();