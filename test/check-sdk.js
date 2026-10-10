import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "test" });
console.log(Object.keys(ai));
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(ai)));