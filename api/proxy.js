// api/proxy.js

// Import Node.js built-in modules for file reading
import { promises as fs } from 'fs';
import path from 'path';

// --- FINAL HACKATHON FIX: Hardcoded API Key Integrated ---
// NOTE: Your key is securely placed here to bypass Vercel environment variable issues.
const geminiApiKey = 'AIzaSyDG4hf3-JR4W06e5wVG6C8G0eRVKk4QuFU'; 
// ------------------------------------------------

export default async function handler(request, response) {
    if (!geminiApiKey) {
        return response.status(500).json({ error: 'Proxy Error: API Key check failed.' });
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    // --- 1. FILE READING LOGIC ---
    let knowledgeBaseContent;
    try {
        // Construct the path to the knowledge base file
        const knowledgeFilePath = path.join(process.cwd(), 'knowledge_base.txt');
        
        // Read the file content asynchronously
        knowledgeBaseContent = await fs.readFile(knowledgeFilePath, 'utf-8');
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
            1. You **MUST** prioritize the **KNOWLEDGE_BASE DOCUMENT** for any brand-specific question (logo, color, link, etc.).
            2. If the answer is not in the Knowledge Base, your conversational_reply must politely state, "I cannot find specific guidance on that in the current knowledge document."
            3. You MUST always return a valid JSON object matching the requested schema.

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
