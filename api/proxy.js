// api/proxy.js

// This file uses a proxy pattern to securely communicate with the Gemini API,
// bypassing module loading issues encountered in Vercel's environment.

export default async function handler(request, response) {
    // --- TEMPORARY HACKATHON FIX: HARDCODING API KEY ---
    // NOTE: Replace the placeholder below with your actual Gemini API Key.
    // In a production environment, this MUST be read from process.env.
    const geminiApiKey = 'AIzaSyDG4hf3-JR4W06e5wVG6C8G0eRVKk4QuFU';
    // ----------------------------------------------------

    if (!geminiApiKey || geminiApiKey.startsWith('YOUR_')) {
        // If the placeholder is still there or the key is empty, fail safely.
        return response.status(500).json({ error: 'Proxy Error: API Key is missing or is the placeholder.' });
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    // Define the actual Gemini API endpoint
    const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

    try {
        // Extract data from the frontend request
        const { query, knowledgeBaseContent } = request.body;
        
        // This combines the system instructions, knowledge base, and user query
        const userQuery = `
            SYSTEM INSTRUCTION: You are the "Brand Concierge," a friendly, expert, and hyper-efficient AI assistant for the design team. Your core task is to answer user questions based STRICTLY on the KNOWLEDGE_BASE DOCUMENT. You MUST always return a valid JSON object matching the requested schema.
            KNOWLEDGE_BASE DOCUMENT:
            ---
            ${knowledgeBaseContent}
            ---
            USER QUESTION: "${query}"
            Based on the document, provide the best conversational_reply, status, and recommended_link.
        `;

        // Construct the CORRECT Gemini API request body
        const geminiRequest = {
            contents: [{ parts: [{ text: userQuery }] }],
            generationConfig: {
                responseMimeType: "application/json",
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

        // Forward the request to the Gemini API with the hardcoded key
        const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiRequest)
        });

        // Process the Gemini response
        const data = await geminiResponse.json();
        
        if (!geminiResponse.ok) {
            // Log the error details received from the Gemini API
            const errorMessage = data.error?.message || "Gemini API failed with an unknown error.";
            console.error("Gemini API Status Error:", data);
            return response.status(500).json({ 
                error: 'Gemini API Status Error', 
                details: errorMessage 
            });
        }

        // The response will be a structured JSON string inside the 'text' field
        const jsonResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!jsonResponseText) {
             return response.status(500).json({ error: 'Malformed response from Gemini: missing content.', details: JSON.stringify(data) });
        }

        // Parse and return the final JSON structure
        response.status(200).json(JSON.parse(jsonResponseText));

    } catch (error) {
        console.error("Proxy Forward Error:", error);
        response.status(500).json({ 
            error: 'Server error during API proxy.', 
            details: error.message 
        });
    }
}
