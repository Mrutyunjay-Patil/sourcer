import { exposeDeploymentQuery } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";

// Lets the client show a "new version available" banner after each deploy.
export const { getCurrentDeployment } = exposeDeploymentQuery(components.staticHosting);
