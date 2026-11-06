import { NextRequest, NextResponse } from "next/server";
import { getLenderBanks, rememberLenderBanks } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";
import { cleanBankName, MAX_BANK_NAME_LENGTH } from "@/lib/lender-banks";

/** The lender banks to offer: the built-in list plus every name saved before. Open to any signed-in user. */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);
  try {
    return NextResponse.json({ success: true, data: await getLenderBanks() });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** Saves a typed bank name so it is offered next time. Same permission as entering logins. */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);
  const permError = requirePermission(auth, "logins:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const name = cleanBankName(body?.name);
    if (!name) {
      return NextResponse.json(
        { success: false, error: `Enter a bank name of up to ${MAX_BANK_NAME_LENGTH} characters.` },
        { status: 400 }
      );
    }
    await rememberLenderBanks([name], auth.actor?.name || auth.session?.name || "User");
    return NextResponse.json({ success: true, data: await getLenderBanks() });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
