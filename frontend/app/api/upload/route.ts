import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

export const runtime = "nodejs";

type PageBlock = { page: number; text: string };

function normalizeParagraphs(raw: string): string {
  const blocks = raw.split(/\n\n/);
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.trim()) {
      parts.push(block.split(/\r?\n/).map((l) => l.trim()).join(" ").replace(/\s+/g, " ").trim());
    }
  }
  return parts.join("\n\n");
}

function parseTxt(buf: Buffer): PageBlock[] {
  const text = buf.toString("utf-8");
  const blocks = text.split("\n\n");
  let resultText = "";
  for (const block of blocks) {
    if (block.trim()) {
      resultText += block.split(/\r?\n/).join(" ") + "\n\n";
    }
  }
  if (!resultText.trim()) return [];
  return [{ page: 1, text: resultText.trim() }];
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { message: "Invalid form data", content: [{ page: 1, text: "Request body too large or malformed." }] },
      { status: 413 }
    );
  }

  const entry = form.get("file");
  if (!entry || !(entry instanceof File)) {
    return NextResponse.json({ message: "No file", content: [] }, { status: 400 });
  }

  const filename = entry.name || "";
  const buf = Buffer.from(await entry.arrayBuffer());

  if (filename.toLowerCase().endsWith(".txt")) {
    try {
      const content = parseTxt(buf);
      if (content.length === 0) {
        return NextResponse.json({ message: "Success", content: [{ page: 1, text: "" }] });
      }
      return NextResponse.json({ message: "Success", content });
    } catch (e) {
      return NextResponse.json({
        message: "Error reading text",
        content: [{ page: 1, text: String(e) }],
      });
    }
  }

  const lower = filename.toLowerCase();
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    const worker = await createWorker("eng");
    try {
      const {
        data: { text },
      } = await worker.recognize(buf);
      const blocks = text.split("\n\n");
      let resultText = "";
      for (const block of blocks) {
        if (block.trim()) {
          resultText += block.split(/\r?\n/).join(" ") + "\n\n";
        }
      }
      const text_content: PageBlock[] = [];
      if (resultText.trim()) {
        text_content.push({ page: 1, text: resultText.trim() });
      }
      if (text_content.length === 0) {
        text_content.push({ page: 1, text: "No text detected in image." });
      }
      return NextResponse.json({ message: "Success", content: text_content });
    } catch (e) {
      let errorMsg = String(e);
      if (errorMsg.toLowerCase().includes("tesseract")) {
        errorMsg =
          "Tesseract OCR failed. Ensure tesseract.js can load its worker (network) or try a smaller image.";
      }
      return NextResponse.json({
        message: "Error reading image",
        content: [{ page: 1, text: `Error: Could not read image. ${errorMsg}` }],
      });
    } finally {
      await worker.terminate();
    }
  }

  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    const text_content: PageBlock[] = [];
    for (const p of result.pages) {
      const normalized = normalizeParagraphs(p.text);
      if (normalized) {
        text_content.push({ page: p.num, text: normalized });
      }
    }
    if (text_content.length === 0) {
      return NextResponse.json({
        message: "Success",
        content: [{ page: 1, text: "No readable text found in this PDF." }],
      });
    }
    console.log("Upload Success, content size:", text_content.length);
    return NextResponse.json({ message: "Success", content: text_content });
  } catch (e) {
    console.error("Upload Route Error:", e);
    return NextResponse.json({
      message: "Error extracting text",
      content: [
        {
          page: 1,
          text: `Error: Could not read as PDF. (${String(e)})`,
        },
      ],
    }, { status: 500 });
  } finally {
    await parser.destroy();
  }
}
