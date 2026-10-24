"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Receives Jarvis's voice from the orchestrator over a WebSocket and plays it with Web Audio.
 * Protocol: a JSON text frame {"type":"play","id"} is followed by one binary WAV frame;
 * {"type":"stop"} cuts playback. The page reports {"type":"ended","id"} when a clip finishes.
 */
export function useVoice(meetingId: string) {
  const [level, setLevel] = useState(0);
  const [connected, setConnected] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_ORCHESTRATOR_WS_URL;
    if (!base) return;

    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.connect(ctx.destination);
    const buf = new Uint8Array(analyser.fftSize);

    let ws: WebSocket | null = null;
    let closed = false;
    let pendingId: string | null = null;
    let current: AudioBufferSourceNode | null = null;
    let queue: Promise<void> = Promise.resolve();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;

    const tryResume = () => {
      if (ctx.state === "suspended") void ctx.resume();
      setAudioBlocked(ctx.state === "suspended");
    };
    tryResume();
    const resumeTimer = setInterval(tryResume, 1000);
    window.addEventListener("pointerdown", tryResume);

    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      setLevel((prev) => prev * 0.6 + Math.min(1, rms * 4) * 0.4);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const send = (msg: object) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    const play = (id: string, data: ArrayBuffer) => {
      queue = queue.then(async () => {
        try {
          tryResume();
          const audio = await ctx.decodeAudioData(data);
          await new Promise<void>((resolve) => {
            const src = ctx.createBufferSource();
            src.buffer = audio;
            src.connect(analyser);
            current = src;
            src.onended = () => {
              current = null;
              resolve();
            };
            send({
              type: "started",
              id,
              durationMs: Math.round(audio.duration * 1000),
            });
            src.start();
          });
        } catch (e) {
          console.error("Audio playback failed", e);
        }
        send({ type: "ended", id });
      });
    };

    const connect = () => {
      const url = `${base.replace(/\/$/, "")}/audio?meetingId=${encodeURIComponent(meetingId)}`;
      ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          const msg = JSON.parse(ev.data) as { type: string; id?: string };
          if (msg.type === "play" && msg.id) pendingId = msg.id;
          if (msg.type === "stop") {
            try {
              current?.stop();
            } catch {
              // already stopped
            }
          }
          if (msg.type === "ping") send({ type: "pong" });
          return;
        }
        if (pendingId) {
          play(pendingId, ev.data as ArrayBuffer);
          pendingId = null;
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(resumeTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", tryResume);
      ws?.close();
      void ctx.close();
    };
  }, [meetingId]);

  return { level, connected, audioBlocked };
}
