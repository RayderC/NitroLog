import { route } from "@/lib/api";
import { ebayEnabled } from "@/lib/ebay";
import { geminiEnabled } from "@/lib/gemini";

/** Which optional readers are on, so the part forms only offer what works. */
export const GET = route(() => ({ photos: geminiEnabled(), ebay: ebayEnabled() }));
