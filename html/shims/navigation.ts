import { navigate, useRoute } from "../router";

/** Stand-ins for next/navigation backed by the in-page router. */
export function usePathname(): string {
  return useRoute().path;
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(useRoute().query);
}

const router = {
  push: (href: string) => navigate(href),
  replace: (href: string) => navigate(href),
  back: () => history.back(),
  forward: () => history.forward(),
  refresh: () => {},
  prefetch: () => {},
};

export function useRouter() {
  return router;
}
