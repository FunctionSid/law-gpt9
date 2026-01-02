
import express from "express";
import { search } from "../utils/retriever.js";
import { azureChat } from "../utils/azureClient.js";

const router = express.Router();

router.post("/", async (req, res) => {
    const requestType = req.body.request?.type;
    
    if (requestType === "LaunchRequest") {
        return res.json({
            version: "1.0",
            response: {
                outputSpeech: { type: "PlainText", text: "Namaste! I am Law GPT. You can ask me about the Constitution or BNS. What would you like to know?" },
                shouldEndSession: false
            }
        });
    }

    if (requestType === "IntentRequest") {
        const userQuery = req.body.request.intent.slots?.query?.value || "the law";
        try {
            const hits = await search(userQuery);
            const messages = [
                { role: "system", content: "You are a voice assistant. Give a very short, 2-sentence answer." },
                { role: "user", content: `Context: ${hits.map(h => h.text).join(" ")}\nQuestion: ${userQuery}` }
            ];
            const answer = await azureChat(messages, 150);
            return res.json({
                version: "1.0",
                response: {
                    outputSpeech: { type: "PlainText", text: answer },
                    shouldEndSession: true
                }
            });
        } catch (err) {
            return res.json({
                version: "1.0",
                response: {
                    outputSpeech: { type: "PlainText", text: "I am having trouble checking the law books right now." },
                    shouldEndSession: true
                }
            });
        }
    }
});
export default router;
