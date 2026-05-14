import axios from "axios";
import OpenAI from "openai";

const DOWNLOAD_TIMEOUT_MS = 20_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;

export async function transcribeAudio(fileUrl: string): Promise<string> {
  const openai = new OpenAI({ timeout: TRANSCRIBE_TIMEOUT_MS });

  const res = await axios.get<ArrayBuffer>(fileUrl, {
    responseType: "arraybuffer",
    timeout: DOWNLOAD_TIMEOUT_MS,
  });
  const audioBuffer = Buffer.from(res.data);

  const file = await OpenAI.toFile(audioBuffer, "voice.oga");

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });

  return (transcription.text || "").trim();
}
