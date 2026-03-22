from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse
import fitz # PyMuPDF
from fastapi.middleware.cors import CORSMiddleware
import edge_tts
import asyncio
import io
import pytesseract
from PIL import Image

app = FastAPI()

# Allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "app": "audiobook-reader minimal backend"}

@app.post("/api/upload")
async def upload_book(file: UploadFile = File(...)):
    content = await file.read()
    text_content = []
    
    # Check if text file
    if file.filename and file.filename.endswith(".txt"):
        try:
            text = content.decode("utf-8")
            # For txt files, keep everything as a single page or chunk by double-newline
            blocks = text.split("\n\n")
            result_text = ""
            for block in blocks:
                if block.strip():
                    # Replace single newlines within a block with spaces to form paragraphs
                    clean_block = " ".join(block.splitlines())
                    result_text += clean_block + "\n\n"
            if result_text.strip():
                text_content.append({"page": 1, "text": result_text.strip()})
            return {"message": "Success", "content": text_content}
        except Exception as e:
            return {"message": "Error reading text", "content": [{"page": 1, "text": str(e)}]}

    # Check if image file
    if file.filename and file.filename.lower().endswith((".png", ".jpg", ".jpeg")):
        try:
            image = Image.open(io.BytesIO(content))
            text = pytesseract.image_to_string(image)
            # Group into single page processing double newlines
            blocks = text.split("\n\n")
            result_text = ""
            for block in blocks:
                if block.strip():
                    clean_block = " ".join(block.splitlines())
                    result_text += clean_block + "\n\n"
            if result_text.strip():
                text_content.append({"page": 1, "text": result_text.strip()})
            if not text_content:
                text_content.append({"page": 1, "text": "No text detected in image."})
            return {"message": "Success", "content": text_content}
        except Exception as e:
            error_msg = str(e)
            if "tesseract is not installed" in error_msg.lower():
                error_msg = "Tesseract OCR binary is not installed on the system. Please install Tesseract-OCR and add it to your PATH."
            return {"message": "Error reading image", "content": [{"page": 1, "text": f"Error: Could not read image. {error_msg}"}]}
    
    try:
        # Check PDF signature or try opening with PyMuPDF
        signature = content[:4]
        if signature != b'%PDF':
            # It might not be a PDF, but let's see if fitz can open it. If not, it will throw an exception.
            pass
            
        doc = fitz.open(stream=content, filetype="pdf")
        for page_num in range(len(doc)):
            page = doc[page_num]
            # Use get_text("blocks") to preserve paragraph structure
            blocks = page.get_text("blocks")
            page_text = ""
            for block in blocks:
                # Block text is at index 4
                block_text = block[4]
                if block_text.strip():
                    # Replace single newlines within the block with spaces
                    clean_block = " ".join(block_text.splitlines())
                    page_text += clean_block.strip() + "\n\n"
                    
            if page_text.strip():
                text_content.append({"page": page_num + 1, "text": page_text.strip()})
                
        if not text_content:
             return {"message": "Success", "content": [{"page": 1, "text": "No readable text found in this PDF."}]}
             
    except Exception as e:
        # fitz throws fitz.FileDataError or RuntimeError when the stream is not a valid PDF
        return {"message": "Error extracting text", "content": [{"page": 1, "text": f"Error: Could not read as PDF. The file might be corrupted or not a valid PDF document. ({str(e)})"}]}
        
    return {"message": "Success", "content": text_content}

@app.get("/api/tts")
async def text_to_speech_get(text: str = "", voice: str = "en-US-AriaNeural"):
    if not text.strip():
        return {"error": "No text provided"}
    
    async def audio_generator():
        try:
            communicate = edge_tts.Communicate(text, voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
        except Exception as e:
            print(f"TTS Error: {e}")

    return StreamingResponse(
        audio_generator(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

@app.post("/api/tts")
async def text_to_speech(body: dict):
    text = body.get("text", "")
    voice = body.get("voice", "en-US-AriaNeural")
    
    if not text.strip():
        return {"error": "No text provided"}
    
    async def audio_generator():
        try:
            communicate = edge_tts.Communicate(text, voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
        except Exception as e:
            print(f"TTS Error: {e}")

    return StreamingResponse(
        audio_generator(),
        media_type="audio/mpeg"
    )

@app.get("/api/voices")
async def list_voices():
    voices = await edge_tts.list_voices()
    # Return a curated list of popular English voices
    english_voices = [v for v in voices if v["Locale"] == "en-US"]
    return [{"name": v["ShortName"], "gender": v["Gender"], "locale": v["Locale"]} for v in english_voices]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
