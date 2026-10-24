import { config } from "./config.js";
import { logger } from "./log.js";

const log = logger("tts");

export const SAMPLE_RATE = 24000;
const cache = new Map<string, Buffer>();

/** Cartesia Sonic text-to-speech. Returns a 16-bit mono WAV. */
export async function synthesize(text: string, { cacheable = false } = {}): Promise<Buffer> {
  if (cacheable && cache.has(text)) return cache.get(text)!;
  if (!config.cartesia.apiKey || !config.cartesia.voiceId) {
    throw new Error("Cartesia isn't configured (CARTESIA_API_KEY / CARTESIA_VOICE_ID).");
  }
  const started = Date.now();
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.cartesia.apiKey}`,
      "Cartesia-Version": config.cartesia.version,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model_id: config.cartesia.model,
      transcript: text,
      voice: { id: config.cartesia.voiceId },
      language: "en",
      output_format: {
        container: "wav",
        encoding: "pcm_s16le",
        sample_rate: SAMPLE_RATE,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cartesia ${res.status}: ${body.slice(0, 200)}`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  log.info(`synthesized ${text.length} chars in ${Date.now() - started}ms`);
  if (cacheable) cache.set(text, audio);
  return audio;
}

export function wavDurationMs(wav: Buffer) {
  return Math.round(((wav.length - 44) / (SAMPLE_RATE * 2)) * 1000);
}
