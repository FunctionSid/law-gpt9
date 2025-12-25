// D:\project\law-gpt-linux\utils\azureClient.js
import { azureClient, CONFIG } from "../config.js";

/**
 * Modern Azure OpenAI Chat Helper
 * Uses the centralized client from config.js for better performance.
 */
export async function azureChat(messages, maxTokens = 1000) {
    try {
        const completion = await azureClient.chat.completions.create({
            model: CONFIG.chatModel,
            messages: messages,
            max_tokens: maxTokens,
            temperature: 0.7, // Set to 0.7 for more natural legal explanations
        });

        return completion.choices[0].message.content || "";
    } catch (error) {
        console.error("❌ Azure Chat Error:", error.message);
        throw new Error(`AI Communication failed: ${error.message}`);
    }
}

/**
 * Health Check
 */
export async function checkAzure() {
    return { 
        ok: !!azureClient, 
        endpoint: process.env.AZURE_OPENAI_ENDPOINT || "Not Configured" 
    };
}