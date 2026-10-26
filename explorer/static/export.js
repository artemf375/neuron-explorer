// ---------- chat export ----------
// The Chat tab's thread as a file: JSON (OpenAI Chat Completions messages, steering alongside), HTML (a standalone page),
// PDF (that page through the browser's print dialog: "Save as PDF") or TXT. Every reply carries the steering it was made with.

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const doseText = x => x.mode === "mul" ? `×${x.dose}` : `${x.dose > 0 ? "+" : x.dose < 0 ? "−" : ""}${Math.abs(x.dose)}`;
const pushesUp = x => (x.mode === "mul" ? x.dose - 1 : x.dose) > 0;
const pad = v => String(v).padStart(2, "0");
const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const when = d => d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// turns worth keeping: anything with a reply (a stopped reply is kept as far as it got), or an error to show
const turnsOf = thread => thread.filter(t => !t.live && (t.reply || t.error));

function recipe(t, nameOf) {
  return t.neurons.map(x => ({ neuron: `L${x.layer} N${x.n}`, layer: x.layer, n: x.n, mode: x.mode, dose: x.dose, name: nameOf(x.layer, x.n) || null }));
}
const recipeLine = r => r.length ? `steered: ${r.map(x => `${x.neuron} ${doseText(x)}${x.name ? ` (${x.name})` : ""}`).join(", ")}` : "plain model";

function toJSON({ turns, model, nameOf, at }) {
  const messages = [], steering = [];
  for (const t of turns) {
    if (!t.reply) continue;  // a failed turn has no assistant message; dropping its question keeps user/assistant alternating
    messages.push({ role: "user", content: t.user });
    messages.push({ role: "assistant", content: t.reply });
    steering.push({ message_index: messages.length - 1, neurons: recipe(t, nameOf).map(({ neuron, ...x }) => x) });
  }
  // `model` / `messages` / `temperature` / `max_tokens` are a valid Chat Completions request; the rest is this tool's context
  return JSON.stringify({
    model, messages, temperature: 0, max_tokens: 300,
    steering, steering_units: { add: "dose in units of the layer's median residual norm", mul: "activation multiplier (0 ablates, −1 flips)" },
    exported_at: at.toISOString(),
  }, null, 2);
}

function toTXT({ turns, model, nameOf, at }) {
  const rule = "─".repeat(64);
  const out = [`Chat with ${model}`, `Exported ${when(at)} · ${turns.length} turn${turns.length === 1 ? "" : "s"} · greedy decoding`, ""];
  turns.forEach((t, i) => {
    out.push(rule, "", `[${i + 1}] You`, t.user, "", `[${i + 1}] ${model} · ${recipeLine(recipe(t, nameOf))}`);
    if (t.reply) out.push(t.reply);
    if (t.error) out.push(`(error: ${t.error})`);
    out.push("");
  });
  return out.join("\n");
}

function toHTML({ turns, model, nameOf, at }) {
  const used = new Set(turns.flatMap(t => t.neurons.map(x => `L${x.layer} N${x.n}`)));
  const chips = r => r.length
    ? r.map(x => `<span class="chip ${pushesUp(x) ? "up" : "down"}"><b>${x.neuron}</b> ${doseText(x)}${x.name ? ` <i>${esc(x.name)}</i>` : ""}</span>`).join("")
    : `<span class="chip">plain model</span>`;
  const body = turns.map((t, i) => `
  <section class="turn">
    <div class="who">You <span>${i + 1}</span></div>
    <div class="user">${esc(t.user)}</div>
    <div class="who">${esc(model)}</div>
    <div class="recipe">${chips(recipe(t, nameOf))}</div>
    ${t.reply ? `<div class="reply">${esc(t.reply)}</div>` : ""}
    ${t.error ? `<div class="err">${esc(t.error)}</div>` : ""}
  </section>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chat with ${esc(model)} · ${stamp(at)}</title>
<style>
  :root { --ink: #1c1d1f; --dim: #6b6e73; --faint: #a3a6ab; --line: #e7e8ea; --raise: #f4f5f6; --up: #c77700; --down: #d0246a;
    --font: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; --mono: ui-monospace, "SF Mono", Menlo, monospace; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: var(--ink); font: 15px/1.6 var(--font); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  main { max-width: 760px; margin: 0 auto; padding: 56px 28px 72px; }
  header { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 32px; }
  h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 6px; }
  h1 span { font-family: var(--mono); font-size: 0.8em; font-weight: 500; }
  .meta { color: var(--dim); font-size: 13px; }
  .turn { margin-bottom: 30px; break-inside: avoid-page; }
  .who { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--faint); margin: 0 0 6px; }
  .who span { font-family: var(--mono); margin-left: 4px; }
  .user { background: var(--raise); border-radius: 12px; padding: 10px 14px; margin-bottom: 18px; white-space: pre-wrap; word-break: break-word; }
  .recipe { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
  .chip { font-size: 11.5px; color: var(--dim); background: var(--raise); border-radius: 4px; padding: 2px 8px; font-family: var(--mono); }
  .chip b { color: var(--ink); font-weight: 500; }
  .chip i { font-family: var(--font); font-style: normal; color: var(--dim); }
  .chip.up { box-shadow: inset 3px 0 0 var(--up); } .chip.down { box-shadow: inset 3px 0 0 var(--down); }
  .reply { white-space: pre-wrap; word-break: break-word; padding-left: 14px; border-left: 2px solid var(--line); }
  .err { color: #c0392b; font-size: 13px; margin-top: 6px; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--faint); font-size: 12px; }
  @page { margin: 18mm 16mm; }
  @media print { main { padding: 0; max-width: none; } }
</style></head>
<body><main>
  <header>
    <h1>Chat with <span>${esc(model)}</span></h1>
    <div class="meta">${when(at)} · ${turns.length} turn${turns.length === 1 ? "" : "s"} · ${used.size ? `${used.size} neuron${used.size === 1 ? "" : "s"} steered` : "plain model"} · greedy decoding</div>
  </header>${body}
  <footer>Exported from Neuron Explorer. Add: dose in units of the layer's median residual norm · ×: activation multiplier (0 ablates, −1 flips).</footer>
</main></body></html>`;
}

function download(text, type, name) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// PDF without a dependency: the HTML page in a hidden frame, printed (the browser's dialog offers "Save as PDF")
function printPDF(html) {
  const f = Object.assign(document.createElement("iframe"), { srcdoc: html });
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  f.onload = () => {
    const w = f.contentWindow;
    w.addEventListener("afterprint", () => f.remove());
    w.focus(); w.print();
    setTimeout(() => f.isConnected && f.remove(), 60000);
  };
  document.body.append(f);
}

export const FORMATS = [
  { id: "json", label: "JSON", hint: "Chat Completions messages" },
  { id: "html", label: "HTML", hint: "standalone page" },
  { id: "pdf", label: "PDF", hint: "print → Save as PDF" },
  { id: "txt", label: "TXT", hint: "plain transcript" },
];

export function exportChat(fmt, { thread, model, nameOf }) {
  const at = new Date(), turns = turnsOf(thread), ctx = { turns, model, nameOf, at };
  if (!turns.length) return false;
  const base = `chat-${stamp(at)}`;
  if (fmt === "json") download(toJSON(ctx), "application/json", `${base}.json`);
  else if (fmt === "html") download(toHTML(ctx), "text/html", `${base}.html`);
  else if (fmt === "txt") download(toTXT(ctx), "text/plain", `${base}.txt`);
  else if (fmt === "pdf") printPDF(toHTML(ctx));
  return true;
}
