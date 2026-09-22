import type { Flag, Strategy } from './model';
const all: Strategy = { name: 'flexibleRollout', parameters: { rollout: '100', stickiness: 'default', groupId: 'demo' }, constraints: [], segments: [] };
export function demoFlags(): Flag[] {
  return [
    { name: 'new-checkout', project: 'storefront', description: 'The new checkout is available to everyone.', environments: ['development', 'production'].map(name => ({ name, enabled: true, strategies: [all] })) },
    { name: 'beta-search', project: 'search', description: 'A limited production rollout of the new search experience.', environments: [{ name: 'development', enabled: true, strategies: [all] }, { name: 'production', enabled: true, strategies: [{ ...all, parameters: { ...all.parameters, rollout: '25' }, constraints: [{ contextName: 'plan', operator: 'IN', values: ['pro'] }] }] }] },
    { name: 'legacy-banner', project: 'storefront', description: 'Disabled in every environment.', environments: ['development', 'production'].map(name => ({ name, enabled: false, strategies: [all] })) },
    { name: 'preview-dashboard', project: 'analytics', description: 'Enabled in development, disabled in production.', environments: [{ name: 'development', enabled: true, strategies: [all] }, { name: 'production', enabled: false, strategies: [all] }] }
  ];
}
