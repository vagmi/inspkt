import { ClerkProvider } from "@clerk/react-router";
import { clerkMiddleware, rootAuthLoader } from "@clerk/react-router/server";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const middleware = [clerkMiddleware()];

export const loader = (args: Parameters<typeof rootAuthLoader>[0]) =>
  rootAuthLoader(args);

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="paper-grain">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/** Clerk components themed to the "Paper & Ink" design language.
 * Restyle (or remove) freely — see app/app.css for the design tokens. */
const clerkAppearance = {
  variables: {
    colorPrimary: "oklch(0.2667 0.014 76)",
    colorBackground: "oklch(0.9851 0.007 95)",
    colorText: "oklch(0.2462 0.013 76)",
    colorTextSecondary: "oklch(0.4961 0.016 80)",
    colorInputBackground: "oklch(0.9851 0.007 95)",
    colorInputText: "oklch(0.2462 0.013 76)",
    colorDanger: "oklch(0.5471 0.205 28)",
    fontFamily: '"Public Sans Variable", ui-sans-serif, system-ui, sans-serif',
    borderRadius: "0.375rem",
  },
};

export default function App() {
  const loaderData = useLoaderData<typeof loader>();
  return (
    <ClerkProvider loaderData={loaderData} appearance={clerkAppearance}>
      <Outlet />
    </ClerkProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let stamp = "Error";
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    const isNotFound = error.status === 404;
    stamp = isNotFound ? "Not found" : `Error ${error.status}`;
    message = isNotFound ? "404" : "Error";
    details = isNotFound
      ? "The requested page could not be found."
      : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-4 text-center">
      <span className="stamp">{stamp}</span>
      <h1 className="text-6xl">{message}</h1>
      <p className="text-muted-foreground">{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto rounded-md border bg-card p-4 text-left text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
