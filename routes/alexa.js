import express from "express";
import Alexa from "ask-sdk-core";
import { ExpressAdapter } from "ask-sdk-express-adapter";
import { search } from "../utils/retriever.js";
import { azureChat } from "../utils/azureClient.js";

const router = express.Router();

// 1. Handle when the user says "Open Law GPT"
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest";
    },
    handle(handlerInput) {
        const speakOutput = "Namaste! I am Law GPT. You can ask me about the Constitution or BNS. What would you like to know?";
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("I am listening. What is your legal question?")
            .getResponse();
    }
};

// 2. Handle when the user asks a legal question
const LegalQueryIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest";
    },
    async handle(handlerInput) {
        // This looks for the "query" slot we defined in your skill
        const userQuery = handlerInput.requestEnvelope.request.intent.slots?.query?.value || "the law";
        
        try {
            // Your existing search and AI logic
            const hits = await search(userQuery);
            const messages = [
                { role: "system", content: "You are a voice assistant. Give a very short, 2-sentence answer." },
                { role: "user", content: `Context: ${hits.map(h => h.text).join(" ")}\nQuestion: ${userQuery}` }
            ];
            
            const answer = await azureChat(messages, 150);
            
            return handlerInput.responseBuilder
                .speak(answer)
                .withShouldEndSession(true)
                .getResponse();
        } catch (err) {
            return handlerInput.responseBuilder
                .speak("I am having trouble checking the law books right now.")
                .getResponse();
        }
    }
};

// 3. Register the handlers and create the adapter
const skillBuilder = Alexa.SkillBuilders.custom()
    .addRequestHandlers(LaunchRequestHandler, LegalQueryIntentHandler)
    .create();

const adapter = new ExpressAdapter(skillBuilder, false, false);

// 4. The Route
router.post("/", adapter.getRequestHandlers());

export default router;