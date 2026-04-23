import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ChatMessage } from '@/lib/chat-api';

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  preview?: string;
}

const LS_KEY = (userId: string) => `vrm_conversations_${userId}`;

interface StoredConversation {
  id: string;
  title: string;
  updated_at: string;
  messages: ChatMessage[];
  exported_at?: string;
}

function loadFromStorage(userId: string): StoredConversation[] {
  try {
    const raw = localStorage.getItem(LS_KEY(userId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveToStorage(userId: string, convos: StoredConversation[]) {
  try {
    // Keep only last 30 conversations, max 200 messages each
    const trimmed = convos.slice(0, 30).map(c => ({
      ...c,
      messages: c.messages.slice(-200),
    }));
    localStorage.setItem(LS_KEY(userId), JSON.stringify(trimmed));
  } catch { /* storage full — ignore */ }
}

export function useConversations(userId: string | undefined) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const storageRef = useRef<StoredConversation[]>([]);
  const titleSetRef = useRef<Set<string>>(new Set());

  // Load from localStorage on mount
  const loadConversations = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const stored = loadFromStorage(userId);
    storageRef.current = stored;
    setConversations(
      stored.map(c => ({
        id: c.id,
        title: c.title,
        updated_at: c.updated_at,
        preview: c.messages.at(-1)?.content.slice(0, 60),
      }))
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (userId) loadConversations();
  }, [userId, loadConversations]);

  const loadMessages = useCallback(async (conversationId: string): Promise<ChatMessage[]> => {
    const convo = storageRef.current.find(c => c.id === conversationId);
    return convo?.messages ?? [];
  }, []);

  const createConversation = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;
    const id = crypto.randomUUID();
    const newConvo: StoredConversation = {
      id,
      title: 'Percakapan baru',
      updated_at: new Date().toISOString(),
      messages: [],
    };
    storageRef.current = [newConvo, ...storageRef.current];
    saveToStorage(userId, storageRef.current);
    setActiveId(id);
    setConversations(prev => [{
      id, title: newConvo.title, updated_at: newConvo.updated_at,
    }, ...prev]);
    return id;
  }, [userId]);

  const saveMessage = useCallback(async (
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
  ) => {
    if (!userId) return;
    const idx = storageRef.current.findIndex(c => c.id === conversationId);
    if (idx === -1) return;
    const updated = {
      ...storageRef.current[idx],
      messages: [...storageRef.current[idx].messages, { role, content }],
      updated_at: new Date().toISOString(),
    };
    storageRef.current = [
      updated,
      ...storageRef.current.filter((_, i) => i !== idx),
    ];
    saveToStorage(userId, storageRef.current);
    setConversations(
      storageRef.current.map(c => ({
        id: c.id, title: c.title, updated_at: c.updated_at,
        preview: c.messages.at(-1)?.content.slice(0, 60),
      }))
    );
  }, [userId]);

  const maybeSetTitle = useCallback(async (conversationId: string, firstUserMessage: string) => {
    if (titleSetRef.current.has(conversationId)) return;
    titleSetRef.current.add(conversationId);
    const title = firstUserMessage.trim().slice(0, 40) + (firstUserMessage.length > 40 ? '…' : '');
    const idx = storageRef.current.findIndex(c => c.id === conversationId);
    if (idx === -1) return;
    storageRef.current[idx] = { ...storageRef.current[idx], title };
    saveToStorage(userId!, storageRef.current);
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, title } : c));
  }, [userId]);

  const deleteConversation = useCallback(async (id: string) => {
    if (!userId) return;
    storageRef.current = storageRef.current.filter(c => c.id !== id);
    saveToStorage(userId, storageRef.current);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeId === id) setActiveId(null);
  }, [userId, activeId]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    if (!userId) return;
    const idx = storageRef.current.findIndex(c => c.id === id);
    if (idx === -1) return;
    storageRef.current[idx] = { ...storageRef.current[idx], title };
    saveToStorage(userId, storageRef.current);
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
    titleSetRef.current.add(id);
  }, [userId]);

  /** Import conversations from a JSON export file */
  const importConversations = useCallback((jsonData: string): { imported: number; error?: string } => {
    if (!userId) return { imported: 0, error: 'Not logged in' };
    try {
      const parsed = JSON.parse(jsonData);
      const items: StoredConversation[] = Array.isArray(parsed) ? parsed : [parsed];
      let imported = 0;
      for (const item of items) {
        if (!item.id || !item.title || !Array.isArray(item.messages)) continue;
        if (storageRef.current.find(c => c.id === item.id)) continue;
        storageRef.current = [{
          id: item.id,
          title: item.title,
          updated_at: item.exported_at ?? item.updated_at ?? new Date().toISOString(),
          messages: item.messages.filter((m: any) =>
            (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
          ),
        }, ...storageRef.current];
        imported++;
      }
      if (imported > 0) {
        saveToStorage(userId, storageRef.current);
        setConversations(storageRef.current.map(c => ({
          id: c.id, title: c.title, updated_at: c.updated_at,
          preview: c.messages.at(-1)?.content.slice(0, 60),
        })));
      }
      return { imported };
    } catch {
      return { imported: 0, error: 'Format file tidak valid' };
    }
  }, [userId]);

  /** Clear all conversations */
  const clearAllConversations = useCallback(() => {
    if (!userId) return;
    storageRef.current = [];
    saveToStorage(userId, []);
    setConversations([]);
    setActiveId(null);
  }, [userId]);

  return {
    conversations,
    activeId,
    setActiveId,
    loading,
    loadConversations,
    loadMessages,
    createConversation,
    saveMessage,
    maybeSetTitle,
    deleteConversation,
    renameConversation,
    importConversations,
    clearAllConversations,
  };
}
