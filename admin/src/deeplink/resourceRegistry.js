// src/deeplink/resourceRegistry.js
import {
  apiGetTicket,
  apiGetProject,
  apiGetProjectComments,
} from '../api';

// Central registry mapping resource types -> route, loader, elementIdForTarget
const registry = {
  ticket: {
    route: (id) => `/tickets/${id}`,
    loader: async (id) => {
      try {
        const res = await apiGetTicket(id);
        return { success: true, data: res };
      } catch (e) {
        return { success: false, error: e };
      }
    },
    elementIdForTarget: (targetType, targetId) => {
      if (!targetType || !targetId) return null;
      if (targetType === 'comment') return `comment-${targetId}`;
      if (targetType === 'attachment') return `attachment-${targetId}`;
      return `${targetType}-${targetId}`;
    },
  },

  project: {
    route: (id) => `/projects/${id}`,
    loader: async (id) => {
      try {
        const p = await apiGetProject(id);
        const comments = await apiGetProjectComments(id);
        return { success: true, data: { project: p.project || p, comments: comments.comments || comments } };
      } catch (e) {
        return { success: false, error: e };
      }
    },
    elementIdForTarget: (targetType, targetId) => {
      if (!targetType || !targetId) return null;
      if (targetType === 'comment') return `comment-${targetId}`;
      if (targetType === 'member') return `member-${targetId}`;
      return `${targetType}-${targetId}`;
    },
  },

  // Add more resource types as needed
};

// Build deep link: /route/:id?target=targetType-targetId&...extraQuery
export function buildDeepLink({ resourceType, resourceId, targetType, targetId, extraQuery = {} }) {
  const entry = registry[resourceType];
  if (!entry) throw new Error(`Unknown resource type ${resourceType}`);
  const base = entry.route(resourceId);
  const params = new URLSearchParams(extraQuery || {});
  if (targetType && targetId) params.set('target', `${targetType}-${targetId}`);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function getRegistryEntry(type) {
  return registry[type];
}

// runtime registration if needed
export function registerResource(type, entry) {
  registry[type] = entry;
}
