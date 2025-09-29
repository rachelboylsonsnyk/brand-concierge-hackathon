import { GoogleGenAI } from '@google/generative-ai';

// Define the system instructions that give the AI its 'Brand Concierge' persona
const systemPrompt = `
    You are the "Brand Concierge," a friendly, expert, and hyper-efficient AI assistant for the design team.
    Your core task is to answer user questions based STRICTLY on the KNOWLEDGE_BASE DOCUMENT provided by the design head.

    RULES:
    1. You MUST first read and prioritize the content in the KNOWLEDGE_BASE DOCUMENT.
    2. Your conversational_reply MUST be a friendly, conversational summary (2-3 sentences) of the answer, directly referencing the information found in the document.
    3. If the KNOWLEDGE_BASE DOCUMENT does not contain the answer, your conversational_reply must politely state, "I cannot find specific guidance on that in the current knowledge document."
    4. You MUST always return a valid JSON object matching the required schema.
`;

// Configuration for structured output (JSON)
const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: {
        type: "OBJECT",
        properties: {
            conversational_reply: {
                type: "STRING",
                description: "The friendly, conversational summary of the answer based on the knowledge base."
            },
            status: {
                type: "STRING",
                description: "A simple status: 'SUCCESS' if an answer/link was found, 'NOT_FOUND' otherwise."
            },
            recommended_link: {
                type: "STRING",
                description: "The URL or path that the user should be directed to for the detailed resource. Use 'None' if no specific link is mentioned in the document for the answer."
            }
        },
        required: ["conversational_reply", "status", "recommended_link"]
    }
};

// Vercel Serverless Function handler
export default async function handler(request, response) {
    if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    // CRITICAL CHECK: Ensure the key is available before initializing the client.
    if (!process.env.GEMINI_API_KEY) {
        // If the key is missing, return a proper JSON error that the frontend can read.
        response.status(500).json({ error: 'Configuration Error: GEMINI_API_KEY environment variable not set on Vercel.' });
        return;
    }

    // Initialize the GoogleGenAI client INSIDE the handler function.
    // This is the key change for stability in serverless environments.
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    
    try {
        const { query, knowledgeBaseContent } = request.body;

        if (!query || !knowledgeBaseContent) {
             response.status(400).json({ error: 'Missing "query" or "knowledgeBaseContent" in request body.' });
             return;
        }

        // Construct the full prompt sent to Gemini
        const userQuery = `
            KNOWLEDGE_BASE DOCUMENT:
            ---
            ${knowledgeBaseContent}
            ---
            USER QUESTION: "${query}"
            Based on the document, provide the best conversational_reply, status, and recommended_link.
        `;

        // Generate content using gemini-2.5-flash
        const apiResponse = await ai.generateContent({
            model: "gemini-2.5-flash-preview-05-20",
            contents: [{ parts: [{ text: userQuery }] }],
            generationConfig: generationConfig,
            systemInstruction: { parts: [{ text: systemPrompt }] },
        });

        // The response text is a JSON string
        const jsonResponse = apiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jsonResponse) {
            throw new Error("API returned an empty or malformed response.");
        }

        // Send the JSON response back to the frontend
        response.status(200).json(JSON.parse(jsonResponse));

    } catch (error) {
        console.error("Gemini API Error:", error.message);
        // If the Gemini API fails (e.g., 403, 400), we catch it here and return a proper JSON error.
        response.status(500).json({
            error: 'A server error occurred while communicating with the Brand Concierge service.',
            details: error.message
        });
    }
}
