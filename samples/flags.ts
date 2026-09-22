// Run “Unleash: Try Demo”, then hover the strings below.
// All environments is the default. Switch scope using the status bar.
export const flags = {
  checkout: 'new-checkout',       // green: fully on everywhere
  search: 'beta-search',         // yellow: production is targeted
  banner: 'legacy-banner',       // red: off everywhere
  dashboard: 'preview-dashboard' // yellow: development only
};

// Comments such as 'new-checkout' should not be highlighted.
const unrelated = 'prefix-new-checkout';
const dynamic = `new-checkout-${unrelated}`;
