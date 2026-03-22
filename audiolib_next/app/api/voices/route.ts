import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { getVoices } = await import("edge-tts/out/index.js");
    const voices = await getVoices();
    const list = Array.isArray(voices) ? voices : [];
    const englishVoices = list.filter((v) => v.Locale === "en-US");
    const data = englishVoices.map((v) => ({
      name: v.ShortName,
      gender: v.Gender,
      locale: v.Locale,
    }));
    return NextResponse.json(data);
  } catch (e) {
    console.error("Voices list error:", e);
    return NextResponse.json([]);
  }
}
