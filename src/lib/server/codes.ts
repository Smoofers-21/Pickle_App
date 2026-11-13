import "server-only";
import { randomInt } from "node:crypto";
import { CODE_ALPHABET, CODE_LENGTH } from "@/lib/lobby-rules";

/** A random lobby code from the no-look-alikes alphabet. */
export function newLobbyCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
