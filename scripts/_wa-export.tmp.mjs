import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
const dir = process.argv[2], name = "whatsapp_messages";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const data = `${dir}/${name}.jsonl`, cur = `${dir}/${name}.cursor`, done = `${dir}/${name}.done`;
const plain = (v) => v instanceof Timestamp ? v.toDate().toISOString() : Array.isArray(v) ? v.map(plain)
  : v && typeof v === "object" ? (typeof v.toDate === "function" ? v.toDate().toISOString()
  : Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, plain(x)]))) : v;
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
const db = getFirestore(initializeApp({ credential: cert(sa) }));
let last = existsSync(cur) ? readFileSync(cur, "utf8").trim() : "";
let n = 0;
for (;;) {
  let q = db.collection(name).orderBy("__name__").limit(500);
  if (last) q = q.startAfter(last);
  let snap;
  try { snap = await q.get(); } catch (e) { console.log(`STOPPED after ${n} this run (last=${last}): ${String(e.message).slice(0, 80)}`); process.exit(3); }
  if (snap.empty) break;
  appendFileSync(data, snap.docs.map((d) => JSON.stringify({ id: d.id, data: plain(d.data()) })).join("\n") + "\n");
  last = snap.docs[snap.docs.length - 1].id; writeFileSync(cur, last); n += snap.size;
  if (n % 5000 < 500) console.log("saved", n);
  if (snap.size < 500) break;
}
writeFileSync(done, String(Date.now())); console.log("DONE this run:", n);
