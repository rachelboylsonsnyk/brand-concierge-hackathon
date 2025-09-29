// api/proxy.js

// Import Node.js built-in modules for file reading
import { promises as fs } from 'fs';
import path from 'path';

// --- FINAL HACKATHON FIX: Hardcoded API Key Integrated ---
// 🔑 NEW KEY INTEGRATED: This should resolve the permission/restriction issues.
const geminiApiKey = 'AIzaSyBtePGI98eLX1idoPhS_wxqO-Us9AQD5Nc'; 
// ------------------------------------------------

export default async function handler(request, response) {
    if (!geminiApiKey) {
        return response.status(500).json({ 
            error: 'Proxy Error', 
            details: 'API Key is missing. Please check your api/proxy.js file.' 
        });
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    // --- 1. FILE READING LOGIC ---
    let knowledgeBaseContent;
    try {
        // Construct the path to the knowledge base file
        const knowledgeFilePath = path.join(process.cwd(), 'knowledge_base.txt');
        knowledgeBaseContent = await fs.readFile(knowledgeFilePath, 'utf-8');

        // 🛑 CRITICAL FIX: Strip the Byte Order Mark (BOM) if present.
        // This prevents invisible characters from corrupting the JSON payload sent to Gemini.
        if (knowledgeBaseContent.charCodeAt(0) === 0xFEFF) {
            knowledgeBaseContent = knowledgeBaseContent.slice(1);
        }

    } catch (error) {
        console.error("Knowledge Base Read Error:", error);
        return response.status(500).json({ 
            error: 'Configuration Error', 
            details: 'Could not read knowledge_base.txt. Ensure the file is present in the project root.' 
        });
    }
    // --- END FILE READING LOGIC ---

    // Define the actual Gemini API endpoint 
    const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

    try {
        const { query } = request.body; 
        
        // 3. Construct the full user query with EMPATHY instructions and RULES
        const userQuery = `
            SYSTEM INSTRUCTION: You are the **"Brand Concierge," an expert, hyper-efficient, and deeply empathetic AI assistant.** Your tone must be warm, supportive, and highly conversational.

            RULES:
            1. You **MUST** prioritize the **KNOWLEDGE_BASE DOCUMENT**.
            2. If the knowledge base contains an entry with the **Topic set to "Non-Brand question"**, your conversational_reply MUST include a gentle disclaimer like, "While that isn't specifically a core brand-compliance question, I can certainly point you in the right direction:" followed by the answer and link.
            3. If the question is clearly **out of scope** (e.g., general knowledge, recipes, sports, or topics unrelated to brand, marketing, or web operations), your conversational_reply MUST state: "I'm the Brand Concierge, so my knowledge is focused on brand assets and guidelines. I can't help with general knowledge questions, but feel free to ask me anything about our marketing or brand." The recommended_link MUST be set to 'None'.
            4. If the question relates to brand/marketing but the answer is NOT found in the knowledge base, your conversational_reply MUST state: "I haven't found that in the current knowledge base. For further assistance, please reach out directly to the team in the #ask-brand-design Slack channel." and the recommended_link MUST be set to: https://snyk.enterprise.slack.com/archives/C041RSP2LG2.
            5. You MUST always return a valid JSON object matching the requested schema.

            KNOWLEDGE_BASE DOCUMENT:
            ---
            ${knowledgeBaseContent} 
            ---
            USER QUESTION: "${query}"
            Provide the best conversational_reply, status, and recommended_link.
        `;

        // 4. Construct the CORRECT Gemini API request body (Structured JSON Enabled)
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
        
        const parsedJson = JSON.parse(jsonResponseText);

        // 🛑 FIX: Post-process the link to remove Google Search prefixes if Gemini injected them.
        const link = parsedJson.recommended_link;
        const googleSearchPrefix = "https://www.google.com/search";
        
        if (link && link.startsWith(googleSearchPrefix)) {
             // Attempt to extract the original URL from the 'q=' parameter (if present)
             const urlParams = new URLSearchParams(link.split('?')[1]);
             const originalUrl = urlParams.get('q');
             parsedJson.recommended_link = originalUrl || link; // Use original or fall back to the raw link
        }
        
        // 7. Return the processed structure
        response.status(200).json(parsedJson);

    } catch (error) {
        console.error("Proxy Forward Error:", error);
        response.status(500).json({ 
            error: 'Server error during API proxy.', 
            details: error.message 
        });
    }
}
