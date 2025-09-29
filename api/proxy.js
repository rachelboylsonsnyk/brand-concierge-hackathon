// api/proxy.js

// --- HARDCODED KNOWLEDGE BASE ---
const BRAND_KNOWLEDGE_BASE = `
    DESIGN GUIDELINES:
    ---
    1. Primary Logo Asset: The main SVG file is located in the Shared Google Drive under /Assets/Logos/Primary.svg. Use the link: https://drive.google.com/folder/primary-logo-svg [Link Available].
    2. Brand Colors: The primary color is Hex #4f46e5 (Indigo 600). The secondary color is Hex #10b981 (Emerald 500).
    3. Typography: Use the 'Inter' font family exclusively for all user interface elements.
    4. Iconography: Use Lucide icons only. Do not use FontAwesome or Material Icons.
    ---
`;

export default async function handler(request, response) {
    // --- TEMPORARY HACKATHON FIX: HARDCODING API KEY ---
    // NOTE: Replace the placeholder below with your actual Gemini API Key.
    const geminiApiKey = 'AIzaSyDG4hf3-JR4W06e5wVG6C8G0eRVKk4QuFU'; 
    // ----------------------------------------------------

    if (!geminiApiKey || geminiApiKey.startsWith('YOUR_')) {
        return response.status(500).json({ error: 'Proxy Error: API Key is missing or is the placeholder.' });
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1. Define the actual Gemini API endpoint (Using v1 for reliable tool access)
    // The model should be gemini-2.5-flash which supports the Google Search tool.
    const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent";

    try {
        // 2. Extract ONLY the query from the frontend request
        const { query } = request.body; 
        
        // 3. Construct the full user query with EMPATHY instructions and RULES
        const userQuery = `
            SYSTEM INSTRUCTION: You are the **"Brand Concierge," an expert, hyper-efficient, and deeply empathetic AI assistant.** Your tone must be warm, supportive, and highly conversational.

            RULES:
            1. You **MUST** prioritize the **KNOWLEDGE_BASE DOCUMENT** for any brand-specific question (logo, color, link, etc.).
            2. If the user asks a general design question (e.g., "What is CMYK?", "What are the latest UI trends?"), you **MUST** use the Google Search Tool to provide an accurate, helpful answer.
            3. If the answer is not in the Knowledge Base and the question is brand-specific, your conversational_reply must politely state, "I cannot find specific guidance on that in the current knowledge document."
            4. You MUST always return a valid JSON object matching the requested schema.

            KNOWLEDGE_BASE DOCUMENT:
            ---
            ${BRAND_KNOWLEDGE_BASE} 
            ---
            USER QUESTION: "${query}"
            Provide the best conversational_reply, status, and recommended_link.
        `;

        // 4. Construct the CORRECT Gemini API request body, including the Search Tool
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
            },
            // --- ADD THE GOOGLE SEARCH TOOL HERE ---
            tools: [{ googleSearch: {} }],
            // ---------------------------------------
        };

        // 5. Forward the request to the Gemini API with the key
        const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiRequest)
        });

        // 6. Process the Gemini response
        const data = await geminiResponse.json();
        
        if (!geminiResponse.ok) {
            const errorMessage = data.error?.message || "Gemini API failed with an unknown error.";
            console.error("Gemini API Status Error:", data);
            return response.status(500).json({ 
                error: 'Gemini API Status Error', 
                details: errorMessage 
            });
        }

        const jsonResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!jsonResponseText) {
             return response.status(500).json({ error: 'Malformed response from Gemini: missing content.', details: JSON.stringify(data) });
        }

        // 7. Parse and return the final JSON structure
        response.status(200).json(JSON.parse(jsonResponseText));

    } catch (error) {
        console.error("Proxy Forward Error:", error);
        response.status(500).json({ 
            error: 'Server error during API proxy.', 
            details: error.message 
        });
    }
}
