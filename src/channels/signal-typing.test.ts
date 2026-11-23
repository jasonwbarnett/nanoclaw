import { createServer, type Socket } from 'node:net';
import { expect, it, vi } from 'vitest';
import { createSignalAdapter } from './signal.js';

it('sends typing to group IDs and preserves direct-message recipients', async () => {
  const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n');
        const request = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        requests.push(request);
        socket.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: {} }) + '\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP address');
  const adapter = createSignalAdapter({
    cliPath: 'signal-cli',
    account: '+15555550123',
    tcpHost: '127.0.0.1',
    tcpPort: address.port,
    manageDaemon: false,
    signalDataDir: '/tmp',
  });
  const onAction = vi.fn(async () => 'refused' as const);
  const onInbound = vi.fn();
  try {
    await adapter.setup({ onInbound, onInboundEvent: () => {}, onMetadata: () => {}, onAction });
    await adapter.setTyping!('group:abc123=', null);
    await adapter.setTyping!('+15555550456', null);
    expect(requests.filter((r) => r.method === 'sendTyping').map((r) => r.params)).toEqual([
      { account: '+15555550123', groupId: ['abc123='] },
      { account: '+15555550123', recipient: ['+15555550456'] },
    ]);
    await adapter.deliver('+15555550456', null, {
      kind: 'chat-sdk',
      content: {
        type: 'ask_question',
        questionId: 'appr-test',
        title: 'Install Packages',
        question: 'Install ffmpeg?',
        options: [
          { label: 'Approve', value: 'approve' },
          { label: 'Reject', value: 'reject' },
        ],
      },
    });
    const card = requests.find((r) => r.method === 'send');
    expect(card?.params.message).toContain('/respond appr-test approve');
    expect(card?.params.message).toContain('/respond appr-test reject');
    for (const socket of sockets)
      socket.write(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'receive',
          params: {
            envelope: {
              sourceNumber: '+15555550456',
              dataMessage: { message: '/respond appr-test approve', timestamp: 12345 },
            },
          },
        }) + '\n',
      );
    await vi.waitFor(() =>
      expect(onAction).toHaveBeenCalledWith('appr-test', 'approve', 'signal:+15555550456', {
        platformId: '+15555550456',
        threadId: null,
      }),
    );
    await vi.waitFor(() =>
      expect(requests.some((r) => r.method === 'send' && String(r.params.message).includes('not authorized'))).toBe(
        true,
      ),
    );
    expect(onInbound).not.toHaveBeenCalled();
    await adapter.teardown();
    await adapter.setTyping!('group:abc123=', null);
    expect(requests.filter((r) => r.method === 'sendTyping')).toHaveLength(2);
  } finally {
    await adapter.teardown();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
