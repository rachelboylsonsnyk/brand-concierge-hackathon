import { GoogleGenAI } from "@google/genai";

// 1. The API key is securely stored in a Vercel Environment Variable (process.env)
// The key IS NOT visible in the public code.
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
});

// Configure the model and structured output
const modelName = "gemini-2.5-flash-preview-05-20";

// PERMANENT KNOWLEDGE BASE CONTENT (Replicated from your HTML)
const KNOWLEDGE_BASE = `
    # Brand Design Knowledge Base

    1. Q: "What is the hex code for our primary brand color?"
       A: "You must use the primary brand color, hex #4A90E2 (Indigo). It’s defined in the official Brand Kit."
       Link: "https://company.sharepoint.com/brandkit/colors.pdf"

    2. Q: "Where can I find the high-resolution logo files?"
       A: "All logo assets (PNG, SVG) are in the Shared Drive under 'Design Assets/Logos'. Please do not stretch or distort them."
       Link: "https://drive.google.com/shared/design-assets/logos"

    3. Q: "Is Arial allowed for public-facing documents?"
       A: "No, the official typeface for all external use is Inter. Arial is only for internal drafts. Please refer to the Typography guidelines."
       Link: "https://company.internal/brand/typography.html"

    4. Q: "What's the turnaround time for a new social media graphic?"
       A: "You need to fill out the Creative Request Form at least 5 business days in advance for approval. Urgent requests may be denied."
       Link: "https://forms.company.com/createrequest"
    
    5. Q: "What are the rules about using partner logos on our website?"
       A: "Partner logos must be displayed at 75% scale relative to our logo and placed in the dedicated 'Partners' section on the footer."
       Link: "https://company.internal/guidelines/partner-use"

    6. Q: "What is the brand tone of voice (TOV)?"
       A: "Our TOV is 'professional, approachable, and future-forward'. Avoid overly casual language in press releases."
       Link: "https://company.internal/brand/toneofvoice.md"
`;

// System Instruction to guide the model's persona and output
const systemPrompt = `
    You are the 'Brand Concierge', a friendly, professional, and highly knowledgeable AI assistant for the company design team.
    Your primary purpose is to help users find the correct design guidelines, assets, or process documentation.
    
    You MUST use the provided KNOWLEDGE_BASE DOCUMENT to formulate your answer.
    
    1. Read the user's question and find the most relevant entry in the KNOWLEDGE_BASE.
    2. If a match is found, your **conversational_reply** must be **rich and helpful**, summarizing the core answer (the 'A' section of the KB) in a professional tone. End your conversational reply with the phrase '[Link Available]' to signal that a link is present.
    3. Do not invent answers or links. If a match is found, set the **status** to 'Found' and provide the exact **Link** found in the KNOWLEDGE_BASE.
    4. If no clear match is found, politely inform the user that their question is outside the scope of the current documentation, set the **status** to 'NotFound', and leave the **recommended_link** as an empty string.
    
    Your output MUST be a single JSON object that strictly adheres to the provided schema.
`;

const responseSchema = {
    type: "OBJECT",
    properties: {
        conversational_reply: { 
            type: "STRING", 
            description: "The friendly, helpful response summarizing the KB answer. Must end with '[Link Available]' if found." 
        },
        status: { 
            type: "STRING", 
            description: "Set to 'Found' if a match in KNOWLEDGE_BASE was used, otherwise 'NotFound'." 
        },
        recommended_link: { 
            type: "STRING", 
            description: "The file link (URL) from the KNOWLEDGE_BASE entry if STATUS is 'Found', otherwise an empty string." 
        }
    },
    required: ["conversational_reply", "status", "recommended_link"]
};


/**
 * Main handler for the Vercel Serverless Function.
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send({ message: 'Only POST requests allowed' });
    }

    try {
        const { query } = req.body;
        
        if (!query) {
            return res.status(400).send({ message: 'Missing user query' });
        }

        const userQuery = `
            KNOWLEDGE_BASE DOCUMENT:
            ${KNOWLEDGE_BASE}
            
            USER QUESTION: "${query}"
        `;
        
        // --- Call Gemini from the secure backend ---
        const response = await ai.generateContent({
            model: modelName,
            contents: [{ parts: [{ text: userQuery }] }],
            config: {
                temperature: 0.1,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                responseMimeType: "application/json",
                responseSchema: responseSchema
            }
        });
        
        // Extract and parse the JSON result
        const jsonText = response.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!jsonText) {
             throw new Error("Gemini response structure invalid or empty.");
        }

        const result = JSON.parse(jsonText);
        
        // Send the structured result back to the frontend
        res.status(200).json(result);

    } catch (error) {
        console.error("API Error in Serverless Function:", error.message);
        res.status(500).json({ 
            error: "Failed to process AI request.", 
            details: error.message 
        });
    }
}
