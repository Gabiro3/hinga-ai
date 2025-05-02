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
  return `CON Ku toni ${tons}, imodoka izava muri TransCargo Ltd. Hamagara +254730123456 kubaza ibindi bisobanuro.`;
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
      response = `CON Murakaza neza kuri Hinga AI
1. Baza ikibazo kijyanye n’ubuhinzi
2. Kugura imbuto
3. Guhuza abahinzi n’isoko
4. Serivisi y’umuhinzi w’inzobere
5. Sohoka`;
      session.stage = 1;
      break;

    case 1:
      if (input === "1") {
        response = `CON Andika ikibazo cyawe kijyanye n’ubuhinzi:`;
        session.stage = 2;
      } else if (input === "2") {
        response = `CON Hitamo ubwoko bw’imbuto:
1. Ibigori
2. Inyanya
3. Umuceri`;
        session.stage = 3;
      } else if (input === "3") {
        response = `CON Ufite toni zingahe z’umusaruro? (Andika umubare):`;
        session.stage = 4;
      } else if (input === "4") {
        response = `CON Turimo gushaka umuhinzi w’inzobere. Tegereza gato... Tuzahita tuguhuza.`;
        session.stage = 0;
        delete sessions[sessionId]; // End session
        break;
      } else if (input === "5") {
        response = `END Murakoze gukoresha Hinga AI.`;
        delete sessions[sessionId];
      } else {
        response = `CON Hitamo neza:
1. Baza ikibazo kijyanye n’ubuhinzi
2. Kugura imbuto
3. Kuhuza abahinzi n’isoko
4. Serivisi y’umuhinzi w’inzobere
5. Sohoka`;
      }
      break;

    case 2:
      // Process farming question and call Gemini API
      const question = input;
      session.stage = 0;

      try {
        const geminiResponse = await axios.post(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
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
        response = `END Tubabarire, ntitwashoboye kubona igisubizo. Ongera ugerageze nyuma.`;
      }

      delete sessions[sessionId];
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
        const localName = {
          "Maize": "ibigori",
          "Tomato": "inyanya",
          "Rice": "umuceri",
        };
        response = `END Kubona imbuto za ${localName[selectedSeed]}, hamagara ${location} kuri ${phone}.`;
      } else {
        response = `END Ubwoko bw’imbuto ntibubonetse. Ongera ugerageze.`;
      }
      delete sessions[sessionId];
      break;

    case 4:
      // Market linkages and truck request
      const tons = parseInt(input);
      if (isNaN(tons)) {
        response = `CON Andika umubare nyawo w’toni z’umusaruro.`;
      } else {
        response = truckRequest(tons);
      }
      delete sessions[sessionId];
      break;

    default:
      response = `END Murakoze gukoresha Hinga AI.`;
      delete sessions[sessionId];
      break;
  }

  res.set("Content-Type", "text/plain");
  res.send(response);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
