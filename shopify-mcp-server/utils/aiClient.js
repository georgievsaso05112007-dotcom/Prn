/**
 * aiClient.js
 * Universal AI client that works with multiple FREE providers:
 *   - Groq   (free tier, very fast)  → set AI_PROVIDER=groq
 *   - OpenRouter (free tier)         → set AI_PROVIDER=openrouter
 *   - Ollama (100% free, local)      → set AI_PROVIDER=ollama
 *   - Anthropic Claude               → set AI_PROVIDER=anthropic
 *
 * All tools use the single `generateText(prompt, systemPrompt)` function.
 */

import axios from 'axios';
import 'dotenv/config';

const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();

// ── Helper: call Groq (free tier at console.groq.com) ─────────────────────────
async function callGroq(prompt, systemPrompt) {
  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: process.env.GROQ_MODEL || 'llama3-8b-8192',
      messages: [
        { role: 'system', content: systemPrompt || 'You are a helpful Shopify store assistant.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.choices[0].message.content;
}

// ── Helper: call OpenRouter (free models available at openrouter.ai) ──────────
async function callOpenRouter(prompt, systemPrompt) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-8b-instruct:free',
      messages: [
        { role: 'system', content: systemPrompt || 'You are a helpful Shopify store assistant.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://shopify-mcp-server.local',
      },
    }
  );
  return response.data.choices[0].message.content;
}

// ── Helper: call Ollama (runs on your local machine, 100% free) ───────────────
async function callOllama(prompt, systemPrompt) {
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const response = await axios.post(`${base}/api/chat`, {
    model: process.env.OLLAMA_MODEL || 'llama3',
    messages: [
      { role: 'system', content: systemPrompt || 'You are a helpful Shopify store assistant.' },
      { role: 'user', content: prompt },
    ],
    stream: false,
  });
  return response.data.message.content;
}

// ── Helper: call Anthropic Claude ─────────────────────────────────────────────
async function callAnthropic(prompt, systemPrompt) {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt || 'You are a helpful Shopify store assistant.',
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.content[0].text;
}

/**
 * Main function used by all tools.
 * @param {string} prompt - The user prompt / task description
 * @param {string} systemPrompt - Optional system prompt to set AI behavior
 * @returns {Promise<string>} - The AI-generated text
 */
export async function generateText(prompt, systemPrompt = '') {
  try {
    switch (provider) {
      case 'groq':        return await callGroq(prompt, systemPrompt);
      case 'openrouter':  return await callOpenRouter(prompt, systemPrompt);
      case 'ollama':      return await callOllama(prompt, systemPrompt);
      case 'anthropic':   return await callAnthropic(prompt, systemPrompt);
      default:
        throw new Error(`Unknown AI_PROVIDER: "${provider}". Use groq, openrouter, ollama, or anthropic.`);
    }
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(`[AI Client] ${provider} error: ${msg}`);
  }
}

/**
 * Parse JSON from AI response safely.
 * The AI sometimes wraps JSON in markdown code blocks — this strips them.
 */
export function parseAIJson(text) {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}
