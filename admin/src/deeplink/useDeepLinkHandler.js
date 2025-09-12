// src/deeplink/useDeepLinkHandler.js
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getRegistryEntry } from './resourceRegistry';

const sleep = (ms = 100) => new Promise((r) => setTimeout(r, ms));

/**
 * Generic hook to handle deep-links for the current detail page.
 * Usage: useDeepLinkHandler({ resourceType: 'ticket', resourceId: id, whenLoaded: () => loaded })
 */
export default function useDeepLinkHandler({ resourceType, resourceId, whenLoaded, pageLoader = 'auto' }) {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const target = params.get('target') || null;
    if (!target) return;

    const [targetType, ...rest] = target.split('-');
    const targetId = rest.join('-');
    const entry = getRegistryEntry(resourceType);
    if (!entry) return;

    let cancelled = false;

    async function run() {
      // 1) Wait for page-level loaded signal if provided
      if (whenLoaded) {
        const check = typeof whenLoaded === 'function' ? whenLoaded : () => Boolean(whenLoaded);
        const start = Date.now();
        while (!cancelled && !check()) {
          if (Date.now() - start > 7000) break; // timeout
          await sleep(120);
        }
      } else if (entry.loader && pageLoader !== 'skip') {
        // attempt registry loader fallback
        try { await entry.loader(resourceId); } catch (e) { /* ignore */ }
      }

      if (cancelled) return;

      // 2) compute DOM id
      let idStr = null;
      if (entry.elementIdForTarget) idStr = entry.elementIdForTarget(targetType, targetId);
      if (!idStr) idStr = `${targetType}-${targetId}`;

      // 3) wait for element to exist
      const waitStart = Date.now();
      let el = document.getElementById(idStr);
      while (!el && !cancelled && Date.now() - waitStart < 6000) {
        await sleep(100);
        el = document.getElementById(idStr);
      }
      if (!el || cancelled) return;

      // 4) scroll / focus / highlight
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof el.focus === 'function') el.focus();
        el.classList.add('deeplink-highlight');
        setTimeout(() => el.classList.remove('deeplink-highlight'), 2500);
      } catch (e) {
        // ignore
      }
    }

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, resourceType, resourceId]);
}
