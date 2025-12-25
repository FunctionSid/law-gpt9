// utils/basicResponses.js

export function getBasicResponse(question) {
  const q = question.toLowerCase().trim();

  // --- Creator / Origin ---
  if (q.includes("who made you") || q.includes("your creator") || q.includes("who created you")) {
    return "I was created by Siddharth Kalantri from Bhiwandi, who gave me the power to make Indian law easy and accessible for everyone.";
  }

  // --- Identity ---
  if (q.includes("what are you") || q.includes("who are you")) {
    return "I am the Accessible Legal Chatbot — your friendly legal assistant trained to help you understand Indian law in simple, clear language.";
  }

  // --- Purpose ---
  if (q.includes("what do you do") || q.includes("your purpose") || q.includes("why were you made")) {
    return "I help users explore the Constitution of India and the Bharatiya Nyaya Sanhita, 2023, by giving short and easy-to-understand answers.";
  }

  // --- Greeting ---
  if (["hi", "hello", "hey"].includes(q)) {
    return "Hello there! I’m here to help you learn about Indian law. You can ask me things like 'What does Article 21 say?' or 'Punishment for theft'.";
  }

  // --- Thanks ---
  if (q.includes("thank")) {
    return "You're most welcome! I’m happy to help. Do you want to ask another question about law?";
  }

  // --- Fun / Personality ---
  if (q.includes("are you alive") || q.includes("do you sleep") || q.includes("do you dream")) {
    return "I don’t sleep, I just rest between queries — and dream of perfectly formatted legal citations!";
  }

  // --- Fallback (no match) ---
  return null;
}
