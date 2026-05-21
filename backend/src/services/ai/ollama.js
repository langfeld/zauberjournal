/**
 * ============================================
 * Ollama Provider (Lokale KI)
 * ============================================
 * Implementiert die KI-Anbindung an Ollama für lokale Modelle.
 * Ideal für Datenschutz und Offline-Nutzung.
 *
 * Voraussetzung: Ollama muss installiert und gestartet sein.
 * Empfohlene Modelle: llava (mit Bilderkennung), llama3
 */

import { BaseAIProvider } from './base.js';

export class OllamaProvider extends BaseAIProvider {
  constructor(config) {
    super('Ollama (Lokal)');
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'llava';
  }

  async chat(prompt, options = {}) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'Du bist ein hilfreicher Kochassistent. Du antwortest immer auf Deutsch und bist Experte für Rezepte, Zutaten, Kochtechniken und Wochenplanung.',
          },
          { role: 'user', content: prompt },
        ],
        stream: false,
        format: options.json ? 'json' : undefined,
        options: {
          temperature: options.temperature ?? 0.7,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API Fehler (${response.status}): ${error}`);
    }

    const data = await response.json();
    return data.message.content;
  }

  async chatWithImage(prompt, imageBuffer, options = {}) {
    const base64Image =
      imageBuffer instanceof Buffer
        ? imageBuffer.toString('base64')
        : imageBuffer;

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model, // Muss ein Vision-Modell sein (z.B. llava)
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [base64Image],
          },
        ],
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama Vision Fehler (${response.status}): ${error}`);
    }

    const data = await response.json();
    return data.message.content;
  }
}
