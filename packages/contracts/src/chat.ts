import { z } from 'zod';
import { FurnitureType } from './furniture';

/** One earlier turn. The server stores no chat history: the client sends it back each time. */
export const ChatTurn = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});
export type ChatTurn = z.infer<typeof ChatTurn>;

/** POST /rooms/:roomId/chat */
export const ChatRequest = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(ChatTurn).max(40).default([]),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

/** What Jenna did while answering, so a UI knows what to refresh. */
export const ChatAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('style_read') }),
  z.object({ type: z.literal('style_updated'), dials: z.record(z.unknown()) }),
  z.object({ type: z.literal('listings_searched'), types: z.array(FurnitureType), kept: z.number().int() }),
  z.object({ type: z.literal('layout_generated'), layoutId: z.string() }),
  z.object({ type: z.literal('layout_read'), layoutId: z.string() }),
  z.object({ type: z.literal('shopping_list_read'), layoutId: z.string(), total: z.number(), currency: z.string() }),
]);
export type ChatAction = z.infer<typeof ChatAction>;

export const ChatResponse = z.object({
  reply: z.string(),
  actions: z.array(ChatAction),
});
export type ChatResponse = z.infer<typeof ChatResponse>;
