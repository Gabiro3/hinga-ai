require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const AfricasTalking = require("africastalking");
const axios = require("axios");

// Initialize Africa's Talking
const africastalking = AfricasTalking({
  apiKey: process.env.AT_API,
  username: "sandbox",
});

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
const sessions = {};

function extractInput(text) {
  const inputs = text.split("*");
  return inputs.length > 0 ? inputs[inputs.length - 1].trim() : null;
}

// Gemini Prompt Template
function buildPrompt(question) {
  return `
You are a helpful AI assistant helping African farmers. 
Your task is to respond clearly, concisely, and non-technically.
The farmer may ask in their native language. Always respond in the same language as the question.

Only provide short, factual, helpful answers in simple words. Do not use any complex terms.

Farmer’s Question: "${question}"

Answer:
`;
}

// Dummy data for services
const seedProcurement = {
  "Maize": {
    location: "Seed Supply Co., Nairobi",
    phone: "+254700123456",
  },
  "Tomato": {
    location: "AgroSeeds Ltd., Kisumu",
    phone: "+254710654321",
  },
  "Rice": {
    location: "Green Farms, Eldoret",
    phone: "+254725987654",
  },
};

const truckRequest = (tons) => {
  return `CON For ${tons} tons, we will send a truck from TransCargo Ltd. Please call +254730123456 for further details.`;
};

// Handle USSD
app.post("/ussd", async (req, res) => {
  let { sessionId, phoneNumber, text } = req.body;
  let response = "";

  if (!sessions[sessionId]) {
    sessions[sessionId] = { stage: 0, phoneNumber };
  }

  let session = sessions[sessionId];
  const input = extractInput(text || "");

  switch (session.stage) {
    case 0:
      response = `CON Welcome to SmartFarm AI
1. Ask a farming question
2. Seed procurement
3. Market linkages
4. Agronomist service
5. Exit`;
      session.stage = 1;
      break;

    case 1:
      if (input === "1") {
        response = `CON Enter your farming question (max 160 characters):`;
        session.stage = 2;
      } else if (input === "2") {
        response = `CON Choose seed type:
1. Maize
2. Tomato
3. Rice`;
        session.stage = 3;
      } else if (input === "3") {
        response = `CON How many tons of produce do you have? (Enter the number):`;
        session.stage = 4;
      } else if (input === "4") {
        response = `CON Requesting an agronomist service. Please wait... We'll connect you shortly.`;
        session.stage = 0;
        delete sessions[sessionId]; // End session
        break;
      } else if (input === "5") {
        response = `END Thank you for using SmartFarm AI.`;
        delete sessions[sessionId];
      } else {
        response = `CON Invalid choice. Try again:
1. Ask a farming question
2. Seed procurement
3. Market linkages
4. Agronomist service
5. Exit`;
      }
      break;

    case 2:
      // Process farming question and call Gemini API
      const question = input;
      session.stage = 0; // Reset to start

      try {
        const geminiResponse = await axios.post(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-03-25:streamGenerateContent?key=" +
            process.env.GEMINI_API_KEY,
          {
            contents: [{ parts: [{ text: buildPrompt(question) }] }],
          }
        );

        const answer = geminiResponse.data.candidates[0].content.parts[0].text;
        const shortAnswer = answer.slice(0, 160); // USSD limit

        response = `END ${shortAnswer}`;
      } catch (err) {
        console.error("Gemini API error:", err);
        response = `END Sorry, we couldn't get a response. Try again later.`;
      }

      delete sessions[sessionId]; // End session
      break;

    case 3:
      // Seed procurement service
      const seedType = {
        "1": "Maize",
        "2": "Tomato",
        "3": "Rice",
      };
      const selectedSeed = seedType[input] || "Other";
      if (seedProcurement[selectedSeed]) {
        const { location, phone } = seedProcurement[selectedSeed];
        response = `END For ${selectedSeed} seeds, contact ${location} at ${phone}.`;
      } else {
        response = `END Invalid seed type. Try again.`;
      }
      delete sessions[sessionId]; // End session
      break;

    case 4:
      // Market linkages and truck request
      const tons = parseInt(input);
      if (isNaN(tons)) {
        response = `CON Please enter a valid number of tons.`;
      } else {
        response = truckRequest(tons);
      }
      delete sessions[sessionId]; // End session
      break;

    default:
      response = `END Thank you for using SmartFarm AI.`;
      delete sessions[sessionId];
      break;
  }

  res.set("Content-Type", "text/plain");
  res.send(response);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
