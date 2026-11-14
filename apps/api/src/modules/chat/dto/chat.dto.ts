import { ChatRequest, ChatResponse } from '@hey-jenna/contracts';

/** POST /rooms/:roomId/chat: `{ message, history? }` → `{ reply, actions[] }`. */
export const ChatRequestSchema = ChatRequest;
export type ChatRequestDto = ChatRequest;
export type ChatResponseDto = ChatResponse;
