"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { extractText, getDocumentProxy } from "unpdf";

const AGENTMAIL_BASE = process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0";

/**
 * Download every attachment on an inbound reply into Convex file storage,
 * extract PDF text for the parser, then hand the quote to the AI parser.
 * Runs in the Node runtime for the PDF library.
 */
export const ingestForQuote = internalAction({
  args: {
    quoteId: v.id("quotes"),
    inboxId: v.string(),
    messageId: v.string(),
    attachments: v.array(
      v.object({
        attachmentId: v.string(),
        filename: v.string(),
        contentType: v.string(),
        size: v.number(),
      }),
    ),
    maxBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const notes: string[] = [];
    const extracted: string[] = [];
    for (const att of args.attachments) {
      if (att.size > args.maxBytes) {
        notes.push(
          `Attachment ${att.filename} (${Math.round(att.size / 1024 / 1024)} MB) exceeds the ${Math.round(args.maxBytes / 1024 / 1024)} MB limit and was not stored.`,
        );
        continue;
      }
      try {
        const bytes = await downloadAttachment(args.inboxId, args.messageId, att.attachmentId);
        if (bytes.byteLength > args.maxBytes) {
          notes.push(`Attachment ${att.filename} exceeded the size limit on download and was not stored.`);
          continue;
        }
        const blob = new Blob([bytes as unknown as ArrayBuffer], { type: att.contentType });
        const storageId = await ctx.storage.store(blob);
        let text: string | undefined;
        if (att.contentType === "application/pdf" || att.filename.toLowerCase().endsWith(".pdf")) {
          text = await pdfText(bytes);
          if (text.trim()) extracted.push(`--- ${att.filename} ---\n${text}`);
          else notes.push(`No selectable text found in ${att.filename}.`);
        }
        await ctx.runMutation(internal.quotes.addAttachment, {
          quoteId: args.quoteId,
          storageId,
          filename: att.filename,
          contentType: att.contentType,
          size: bytes.byteLength,
          extractedText: text?.slice(0, 60_000),
        });
      } catch (err) {
        notes.push(`Could not fetch ${att.filename}: ${(err as Error).message}`);
      }
    }
    await ctx.runMutation(internal.quotes.attachmentsReady, {
      quoteId: args.quoteId,
      notes: notes.length ? notes.join(" ") : undefined,
      extraText: extracted.length ? extracted.join("\n\n") : undefined,
    });
    await ctx.scheduler.runAfter(0, internal.ai.parseQuote, { quoteId: args.quoteId });
  },
});

async function downloadAttachment(
  inboxId: string,
  messageId: string,
  attachmentId: string,
): Promise<Uint8Array> {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) throw new Error("AGENTMAIL_API_KEY is not set.");
  const url = `${AGENTMAIL_BASE}/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    throw new Error(`AgentMail attachment download failed: HTTP ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return typeof text === "string" ? text : (text as string[]).join("\n");
}
