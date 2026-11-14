import Anthropic from '@anthropic-ai/sdk';
import { HttpException, Logger } from '@nestjs/common';
import { FURNITURE_TYPES, StyleDialsPatch } from '@hey-jenna/contracts';
import { SearchListingsSchema } from '../../sourcing/dto/search-listings.dto';
import { ChatTools } from '../chat-tools';
import { ChatAssistant, ChatInput } from './chat-assistant';

const MAX_ROUNDS = 6;

const SYSTEM = `You are Jenna, an interior designer helping someone furnish one room.
Use the tools to read or change the room's style, search for real furniture, lay out the room and read the shopping list.
Only change style dials when the person asks for a change. Keep replies short and friendly, plain text, no markdown.`;

const EMPTY = { type: 'object' as const, properties: {}, additionalProperties: false };

const TOOLS: Anthropic.Beta.BetaTool[] = [
  { name: 'get_style', description: "Read the room's style: name, palette (60/30/10 hex colours), vibe, keywords and all style dials.", input_schema: EMPTY },
  {
    name: 'update_style_dials',
    description:
      'Tweak style dials (same as PATCH /style). Pass only the dials to change, e.g. {"plant_amount": 0.8, "palette_temperature": 0.7, "rug_type": "jute_sisal"}. ' +
      'Continuous dials are 0..1; read get_style first to see the dial names and current values.',
    input_schema: { type: 'object', properties: { dials: { type: 'object', description: 'dial name → new value' } }, required: ['dials'] },
  },
  {
    name: 'search_listings',
    description: 'Search every product source for furniture in this style. Omit types to search the whole shopping list.',
    input_schema: {
      type: 'object',
      properties: {
        types: { type: 'array', items: { type: 'string', enum: [...FURNITURE_TYPES] } },
        perType: { type: 'integer', minimum: 1, maximum: 20 },
        maxPrice: { type: 'number', description: 'CAD' },
      },
      additionalProperties: false,
    },
  },
  { name: 'generate_layout', description: 'Lay out the room with the picked products. Returns fit checks and anything left out. Takes several seconds.', input_schema: EMPTY },
  { name: 'get_shopping_list', description: "Read the newest layout's shopping list: items, prices, total, missing pieces.", input_schema: EMPTY },
];

/** Minimal client surface, so tests can pass a fake. */
export type ChatClient = Pick<Anthropic, 'beta'>;

/** Claude with tool use over the existing services. Same model and fallback setup as the moodboard reader. */
export class ClaudeChatAssistant implements ChatAssistant {
  private readonly log = new Logger(ClaudeChatAssistant.name);

  constructor(private readonly client: ChatClient, private readonly model: string) {}

  async reply({ message, history, tools, budgetNote }: ChatInput) {
    const firstUser = history.findIndex((t) => t.role === 'user');
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...(firstUser < 0 ? [] : history.slice(firstUser)).map((t) => ({ role: t.role, content: t.content })),
      { role: 'user', content: message },
    ];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: budgetNote ? `${SYSTEM}\n\n${budgetNote}` : SYSTEM,
        tools: TOOLS,
        messages,
      });
      if (response.stop_reason === 'refusal') throw new Error('Claude declined this message');

      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || !calls.length) return { reply: textOf(response.content) };

      // pass the assistant turn back unchanged (thinking blocks included), then every result in one user turn
      messages.push({ role: 'assistant', content: response.content });
      const results = await Promise.all(calls.map((c) => this.run(c, tools)));
      messages.push({ role: 'user', content: results });
    }
    this.log.warn('chat hit the tool round limit');
    return { reply: "I've made the changes I could; tell me what to do next." };
  }

  private async run(call: Anthropic.Beta.BetaToolUseBlock, tools: ChatTools): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
    try {
      const out = await this.dispatch(call.name, call.input, tools);
      return { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out) };
    } catch (e) {
      if (!(e instanceof HttpException) && !(e instanceof ToolInputError)) throw e;
      return { type: 'tool_result', tool_use_id: call.id, content: (e as Error).message, is_error: true };
    }
  }

  private dispatch(name: string, input: unknown, tools: ChatTools) {
    switch (name) {
      case 'get_style':
        return tools.readStyle();
      case 'update_style_dials': {
        const dials = StyleDialsPatch.safeParse((input as { dials?: unknown })?.dials);
        if (!dials.success) throw new ToolInputError(dials.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
        return tools.updateDials(dials.data);
      }
      case 'search_listings': {
        const dto = SearchListingsSchema.safeParse(input ?? {});
        if (!dto.success) throw new ToolInputError(dto.error.message);
        return tools.searchListings(dto.data);
      }
      case 'generate_layout':
        return tools.generateLayout();
      case 'get_shopping_list':
        return tools.shoppingList();
      default:
        throw new ToolInputError(`Unknown tool ${name}`);
    }
  }
}

class ToolInputError extends Error {}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
