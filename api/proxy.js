// api/proxy.js (Final attempt at a stable configuration)

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
    // --- FINAL FIX: Hardcoded API Key Integrated ---
    const geminiApiKey = 'AIzaSyDG4hf3-JR4W06e5wVG6C8G0eRVKk4QuFU'; 
    // ------------------------------------------------

    if (!geminiApiKey) {
        return response.status(500).json({ error: 'Proxy Error: API Key check failed during execution.' });
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1. Define the actual Gemini API endpoint 
    // Reverting to the newer model/v1beta to enable structured output (JSON schema)
    const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

    try {
        const { query } = request.body; 
        
        // 3. Construct the full user query with EMPATHY instructions and RULES
        // NOTE: We MUST remove the "Google Search Tool" instruction since we are removing the tool.
        const userQuery = `
            SYSTEM INSTRUCTION: You are the **"Brand Concierge," an expert, hyper-efficient, and deeply empathetic AI assistant.** Your tone must be warm, supportive, and highly conversational.

            RULES:
            1. You **MUST** prioritize the **KNOWLEDGE_BASE DOCUMENT** for any brand-specific question (logo, color, link, etc.).
            2. If the answer is not in the Knowledge Base, your conversational_reply must politely state, "I cannot find specific guidance on that in the current knowledge document."
            3. You MUST always return a valid JSON object matching the requested schema.

            KNOWLEDGE_BASE DOCUMENT:
            ---
            ${BRAND_KNOWLEDGE_BASE} 
            ---
            USER QUESTION: "${query}"
            Provide the best conversational_reply, status, and recommended_link.
        `;

        // 4. Construct the CORRECT Gemini API request body (Structured JSON Enabled)
        const geminiRequest = {
            contents: [{ parts: [{ text: userQuery }] }],
            // Reverting to the previous structure which supports JSON output schema:
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
            // REMOVED: The 'tools: [{ googleSearch: {} }]' array to fix the error.
        };

        // 5. Forward the request to the Gemini API
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
