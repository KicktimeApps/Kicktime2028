import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Weiches Überblenden beim Seitenwechsel (View Transitions; wo der Browser
    // es nicht kann, wechselt die Seite wie bisher sofort). Dauer in styles.css.
    defaultViewTransition: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
