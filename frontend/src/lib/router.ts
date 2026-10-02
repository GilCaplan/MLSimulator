import { create } from "zustand";

export type Route =
  | { name: "home" }
  | { name: "wizard"; projectId: string; step: string }
  | { name: "library" }
  | { name: "model"; modelId: string }
  | { name: "settings" }
  | { name: "lessons" }
  | { name: "lesson"; lessonId: string };

export function parse(path: string): Route {
  const parts = path.replace(/^\/+|\/+$/g, "").split("/");
  if (parts[0] === "p" && parts[1]) return { name: "wizard", projectId: parts[1], step: parts[2] || "problem" };
  if (parts[0] === "library" && parts[1]) return { name: "model", modelId: parts[1] };
  if (parts[0] === "library") return { name: "library" };
  if (parts[0] === "settings") return { name: "settings" };
  if (parts[0] === "lessons" && parts[1]) return { name: "lesson", lessonId: parts[1] };
  if (parts[0] === "lessons") return { name: "lessons" };
  return { name: "home" };
}

interface RouterState {
  path: string;
  route: Route;
  navigate: (path: string, replace?: boolean) => void;
}

export const useRouter = create<RouterState>((set) => ({
  path: window.location.pathname,
  route: parse(window.location.pathname),
  navigate: (path, replace = false) => {
    if (path === window.location.pathname) return;
    if (replace) window.history.replaceState({}, "", path);
    else window.history.pushState({}, "", path);
    set({ path, route: parse(path) });
  },
}));

window.addEventListener("popstate", () => {
  useRouter.setState({ path: window.location.pathname, route: parse(window.location.pathname) });
});

export const navigate = (path: string, replace = false) => useRouter.getState().navigate(path, replace);
