import { OpenAIClient, AzureKeyCredential } from "@azure/openai";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const deploymentName = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT; 

export async function getAIResponse(userQuery, context) {
    if (!apiKey || !endpoint || !deploymentName) {
        return "System Error: Missing AI keys in Azure Settings.";
    }
    try {
        const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));
        const messages = [
            { role: "system", content: "You are an Indian Legal Assistant. Provide accurate, simple advice." },
            { role: "user", content: `Context: ${context}\n\nQuestion: ${userQuery}` }
        ];
        const result = await client.getChatCompletions(deploymentName, messages);
        return result.choices[0].message.content;
    } catch (error) {
        return "AI Error: " + error.message;
    }
}
