import { ChatResponse, ChatTurn } from '@hey-jenna/contracts';
import { ChatTools } from '../chat-tools';

export interface ChatInput {
  message: string;
  history: ChatTurn[];
  tools: ChatTools;
  /** Home budget and this room's share, when the project has one. Empty otherwise. */
  budgetNote?: string;
}

/** Answers one chat message, acting through `tools`. Claude when a key is set, rules otherwise. */
export interface ChatAssistant {
  reply(input: ChatInput): Promise<Pick<ChatResponse, 'reply'>>;
}

export const CHAT_ASSISTANT = Symbol('CHAT_ASSISTANT');
