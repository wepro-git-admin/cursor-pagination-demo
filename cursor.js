import { ObjectId } from "mongodb";

export function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export function decodeCursor(token) {
  const o = JSON.parse(Buffer.from(token, "base64url").toString());
  if (o.anchor?.id) o.anchor.id = new ObjectId(o.anchor.id);
  return o;
}