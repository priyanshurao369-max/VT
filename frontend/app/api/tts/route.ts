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
    console.log("TTS Request:", { text, voice });
    
    // Direct implementation to avoid 403 from the edge-tts library's headers
    const crypto = await import("crypto");
    const { WebSocket } = await import("ws");
    const uuid = () => crypto.randomUUID().replace(/-/g, "");
    
    const baseUrl = `speech.platform.bing.com/consumer/speech/synthesize/readaloud`;
    const token = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    const webSocketURL = `wss://${baseUrl}/edge/v1?TrustedClientToken=${token}&ConnectionId=${uuid()}`;
    
    const audio = await new Promise<Buffer>((resolve, reject) => {
      const ws = new WebSocket(webSocketURL, {
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-cache",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
          "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        },
      });

      const audioData: Buffer[] = [];
      ws.on("open", () => {
        const configMessage = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":false},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
        ws.send(configMessage, () => {
          const ssmlMessage = `X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${text}</prosody></voice></speak>`;
          ws.send(ssmlMessage);
        });
      });

      ws.on("message", (data: any, isBinary: boolean) => {
        if (isBinary) {
          const raw = data as Buffer;
          const separator = "Path:audio\r\n";
          const index = raw.indexOf(separator);
          if (index !== -1) {
            audioData.push(raw.subarray(index + separator.length));
          }
        } else {
          const message = data.toString();
          if (message.includes("turn.end")) {
            ws.close();
            resolve(Buffer.concat(audioData));
          }
        }
      });

      ws.on("error", (e: Error) => {
        console.error("WS Error:", e);
        reject(e);
      });
      
      // Safety timeout
      setTimeout(() => {
        if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
          ws.close();
          reject(new Error("TTS Timeout"));
        }
      }, 15000);
    });

    console.log("TTS Success, audio size:", audio.length);
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("TTS Route Error:", e);
    return NextResponse.json({ error: "TTS failed", details: String(e) }, { status: 500 });
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
