const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('admin messages use a compact split workspace with an independently scrolling inbox', () => {
  const source = read('client/src/pages/admin/AdminChat.js');

  assert.match(source, /Customer messages/);
  assert.match(source, /Search customers or messages/);
  assert.match(source, /Pet purchases/);
  assert.match(source, /data-testid="admin-chat-workspace"/);
  assert.match(source, /h-\[clamp\(32rem,calc\(100dvh-16rem\),46rem\)\]/);
  assert.match(source, /data-testid="conversation-scroll-region"/);
  assert.match(source, /overflow-y-auto overscroll-contain \[scrollbar-gutter:stable\]/);
  assert.match(source, /setUnreadCount\(current => Math\.max\(0, current - conversationUnread\)\)/);
  assert.match(source, /showEmbeddedHeader=\{false\}/);
  assert.doesNotMatch(source, /FIND CUSTOMER|Select a thread|MoreVertical/);
});

test('message scrolling stays inside the panel and respects staff reading older messages', () => {
  const source = read('client/src/components/EnhancedChatMessenger.js');

  assert.match(source, /showEmbeddedHeader = true/);
  assert.match(source, /isNearBottomRef/);
  assert.match(source, /forceScrollRef/);
  assert.match(source, /scrollHeight - scrollTop - clientHeight < 96/);
  assert.match(source, /container\.scrollTo\(\{ top: container\.scrollHeight/);
  assert.match(source, /data-testid="message-scroll-region"/);
  assert.match(source, /h-full overflow-y-auto overscroll-contain/);
  assert.match(source, /aria-label="Jump to latest message"/);
  assert.match(source, /newMessagesBelow > 0 \? `\$\{newMessagesBelow\} new` : 'Latest'/);
  assert.match(source, /No messages yet/);
  assert.doesNotMatch(source, /messagesEndRef\.current\?\.scrollIntoView/);
  assert.doesNotMatch(source, /className="fixed bottom-24 right-8/);
  assert.doesNotMatch(source, /no-scrollbar/);
});

test('message composer remains keyboard and screen-reader friendly', () => {
  const source = read('client/src/components/EnhancedChatMessenger.js');

  assert.match(source, /aria-label="Send a photo"/);
  assert.match(source, /aria-label="Send message"/);
  assert.match(source, /Math\.min\(e\.target\.scrollHeight, 96\)/);
  assert.match(source, /e\.key === 'Enter' && !e\.shiftKey/);
  assert.match(source, /e\.target\.value = ''/);
});
