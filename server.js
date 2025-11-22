require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Configuration ---
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // In production, restrict this to your Angular URL
});

// --- Gemini Setup ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Or gemini-1.5-flash

// --- Helper: Clean JSON ---
// LLMs often wrap JSON in ```json ... ``` blocks. We need to strip that.
function cleanJSON(text) {
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

// --- Feature 1: The Automated Signal Broadcaster ---
async function broadcastMarketInsight() {
    try {
        const prompt = `
            You are a financial analyst AI. Generate a realistic, fictional stock market signal for a random major tech company (Apple, Tesla, NVIDIA, Microsoft, or Google).
            
            Return ONLY a raw JSON object (no markdown formatting) with this structure:
            {
                "symbol": "TICKER",
                "action": "BUY" or "SELL",
                "price": 123.45,
                "confidence": 85,
                "reason": "Short distinct sentence explaining why (e.g., 'RSI indicates oversold conditions')."
            }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const jsonString = cleanJSON(responseText);
        const signalData = JSON.parse(jsonString);

        // Add timestamp server-side
        signalData.timestamp = new Date();

        console.log(`[Gemini Broadcaster] Sent signal for ${signalData.symbol}`);
        io.emit('ai-signal', signalData);

    } catch (error) {
        console.error("Error generating signal:", error.message);
    }
}

// Run the broadcaster every 15 seconds
setInterval(broadcastMarketInsight, 15000);

// --- Feature 2: WebSocket Handling & Chat ---
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle incoming chat messages from Angular
    socket.on('user-message', async (message) => {
        try {
            // Send user message to Gemini
            const prompt = `You are a helpful financial assistant. Answer this briefly: ${message}`;
            const result = await model.generateContent(prompt);
            const aiResponse = result.response.text();

            // Send answer back to THIS specific client
            socket.emit('ai-chat-response', {
                text: aiResponse,
                sender: 'Gemini'
            });
        } catch (error) {
            socket.emit('ai-chat-response', {
                text: "I'm having trouble connecting to the market brain right now.",
                sender: 'System'
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Connecting to Gemini API...`);
});
