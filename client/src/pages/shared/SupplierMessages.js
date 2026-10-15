import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, RefreshCw, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import socket from '../../utils/socket';
import { supplierChatService } from '../../services/supplierChatService';

const errorText = error => error.response?.data?.message || 'Supplier messages are unavailable. Please retry.';
const newMessageId = () => window.crypto?.randomUUID?.().replaceAll('-', '')
  || `${Date.now()}_${Math.random().toString(36).slice(2).padEnd(12, '0')}`;

const SupplierMessages = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(params.get('conversation') || '');
  const [messages, setMessages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const retryId = useRef(null);
  const contextStarted = useRef('');
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const reloadConversations = useCallback(async () => {
    const response = await supplierChatService.list();
    setConversations(response.data.conversations || []);
    return response.data.conversations || [];
  }, []);

  const reloadMessages = useCallback(async id => {
    const response = await supplierChatService.messages(id);
    if (selectedIdRef.current !== id) return;
    setMessages(response.data.messages || []);
    setCursor(response.data.nextCursor || null);
    await supplierChatService.read(id);
    await reloadConversations();
  }, [reloadConversations]);

  useEffect(() => {
    let active = true;
    const prepare = async () => {
      setLoading(true);
      try {
        const queryContext = {
          supplierId: params.get('supplier') || undefined,
          purchaseOrderId: params.get('purchaseOrder') || undefined,
          supplierProductId: params.get('offer') || undefined
        };
        const key = JSON.stringify(queryContext);
        const wantsContext = Object.values(queryContext).some(Boolean);
        const rows = await reloadConversations();
        if (!active) return;
        if (wantsContext && contextStarted.current !== key) {
          contextStarted.current = key;
          const result = await supplierChatService.open(queryContext);
          if (!active) return;
          setSelectedId(String(result.data.conversation._id));
          await reloadConversations();
        } else if (!selectedIdRef.current && rows.length) {
          setSelectedId(String(rows[0]._id));
        }
        setError('');
      } catch (failure) {
        if (active) setError(errorText(failure));
      } finally {
        if (active) setLoading(false);
      }
    };
    prepare();
    return () => { active = false; };
    // URL context is processed once per change; selection updates use setParams below.
  }, [params, reloadConversations]);

  useEffect(() => {
    const onNotification = notification => {
      const target = notification?.targetUrl;
      if (notification?.relatedModel !== 'Conversation' || typeof target !== 'string'
        || (!target.startsWith('/supplier/messages?conversation=')
          && !target.startsWith('/admin/supplier-messages?conversation='))) return;
      reloadConversations().catch(failure => setError(errorText(failure)));
    };
    socket.on('newNotification', onNotification);
    if (!socket.connected) socket.connect();
    const timer = !selectedId ? window.setInterval(() => {
      reloadConversations().catch(failure => setError(errorText(failure)));
    }, 30000) : null;
    return () => {
      socket.off('newNotification', onNotification);
      if (timer) window.clearInterval(timer);
    };
  }, [selectedId, reloadConversations]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return undefined; }
    let active = true;
    setHistoryLoading(true);
    reloadMessages(selectedId).catch(failure => active && setError(errorText(failure)))
      .finally(() => active && setHistoryLoading(false));
    const refresh = () => {
      reloadMessages(selectedId).catch(failure => active && setError(errorText(failure)));
    };
    const onMessage = event => { if (event.conversationId === selectedId) refresh(); else reloadConversations().catch(() => {}); };
    const onRead = event => { if (event.conversationId === selectedId) refresh(); };
    const join = () => socket.emit('joinSupplierConversation', selectedId, acknowledgement => {
      if (active && !acknowledgement?.allowed) setError('Conversation access is no longer available.');
    });
    socket.on('supplierMessage', onMessage);
    socket.on('supplierMessagesRead', onRead);
    socket.on('connect', join);
    if (!socket.connected) socket.connect();
    else join();
    const timer = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
      socket.off('supplierMessage', onMessage);
      socket.off('supplierMessagesRead', onRead);
      socket.off('connect', join);
      socket.emit('leaveSupplierConversation', selectedId);
    };
  }, [selectedId, reloadMessages, reloadConversations]);

  const select = id => {
    setSelectedId(id);
    setParams({ conversation: id }, { replace: true });
    setError('');
  };
  const loadOlder = async () => {
    if (!cursor) return;
    try {
      const response = await supplierChatService.messages(selectedId, cursor);
      setMessages(previous => [...(response.data.messages || []), ...previous]);
      setCursor(response.data.nextCursor || null);
    } catch (failure) { setError(errorText(failure)); }
  };
  const send = async event => {
    event.preventDefault();
    if (!draft.trim() || sending || !selectedId) return;
    const key = retryId.current || newMessageId();
    retryId.current = key;
    setSending(true);
    try {
      await supplierChatService.send(selectedId, draft, key);
      retryId.current = null;
      setDraft('');
      setError('');
      await reloadMessages(selectedId);
    } catch (failure) { setError(errorText(failure)); }
    finally { setSending(false); }
  };
  const selected = conversations.find(row => String(row._id) === selectedId);
  const supplierView = user?.role === 'supplier';

  return <main className="mx-auto w-full max-w-6xl min-w-0 p-3 sm:p-6">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold text-slate-900">Supplier Messages</h1>
        <p className="text-sm text-slate-600">Informal discussion only. Messages do not approve agreements, orders, payments, stock, or receiving.</p></div>
      <button type="button" onClick={() => reloadConversations().catch(failure => setError(errorText(failure)))}
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" aria-label="Refresh Supplier conversations">
        <RefreshCw size={16} /> Refresh</button>
    </header>
    {error && <div role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}
      <button type="button" onClick={() => { setError(''); reloadConversations().catch(failure => setError(errorText(failure))); }} className="ml-3 underline">Retry</button></div>}
    <div className="grid min-h-[28rem] min-w-0 gap-3 md:grid-cols-[17rem_minmax(0,1fr)]">
      <aside aria-label="Supplier conversations" className="min-w-0 rounded-xl border bg-white p-3">
        {loading ? <p role="status" className="p-3 text-sm">Loading conversations…</p>
          : conversations.length === 0 ? <p className="p-3 text-sm text-slate-500">No Supplier conversations yet. Open one from an eligible Supplier or purchase order.</p>
            : conversations.map(row => <button key={row._id} type="button" onClick={() => select(String(row._id))}
              aria-current={selectedId === String(row._id) ? 'true' : undefined}
              className={`mb-2 block w-full min-w-0 rounded-lg p-3 text-left text-sm ${selectedId === String(row._id) ? 'bg-indigo-50 ring-1 ring-indigo-400' : 'hover:bg-slate-50'}`}>
              <span className="block truncate font-semibold">{supplierView ? row.store?.name : row.supplier?.businessName}</span>
              {row.purchaseOrder && <span className="block text-xs text-slate-600">Order {row.purchaseOrder.orderNumber}</span>}
              <span className="block truncate text-xs text-slate-500">{row.lastMessage?.content || 'No messages yet'}</span>
              <span className="mt-1 flex justify-between text-xs text-slate-500"><span>{new Date(row.updatedAt).toLocaleString()}</span>
                {row.unreadCount > 0 && <span aria-label={`${row.unreadCount} unread messages`} className="rounded-full bg-indigo-600 px-2 text-white">{row.unreadCount}</span>}</span>
            </button>)}
      </aside>
      <section aria-label="Supplier message history" className="flex min-w-0 flex-col rounded-xl border bg-white">
        {!selectedId ? <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500"><MessageSquare className="mr-2" /> Select a conversation</div>
          : <><div className="border-b p-3 text-sm font-semibold">{supplierView ? selected?.store?.name : selected?.supplier?.businessName || 'Supplier conversation'}
            {selected?.purchaseOrder && <span className="ml-2 font-normal text-slate-500">Order {selected.purchaseOrder.orderNumber}</span>}</div>
            <div aria-live="polite" className="max-h-[55dvh] min-h-64 flex-1 space-y-3 overflow-y-auto p-4">
              {cursor && <button type="button" onClick={loadOlder} className="text-sm text-indigo-700 underline">Load earlier messages</button>}
              {historyLoading ? <p role="status">Loading messages…</p> : messages.length === 0 ? <p className="text-sm text-slate-500">No messages yet.</p>
                : messages.map(message => <article key={message._id} className={`max-w-[90%] rounded-xl p-3 text-sm ${String(message.sender?._id || message.sender) === String(user?._id || user?.id) ? 'ml-auto bg-indigo-50' : 'bg-slate-100'}`}>
                  <p className="mb-1 text-xs font-semibold text-slate-600">{message.sender?.firstName ? `${message.sender.firstName} ${message.sender.lastName || ''}`.trim() : 'Participant'}</p>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <time className="mt-1 block text-xs text-slate-500" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
                </article>)}
            </div>
            <form onSubmit={send} className="border-t p-3"><label htmlFor="supplier-message" className="sr-only">Message Supplier or Store</label>
              <textarea id="supplier-message" value={draft} maxLength={2000} rows={2}
                onChange={event => { setDraft(event.target.value); retryId.current = null; }}
                className="w-full rounded-lg border p-2 text-sm" placeholder="Write a message about this Supplier or order…" />
              <button type="submit" disabled={!draft.trim() || sending} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                <Send size={15} /> {sending ? 'Sending…' : 'Send message'}</button></form></>}
      </section>
    </div>
  </main>;
};

export default SupplierMessages;
