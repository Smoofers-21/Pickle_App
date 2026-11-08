import { randomInt } from "node:crypto";
import { CODE_ALPHABET, CODE_LENGTH, cleanName } from "@/lib/lobby-rules";
import { fail, ok, route, tooMany } from "@/lib/server/api";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { db } from "@/lib/server/supabase";

function newCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

// Create a lobby: the person creating it becomes the host.
export const POST = route(async ({ request, body, device }) => {
  const name = cleanName(body.name);
  if (!name) return fail(400, "bad_name", "Use 1–20 letters or numbers for your name.");
  if (!(await allow(request, device.hash, LIMITS.create))) return tooMany();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { data, error } = await db().rpc("create_lobby", {
      p_code: code,
      p_name: name,
      p_device_hash: device.hash,
    });
    if (error) throw error;
    if (data?.error === "code_taken") continue;
    return ok({ code, memberId: data.member_id, name }, device);
  }
  throw new Error("Could not find a free lobby code");
});
