const HELP_CENTER_URL = 'https://orithos.com.au/help';

export function getHelpCenterUrl(pathname: string): string {
  let topic = 'getting-started';

  if (pathname === '/' || pathname.startsWith('/register') || pathname.startsWith('/finalise')) {
    topic = 'sales';
  } else if (pathname.startsWith('/products') || pathname.startsWith('/stock')) {
    topic = 'stock';
  } else if (pathname.startsWith('/purchases') || pathname.startsWith('/invoices') || pathname.startsWith('/suppliers')) {
    topic = 'purchasing';
  } else if (pathname.startsWith('/reports') || pathname.startsWith('/close') || pathname.startsWith('/history')) {
    topic = 'reports';
  } else if (pathname.startsWith('/utilities/vendor-connections') || pathname.startsWith('/api-docs')) {
    topic = 'integrations';
  } else if (pathname.startsWith('/customers') || pathname.startsWith('/promotions') || pathname.startsWith('/giftcards')) {
    topic = 'customers';
  } else if (pathname.startsWith('/settings')) {
    topic = 'account';
  }

  return `${HELP_CENTER_URL}?topic=${topic}`;
}
