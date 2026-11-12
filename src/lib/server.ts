import { invoke } from "@tauri-apps/api/core";
import { fromBase64, toBase64 } from "./project-doc";

/**
 * The Polemic server, as Cursive uses it: the account, the account's
 * Cursive projects, a project's document and its published site.
 *
 * In the browser Cursive runs on the server's own origin and the
 * session cookie signs requests in. The desktop app signs in through
 * the browser once and keeps a token in the system's credential store;
 * its requests go through the Rust side (`src-tauri/src/account.rs`),
 * so the token never reaches the window.
 */
export interface Account {
  id: string;
  name: string;
  email: string;
}

export interface ServerProject {
  id: string;
  name: string;
  role: "owner" | "editor" | "commenter" | "viewer";
  owner: { id: string; name: string };
  writable: boolean;
  updatedAt: string;
}

export interface Site {
  slug: string;
  url: string;
  pages: number;
  publishedAt: string;
  /** The site's look: a SiteTheme. A server from before themes leaves it out. */
  theme?: string;
}

export interface SiteState {
  site: Site | null;
  suggestedSlug: string;
  /** What every site's address starts with. */
  baseUrl: string;
}

/** What a learner handed in for an assignment of a published tutorial. */
export interface Submission {
  page: string;
  pageTitle: string;
  assignment: string;
  title: string;
  text: string;
  submittedAt: string;
}

/** A reader who signed in to the published tutorial. */
export interface Learner {
  id: string;
  name: string;
  email: string;
  pagesDone: number;
  points: number;
  lastActiveAt: string;
  submissions: Submission[];
}

export interface Learners {
  /** The published site's pages, and the points its quizzes give. */
  pages: number;
  points: number;
  learners: Learner[];
}

/** An answer the server gave that isn't success, with its message for the reader. */
export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Answer {
  status: number;
  body: string;
}

type Body = { json: unknown } | { bytes: Uint8Array } | undefined;

/** Sends one request to the server's API and returns its status and body. */
export type Transport = (method: string, path: string, body?: Body) => Promise<Answer>;

/** The browser's transport: same origin, signed in by the session cookie. */
export const browserTransport: Transport = async (method, path, body) => {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body
        ? {
            "content-type":
              "json" in body ? "application/json" : "application/octet-stream",
          }
        : undefined,
      body: body
        ? "json" in body
          ? JSON.stringify(body.json)
          : (body.bytes as BufferSource)
        : undefined,
    });
  } catch {
    throw new ServerError(
      0,
      "offline",
      "The server can't be reached. Check your connection.",
    );
  }
  return { status: response.status, body: await response.text() };
};

/** The desktop app's transport: the Rust side adds the account's token. */
export const desktopTransport: Transport = async (method, path, body) => {
  try {
    return await invoke<Answer>("server_request", {
      method,
      path,
      json: body && "json" in body ? JSON.stringify(body.json) : null,
      bytes: body && "bytes" in body ? toBase64(body.bytes) : null,
    });
  } catch (error) {
    throw new ServerError(
      0,
      "offline",
      typeof error === "string" ? error : String(error),
    );
  }
};

export class Server {
  constructor(private readonly send: Transport) {}

  private async call<T>(method: string, path: string, body?: Body): Promise<T> {
    const answer = await this.send(method, path, body);
    let parsed: unknown = null;
    try {
      parsed = answer.body ? JSON.parse(answer.body) : null;
    } catch {
      // Not the API's JSON: a proxy's error page, for one.
    }
    if (answer.status >= 200 && answer.status < 300) return parsed as T;
    const error = parsed as { error?: string; code?: string; message?: string } | null;
    const fallback =
      answer.status === 401
        ? "Sign in to your Polemic account first."
        : `The server answered ${answer.status}.`;
    throw new ServerError(
      answer.status,
      error?.error ?? error?.code ?? "error",
      typeof error?.message === "string" && error.message ? error.message : fallback,
    );
  }

  /** The signed-in account, or null when nobody is signed in. */
  async me(): Promise<Account | null> {
    try {
      return await this.call<Account>("GET", "/api/me");
    } catch (error) {
      if (error instanceof ServerError && error.status === 401) return null;
      throw error;
    }
  }

  async projects(): Promise<ServerProject[]> {
    const list = await this.call<{ projects: ServerProject[] }>(
      "GET",
      "/api/projects?app=cursive",
    );
    return list.projects;
  }

  project(id: string): Promise<ServerProject> {
    return this.call("GET", `/api/projects/${encodeURIComponent(id)}`);
  }

  /** A new Cursive project: `linked` syncs with a folder, `online` lives on the server. */
  createProject(name: string, source: "linked" | "online"): Promise<ServerProject> {
    return this.call("POST", "/api/projects", {
      json: { name, source, app: "cursive" },
    });
  }

  renameProject(id: string, name: string): Promise<ServerProject> {
    return this.call("PATCH", `/api/projects/${encodeURIComponent(id)}`, {
      json: { name },
    });
  }

  deleteProject(id: string): Promise<void> {
    return this.call("DELETE", `/api/projects/${encodeURIComponent(id)}`);
  }

  /** What the server's document has that a copy with this state vector lacks. */
  async documentSync(
    id: string,
    stateVector: Uint8Array,
  ): Promise<{ update: Uint8Array; stateVector: Uint8Array }> {
    const answer = await this.call<{ update: string; stateVector: string }>(
      "POST",
      `/api/projects/${encodeURIComponent(id)}/document/sync`,
      { json: { stateVector: toBase64(stateVector) } },
    );
    return {
      update: fromBase64(answer.update),
      stateVector: fromBase64(answer.stateVector),
    };
  }

  documentUpdate(id: string, update: Uint8Array): Promise<void> {
    return this.call(
      "POST",
      `/api/projects/${encodeURIComponent(id)}/document/update`,
      {
        bytes: update,
      },
    );
  }

  site(id: string): Promise<SiteState> {
    return this.call("GET", `/api/projects/${encodeURIComponent(id)}/site`);
  }

  /** Publishes the project's pages as the server has them now. */
  publish(id: string, slug?: string, theme?: string): Promise<Site> {
    return this.call("POST", `/api/projects/${encodeURIComponent(id)}/site`, {
      json: { ...(slug ? { slug } : {}), ...(theme ? { theme } : {}) },
    });
  }

  unpublish(id: string): Promise<void> {
    return this.call("DELETE", `/api/projects/${encodeURIComponent(id)}/site`);
  }

  /** Who signed in to the project's published tutorial, with their progress and work. */
  learners(id: string): Promise<Learners> {
    return this.call("GET", `/api/projects/${encodeURIComponent(id)}/learners`);
  }
}
