import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function listModels() {
  try {
    const list = await ai.models.list();
    for await (const m of list) {
      if (m.supportedActions?.includes("generateContent") || m.name?.includes("flash")) {
        console.log(`${m.name} | displayName: ${m.displayName}`);
      }
    }
  } catch (err) {
    console.error("List error:", err);
  }
}

listModels();