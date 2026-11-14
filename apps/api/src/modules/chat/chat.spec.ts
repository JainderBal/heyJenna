import { NotFoundException } from '@nestjs/common';
import { ChatRequest, DIAL_DEFAULTS } from '@hey-jenna/contracts';
import { ChatClient, ClaudeChatAssistant } from './assistant/claude-chat.assistant';
import { mentionedTypes, RuleChatAssistant } from './assistant/rule-chat.assistant';
import { ChatService } from './chat.service';
import { ChatTools } from './chat-tools';

const profile = {
  name: 'Warm retro', palette: { dominant: ['#F2E8D5'], secondary: ['#8A5A3B'], accent: ['#C0392B'] },
  vibe: ['cosy'], keywords: ['teak'], dials: { ...DIAL_DEFAULTS },
};
const layout = {
  id: 'L1', summary: { pass: 9, warn: 1, fail: 0 }, checks: [{ rule: 'walkway', status: 'warn', detail: 'tight by the desk' }],
  dropped: [], objects: [{}, {}],
};

function deps() {
  return {
    style: {
      get: jest.fn().mockResolvedValue({ profile }),
      update: jest.fn().mockImplementation(async (_r, _o, dto) => ({ profile: { ...profile, dials: { ...profile.dials, ...dto.dials } } })),
    },
    sourcing: {
      search: jest.fn().mockResolvedValue({
        searched: [{ type: 'sofa', query: 'teak sofa', found: 4, kept: 2 }], errors: [],
        listings: [{ type: 'sofa', title: 'Teak sofa', price: 400, currency: 'CAD', source: 'mock' }],
      }),
      budgetContext: jest.fn().mockResolvedValue(null),
    },
    layout: {
      list: jest.fn().mockResolvedValue([layout]),
      generate: jest.fn().mockResolvedValue({ ...layout, id: 'L2' }),
      shoppingList: jest.fn().mockResolvedValue({ items: [{ type: 'sofa', title: 'Teak sofa', price: 400, source: 'mock' }], total: 400, currency: 'CAD', missing: ['rug'] }),
    },
  };
}
const toolsWith = (d = deps()) => ({ d, tools: new ChatTools('room', 'me', d as never) });

describe('RuleChatAssistant', () => {
  const rules = new RuleChatAssistant();
  const ask = async (message: string, d = deps()) => {
    const { tools } = toolsWith(d);
    const { reply } = await rules.reply({ message, history: [], tools });
    return { reply, actions: tools.actions, d };
  };

  it('reads the palette', async () => {
    const r = await ask('what colours are in my palette?');
    expect(r.reply).toContain('#F2E8D5');
    expect(r.actions).toEqual([{ type: 'style_read' }]);
  });

  it('fit check uses the newest layout, or generates one', async () => {
    const r = await ask('will it all fit?');
    expect(r.reply).toContain('9 checks pass');
    expect(r.actions).toEqual([{ type: 'layout_read', layoutId: 'L1' }]);
    const d = deps();
    d.layout.list.mockResolvedValue([]);
    const r2 = await ask('does it fit', d);
    expect(r2.actions).toEqual([{ type: 'layout_generated', layoutId: 'L2' }]);
  });

  it('reads the shopping list', async () => {
    const r = await ask('how much will it cost?');
    expect(r.reply).toContain('400.00 CAD');
    expect(r.actions).toEqual([{ type: 'shopping_list_read', layoutId: 'L1', total: 400, currency: 'CAD' }]);
  });

  it('reports the home budget and this room’s share', async () => {
    const d = deps();
    d.sourcing.budgetContext.mockResolvedValue({ budgetCad: 20000, roomShare: 8000, cap: 8000, spentElsewhere: 3000 });
    const r = await ask('what is my budget?', d);
    expect(r.reply).toContain('400.00 CAD');
    expect(r.reply).toContain('Home budget 20000 CAD');
    expect(r.reply).toContain("this room's share 8000 CAD");
    expect(r.reply).toContain('other rooms 3000 CAD');
  });

  it('reports the budget even when the room has no shopping list yet', async () => {
    const d = deps();
    d.layout.list.mockResolvedValue([]);
    d.sourcing.budgetContext.mockResolvedValue({ budgetCad: 20000, roomShare: 8000, cap: 8000, spentElsewhere: 0 });
    const r = await ask('how much is the budget', d);
    expect(r.reply).toContain('Home budget 20000 CAD');
    expect(r.reply).toContain('no shopping list yet');
  });

  it('finds similar pieces of the named type', async () => {
    const r = await ask('find me a similar coffee table or sofas');
    expect(r.d.sourcing.search).toHaveBeenCalledWith('room', 'me', { types: ['sofa', 'coffee_table'], perType: 6 });
    expect(r.actions[0]).toMatchObject({ type: 'listings_searched', kept: 1 });
  });

  it('turns a missing moodboard into a reply, and helps on unknown messages', async () => {
    const d = deps();
    d.style.get.mockRejectedValue(new NotFoundException('This room has no moodboard yet'));
    expect((await ask('show my palette', d)).reply).toBe('This room has no moodboard yet');
    expect((await ask('hello')).actions).toEqual([]);
  });

  it('matches furniture types in text', () => {
    expect(mentionedTypes('a floor lamp and two plants')).toEqual(['floor_lamp', 'plant']);
  });
});

