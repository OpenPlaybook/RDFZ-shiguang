import { lazy, Suspense, StrictMode } from "react";
import { createRoot } from "react-dom/client";
const Page = lazy(() =>
  location.pathname === "/intro.html" || location.pathname === "/intro"
    ? import("./Intro")
    : import("./App"),
);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
);
