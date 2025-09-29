// --- Reverting to Namespace Import to resolve persistent Vercel issues ---
// This pattern is the original one from the hackathon starter and often works 
// better than named imports when environment variables are involved.
import * as GenerativeAI from '@google/generative-ai'; 

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

/**
 * Robustly initializes and returns the GoogleGenAI client.
 * NOTE: The client will automatically look for GEMINI_API_KEY in the environment.
 * @returns {object} The initialized client instance.
 * @throws {Error} if the API key is missing.
 */
function initializeAIClient() {
    // We are relying on the GoogleGenAI constructor to find the key.
    const key = process.env.GEMINI_API_KEY; 

    // FINAL CHECK: Ensure the key is seen by Vercel's runtime.
    console.log("GEMINI_API_KEY Check:", key ? `Key found (length: ${key.length})` : "Key NOT found (undefined)");
    
    if (!key) {
        // If the key is missing, throw an error the catch block can handle.
        throw new Error('Configuration Error: GEMINI_API_KEY environment variable not set on Vercel.');
    }

    // Initialize using the namespace import and the standard constructor call.
    return new GenerativeAI.GoogleGenAI({ 
        apiKey: key,
    });
}

// Vercel Serverless Function handler
export default async function handler(request, response) {
    if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    let ai;
    try {
        // Initialize the client first
        ai = initializeAIClient();

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
            // FIX 3: Pass the system prompt as a simple string (Critical fix)
            systemInstruction: systemPrompt,
        });

        // The response text is a JSON string
        const jsonResponse = apiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jsonResponse) {
            throw new Error("API returned an empty or malformed response.");
        }

        // Send the JSON response back to the frontend
        response.status(200).json(JSON.parse(jsonResponse));

    } catch (error) {
        // Log the full error to Vercel logs
        console.error("Gemini API Runtime Error:", error);
        
        // This ensures the frontend gets a structured JSON error response.
        if (error.message.includes('Configuration Error')) {
            response.status(500).json({ error: error.message });
        } else {
            response.status(500).json({
                error: 'A server error occurred while communicating with the Brand Concierge service.',
                details: error.message
            });
        }
    }
}