describe('ClaudeChatAssistant (mocked client)', () => {
  function fakeClient(...responses: object[]) {
    const create = jest.fn();
    for (const r of responses) create.mockResolvedValueOnce(r);
    return { client: { beta: { messages: { create } } } as unknown as ChatClient, create };
  }

  it('runs tools, feeds results back and returns the final text with actions', async () => {
    const { client, create } = fakeClient(
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Adding plants.' },
          { type: 'tool_use', id: 't1', name: 'update_style_dials', input: { dials: { plant_amount: 0.9 } } },
          { type: 'tool_use', id: 't2', name: 'search_listings', input: { types: ['plant'], perType: 3 } },
        ],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done: more plants, and I found a few.' }] },
    );
    const { d, tools } = toolsWith();
    const out = await new ClaudeChatAssistant(client, 'claude-opus-5-5').reply({
      message: 'more plants please', history: [{ role: 'assistant', content: 'Hi!' }, { role: 'user', content: 'hey' }, { role: 'assistant', content: 'hello' }], tools,
    });

    expect(out.reply).toBe('Done: more plants, and I found a few.');
    expect(d.style.update).toHaveBeenCalledWith('room', 'me', { dials: { plant_amount: 0.9 } });
    expect(d.sourcing.search).toHaveBeenCalledWith('room', 'me', { types: ['plant'], perType: 3 });
    expect(tools.actions.map((a) => a.type)).toEqual(['style_updated', 'listings_searched']);

    const first = create.mock.calls[0][0];
    expect(first.model).toBe('claude-opus-5-5');
    expect(first.messages[0]).toEqual({ role: 'user', content: 'hey' }); // leading assistant turn dropped
    const second = create.mock.calls[1][0].messages;
    expect(second.at(-1).content.map((r: { tool_use_id: string }) => r.tool_use_id)).toEqual(['t1', 't2']);
  });

  it('reports bad tool input to Claude as an error result instead of calling the service', async () => {
    const { client, create } = fakeClient(
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'update_style_dials', input: { dials: { nope: 1 } } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sorry.' }] },
    );
    const { d, tools } = toolsWith();
    await new ClaudeChatAssistant(client, 'm').reply({ message: 'x', history: [], tools });
    expect(d.style.update).not.toHaveBeenCalled();
    expect(create.mock.calls[1][0].messages.at(-1).content[0]).toMatchObject({ tool_use_id: 't1', is_error: true });
  });
});

describe('ChatService', () => {
  const req = (message: string): ChatRequest => ChatRequest.parse({ message });

  it('checks ownership, then falls back to rules when Claude fails', async () => {
    const d = deps();
    const rooms = { getOwnedRoom: jest.fn().mockResolvedValue({}) };
    const broken = { reply: jest.fn().mockRejectedValue(new Error('overloaded')) };
    const svc = new ChatService(rooms as never, d.style as never, d.sourcing as never, d.layout as never, broken);
    const out = await svc.chat('room', 'me', req('what is my palette'));
    expect(rooms.getOwnedRoom).toHaveBeenCalledWith('room', 'me');
    expect(broken.reply).toHaveBeenCalledWith(expect.objectContaining({ budgetNote: '' }));
    expect(out.actions).toEqual([{ type: 'style_read' }]);
    expect(out.reply).toContain('Warm retro');
  });

  it('refuses rooms the person does not own', async () => {
    const d = deps();
    const rooms = { getOwnedRoom: jest.fn().mockRejectedValue(new NotFoundException()) };
    const svc = new ChatService(rooms as never, d.style as never, d.sourcing as never, d.layout as never, new RuleChatAssistant());
    await expect(svc.chat('room', 'me', req('palette'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
