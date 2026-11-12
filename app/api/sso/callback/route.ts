import { NextRequest } from "next/server";
import { finishSso } from "@/lib/ssoFlow";

// Amethyst sends the browser back here with a signed pass.
export const GET = (req: NextRequest) => finishSso(req);
