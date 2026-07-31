export function safeCustomerReturnPath(requested: string | null | undefined) {
  return requested === '/shop' || requested?.startsWith('/shop/') ? requested : '/shop';
}

export function customerAuthHref(pathname: '/login' | '/signup', returnTo: string) {
  return `${pathname}?returnTo=${encodeURIComponent(safeCustomerReturnPath(returnTo))}`;
}
