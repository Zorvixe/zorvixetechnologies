import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth';
import {
  apiGetMyPresence,
  apiUpdateMyPresence,
  apiPresenceHeartbeat,
} from '../api';

const PresenceContext = createContext(null);

const DEFAULT_CHAT_PREFS = {
  soundNotif: true,
  oneOneChats: true,
  mentionNotif: true,
  pauseChat: false,
};

const VALID_STATUSES = ['Available', 'Away', 'Busy', 'Invisible', 'Do not disturb'];

export function toPresenceClass(status) {
  const s = String(status || 'Offline').toLowerCase().trim();
  if (s === 'do not disturb' || s === 'dnd') return 'dnd';
  if (s === 'available') return 'available';
  if (s === 'away') return 'away';
  if (s === 'busy') return 'busy';
  if (s === 'invisible') return 'invisible';
  return 'offline';
}

export function PresenceProvider({ children }) {
  const { user } = useAuth();

  const [presenceStatus, setPresenceStatus] = useState(() => {
    const saved = localStorage.getItem('user_presence_status');
    return VALID_STATUSES.includes(saved) ? saved : 'Available';
  });

  const [dndDuration, setDndDuration] = useState(() => {
    return localStorage.getItem('user_dnd_duration') || '15 Mins';
  });

  const [dndUntil, setDndUntil] = useState(null);

  const [chatPrefs, setChatPrefs] = useState(() => ({
    soundNotif: localStorage.getItem('user_sound_notif') !== 'false' && localStorage.getItem('cliq_sound_enabled') !== 'false',
    oneOneChats: localStorage.getItem('user_one_one_chats') !== 'false' && localStorage.getItem('cliq_one_one_chats') !== 'false',
    mentionNotif: localStorage.getItem('user_mention_notif') !== 'false' && localStorage.getItem('cliq_mentions_enabled') !== 'false',
    pauseChat: localStorage.getItem('user_pause_chat') === 'true',
  }));

  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const dndTimerRef = useRef(null);

  const applyServerPresence = useCallback((p) => {
    if (!p) return;
    if (p.status && VALID_STATUSES.includes(p.status)) {
      setPresenceStatus(p.status);
      localStorage.setItem('user_presence_status', p.status);
    }
    setDndUntil(p.dnd_until || null);
    if (p.chat_preferences && typeof p.chat_preferences === 'object') {
      const merged = { ...DEFAULT_CHAT_PREFS, ...p.chat_preferences };
      setChatPrefs(merged);
      localStorage.setItem('user_sound_notif', String(merged.soundNotif));
      localStorage.setItem('cliq_sound_enabled', String(merged.soundNotif));
      localStorage.setItem('user_one_one_chats', String(merged.oneOneChats));
      localStorage.setItem('cliq_one_one_chats', String(merged.oneOneChats));
      localStorage.setItem('user_mention_notif', String(merged.mentionNotif));
      localStorage.setItem('cliq_mentions_enabled', String(merged.mentionNotif));
      localStorage.setItem('user_pause_chat', String(merged.pauseChat));
    }
    setLastSyncedAt(new Date());
  }, []);

  // Load persisted presence from backend on login / mount
  const fetchMyPresence = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiGetMyPresence();
      if (res?.success && res.presence) {
        applyServerPresence(res.presence);
      }
    } catch (err) {
      console.debug('Presence load skipped:', err?.message);
    }
  }, [user, applyServerPresence]);

  useEffect(() => {
    if (user) {
      fetchMyPresence();
    }
  }, [user, fetchMyPresence]);

  // Periodic heartbeat (every 45s) & tab focus ping so team sees live online status
  useEffect(() => {
    if (!user) return;

    const sendHeartbeat = async () => {
      try {
        const res = await apiPresenceHeartbeat();
        if (res?.success && res.presence) {
          applyServerPresence(res.presence);
        }
      } catch (err) {
        console.debug('Presence heartbeat failed:', err?.message);
      }
    };

    const interval = setInterval(sendHeartbeat, 45000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, applyServerPresence]);

  // Auto-revert "Do not disturb" when dndUntil expires
  useEffect(() => {
    if (dndTimerRef.current) clearTimeout(dndTimerRef.current);
    if (presenceStatus !== 'Do not disturb' || !dndUntil) return;

    const msLeft = new Date(dndUntil).getTime() - Date.now();
    if (msLeft <= 0) {
      apiUpdateMyPresence({ presence_status: 'Available' })
        .then((res) => res?.presence && applyServerPresence(res.presence))
        .catch(() => {});
      return;
    }

    dndTimerRef.current = setTimeout(() => {
      apiUpdateMyPresence({ presence_status: 'Available' })
        .then((res) => res?.presence && applyServerPresence(res.presence))
        .catch(() => {});
    }, Math.min(msLeft + 500, 2147483647));

    return () => {
      if (dndTimerRef.current) clearTimeout(dndTimerRef.current);
    };
  }, [presenceStatus, dndUntil, applyServerPresence]);

  // Update presence status across UI + Backend DB
  const updatePresence = useCallback(
    async (nextStatus, nextDndDuration = dndDuration) => {
      if (!VALID_STATUSES.includes(nextStatus)) return;
      setPresenceStatus(nextStatus);
      localStorage.setItem('user_presence_status', nextStatus);
      if (nextDndDuration) {
        setDndDuration(nextDndDuration);
        localStorage.setItem('user_dnd_duration', nextDndDuration);
      }

      try {
        const res = await apiUpdateMyPresence({
          presence_status: nextStatus,
          dnd_duration: nextStatus === 'Do not disturb' ? nextDndDuration : null,
        });
        if (res?.success && res.presence) {
          applyServerPresence(res.presence);
        }
      } catch (err) {
        console.error('Failed to persist presence status:', err);
      }
    },
    [dndDuration, applyServerPresence]
  );

  // Update DND duration (persists immediately if DND is active)
  const updateDndDuration = useCallback(
    async (nextDuration) => {
      setDndDuration(nextDuration);
      localStorage.setItem('user_dnd_duration', nextDuration);
      if (presenceStatus === 'Do not disturb') {
        try {
          const res = await apiUpdateMyPresence({
            presence_status: 'Do not disturb',
            dnd_duration: nextDuration,
          });
          if (res?.success && res.presence) {
            applyServerPresence(res.presence);
          }
        } catch (err) {
          console.error('Failed to update DND duration:', err);
        }
      }
    },
    [presenceStatus, applyServerPresence]
  );

  // Update chat/notification preferences across UI + Backend DB
  const updateChatPrefs = useCallback(
    async (partial) => {
      const next = { ...chatPrefs, ...partial };
      setChatPrefs(next);
      localStorage.setItem('user_sound_notif', String(next.soundNotif));
      localStorage.setItem('cliq_sound_enabled', String(next.soundNotif));
      localStorage.setItem('user_one_one_chats', String(next.oneOneChats));
      localStorage.setItem('cliq_one_one_chats', String(next.oneOneChats));
      localStorage.setItem('user_mention_notif', String(next.mentionNotif));
      localStorage.setItem('cliq_mentions_enabled', String(next.mentionNotif));
      localStorage.setItem('user_pause_chat', String(next.pauseChat));

      try {
        const res = await apiUpdateMyPresence({ chat_preferences: next });
        if (res?.success && res.presence) {
          applyServerPresence(res.presence);
        }
      } catch (err) {
        console.error('Failed to persist chat preferences:', err);
      }
    },
    [chatPrefs, applyServerPresence]
  );

  // Enforce sound, pauseChat, Busy, and Do Not Disturb system-wide
  const canPlaySound = useCallback(() => {
    if (!chatPrefs.soundNotif) return false;
    if (chatPrefs.pauseChat) return false;
    if (presenceStatus === 'Busy' || presenceStatus === 'Do not disturb') return false;
    return true;
  }, [chatPrefs.soundNotif, chatPrefs.pauseChat, presenceStatus]);

  return (
    <PresenceContext.Provider
      value={{
        presenceStatus,
        dndDuration,
        dndUntil,
        chatPrefs,
        lastSyncedAt,
        updatePresence,
        updateDndDuration,
        updateChatPrefs,
        canPlaySound,
        toPresenceClass,
      }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}
