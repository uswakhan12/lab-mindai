import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouterDefaultErrorComponent } from "./router-default-error";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouterDefaultErrorComponent,
  });

  return router;
};
