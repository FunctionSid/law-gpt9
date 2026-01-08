import express from "express";
import Alexa from "ask-sdk-core";
import { ExpressAdapter } from "ask-sdk-express-adapter";
import { search } from "../utils/retriever.js";
import { getJudicialStats } from "../utils/judicialService.js";
import { azureChat } from "../utils/azureClient.js";

const router = express.Router();

const LaunchRequestHandler = {
    canHandle(handlerInput) { return Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest"; },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak("Namaste Siddharth! Law GPT Alexa is ready. Ask me about BNS or court stats.")
            .reprompt("I am listening.")
            .getResponse();
    }
};

const LegalQueryIntentHandler = {
    canHandle(handlerInput) { return Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"; },
    async handle(handlerInput) {
        const userQuery = handlerInput.requestEnvelope.request.intent.slots?.query?.value || "";
        try {
            if (userQuery.toLowerCase().includes("pending") || userQuery.toLowerCase().includes("case")) {
                const stats = getJudicialStats(userQuery);
                return handlerInput.responseBuilder.speak(stats.replace(/\*\*/g, "")).getResponse();
            }
            const hits = await search(userQuery, 3);
            const messages = [{ role: "user", content: `Context: ${hits.map(h => h.text).join(" ")}\nQuestion: ${userQuery}` }];
            const answer = await azureChat(messages, 150);
            return handlerInput.responseBuilder.speak(answer).getResponse();
        } catch (err) { return handlerInput.responseBuilder.speak("Sorry, I hit an error.").getResponse(); }
    }
};

const skillBuilder = Alexa.SkillBuilders.custom().addRequestHandlers(LaunchRequestHandler, LegalQueryIntentHandler).create();
const adapter = new ExpressAdapter(skillBuilder, false, false);
router.post("/", adapter.getRequestHandlers());
export default router;
