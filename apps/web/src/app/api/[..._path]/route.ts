import { LANGGRAPH_API_URL } from "../../../constants";
import { NextRequest, NextResponse } from "next/server";
import { Session, User } from "@supabase/supabase-js";
import { verifyUserAuthenticated } from "../../../lib/supabase/verify_user_server";
import {
  classifyProxyPath,
  isThreadCreate,
  isThreadListGet,
  threadOwnerMatches,
  withOwnedThreadMetadata,
} from "../../../lib/thread-ownership";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

async function assertThreadOwnership(
  threadId: string,
  authenticatedUserId: string
): Promise<NextResponse | null> {
  const res = await fetch(`${LANGGRAPH_API_URL}/threads/${threadId}`, {
    headers: {
      "x-api-key": process.env.LANGCHAIN_API_KEY || "",
    },
  });

  if (res.status === 404) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (!res.ok) {
    console.error("Failed to fetch thread for ownership check", res.status);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thread = await res.json();
  if (!threadOwnerMatches(thread?.metadata, authenticatedUserId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

async function handleRequest(req: NextRequest, method: string) {
  let session: Session | undefined;
  let user: User | undefined;
  try {
    const authRes = await verifyUserAuthenticated();
    session = authRes?.session;
    user = authRes?.user;
    if (!session || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch (e) {
    console.error("Failed to fetch user", e);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const path = req.nextUrl.pathname.replace(/^\/?api\//, "");
    const classification = classifyProxyPath(path);

    // Store must go through dedicated /api/store/* routes with namespace scoping.
    if (classification.kind === "store") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Ownership gate for any threads/{id}/... path.
    if (classification.kind === "thread_by_id") {
      const denied = await assertThreadOwnership(
        classification.threadId,
        user.id
      );
      if (denied) return denied;
    }

    const url = new URL(req.url);
    const searchParams = new URLSearchParams(url.search);
    searchParams.delete("_path");
    searchParams.delete("nxtP_path");

    // GET /threads — scope list to the authenticated user.
    if (isThreadListGet(method, classification)) {
      searchParams.set(
        "metadata",
        JSON.stringify({ user_id: user.id })
      );
    }

    const queryString = searchParams.toString()
      ? `?${searchParams.toString()}`
      : "";

    const options: RequestInit = {
      method,
      headers: {
        "x-api-key": process.env.LANGCHAIN_API_KEY || "",
      },
    };

    if (["POST", "PUT", "PATCH"].includes(method)) {
      options.headers = {
        ...options.headers,
        "Content-Type": "application/json",
      };
      const bodyText = await req.text();

      if (typeof bodyText === "string" && bodyText.length > 0) {
        const parsedBody = JSON.parse(bodyText);
        parsedBody.config = parsedBody.config || {};
        parsedBody.config.configurable = {
          ...parsedBody.config.configurable,
          supabase_session: session,
          supabase_user_id: user.id,
        };

        // POST /threads — stamp ownership metadata.
        if (isThreadCreate(method, classification)) {
          parsedBody.metadata = withOwnedThreadMetadata(
            parsedBody.metadata,
            user.id
          );
        }

        // POST /threads/search — force metadata filter to this user.
        if (classification.kind === "thread_search") {
          parsedBody.metadata = withOwnedThreadMetadata(
            parsedBody.metadata,
            user.id
          );
        }

        // PATCH thread metadata — prevent ownership reassignment.
        if (
          method === "PATCH" &&
          classification.kind === "thread_by_id" &&
          parsedBody.metadata
        ) {
          parsedBody.metadata = withOwnedThreadMetadata(
            parsedBody.metadata,
            user.id
          );
        }

        options.body = JSON.stringify(parsedBody);
      } else {
        options.body = bodyText;
      }
    }

    const res = await fetch(
      `${LANGGRAPH_API_URL}/${path}${queryString}`,
      options
    );

    if (res.status >= 400) {
      console.error(
        "ERROR IN PROXY",
        `${LANGGRAPH_API_URL}/${path}${queryString}`,
        res.status,
        res.statusText
      );
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
      });
    }

    const headers = new Headers({
      ...getCorsHeaders(),
    });
    // Safely add headers from the original response
    res.headers.forEach((value, key) => {
      try {
        headers.set(key, value);
      } catch (error) {
        console.warn(`Failed to set header: ${key}`, error);
      }
    });

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (e: any) {
    console.error("Error in proxy");
    console.error(e);
    console.error("\n\n\nEND ERROR\n\n");
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}

export const GET = (req: NextRequest) => handleRequest(req, "GET");
export const POST = (req: NextRequest) => handleRequest(req, "POST");
export const PUT = (req: NextRequest) => handleRequest(req, "PUT");
export const PATCH = (req: NextRequest) => handleRequest(req, "PATCH");
export const DELETE = (req: NextRequest) => handleRequest(req, "DELETE");

// Add a new OPTIONS handler
export const OPTIONS = () => {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...getCorsHeaders(),
    },
  });
};
