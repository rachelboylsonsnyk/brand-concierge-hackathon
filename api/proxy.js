// api/proxy.js
// This function acts as a secure intermediary (a proxy) whose only job is 
// to take a request from the frontend, add the secret API key, and forward it 
// to the actual Gemini API endpoint. This avoids module loading conflicts.

export default async function handler(request, response) {
    // 1. Check for API Key
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        return response.status(500).json({ error: 'Proxy Error: GEMINI_API_KEY is not set.' });
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Define the actual Gemini API endpoint
    const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

    try {
        // 3. Construct the body to send to Gemini
        const { query, knowledgeBaseContent } = request.body;
        
        // This is the prompt structure that api/chat.js was building
        const userQuery = `
            SYSTEM INSTRUCTION: You are the "Brand Concierge," a friendly, expert, and hyper-efficient AI assistant for the design team. Your core task is to answer user questions based STRICTLY on the KNOWLEDGE_BASE DOCUMENT. You MUST always return a valid JSON object matching the requested schema.
            KNOWLEDGE_BASE DOCUMENT:
            ---
            ${knowledgeBaseContent}
            ---
            USER QUESTION: "${query}"
            Based on the document, provide the best conversational_reply, status, and recommended_link.
        `;

        const geminiRequest = {
            contents: [{ parts: [{ text: userQuery }] }],
            config: {
                responseMimeType: "application/json",
                // This is the JSON schema from your original api/chat.js
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        conversational_reply: { type: "STRING" },
                        status: { type: "STRING" },
                        recommended_link: { type: "STRING" }
                    },
                    required: ["conversational_reply", "status", "recommended_link"]
                }
            }
        };

        // 4. Forward the request to the Gemini API
        const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiRequest)
        });

        // 5. Send the raw Gemini response back to the frontend
        const data = await geminiResponse.json();
        
        if (!geminiResponse.ok) {
            // Handle API errors (e.g., rate limits)
            throw new Error(data.error?.message || "Gemini API failed");
        }

        // The response will be a structured JSON string inside the 'text' field
        const jsonResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!jsonResponseText) {
             return response.status(500).json({ error: 'Malformed response from Gemini.' });
        }

        // 6. Parse and return the final JSON structure
        response.status(200).json(JSON.parse(jsonResponseText));

    } catch (error) {
        console.error("Proxy Forward Error:", error);
        response.status(500).json({ 
            error: 'Server error during API proxy.', 
            details: error.message 
        });
    }
}
