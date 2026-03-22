import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

async function loadEdgeTts() {
  return import("edge-tts/out/index.js");
}

function escapeForSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawText = searchParams.get("text") ?? "";
  const voice = searchParams.get("voice") ?? "en-US-AriaNeural";

  if (!rawText.trim()) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const text = escapeForSsml(rawText);

  try {
    const { tts } = await loadEdgeTts();
    const audio = await tts(text, { voice });
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("TTS Error:", e);
    return NextResponse.json({ error: "TTS failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { text?: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawText = body.text ?? "";
  const voice = body.voice ?? "en-US-AriaNeural";

  if (!rawText.trim()) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const text = escapeForSsml(rawText);

  try {
    const { tts } = await loadEdgeTts();
    const audio = await tts(text, { voice });
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (e) {
    console.error("TTS Error:", e);
    return NextResponse.json({ error: "TTS failed" }, { status: 500 });
  }
}
