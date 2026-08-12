"use client";

import { useEffect, useRef } from "react";
import { HumanMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import { Canvas } from "@/components/canvas";
import { useGraphContext } from "@/contexts/GraphContext";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { useUserContext } from "@/contexts/UserContext";
import { useWorkspaceItem } from "@/contexts/WorkspaceItemContext";
import { convertToOpenAIFormat } from "@/lib/convert_messages";
import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";

export function WorkspaceCanvas() {
  const { item, loading } = useWorkspaceItem();
  const { user } = useUserContext();
  const { threadId, setThreadId } = useThreadContext();
  const { graphData } = useGraphContext();
  const bootstrappedItem = useRef<string | null>(null);
  const kickedOffItem = useRef<string | null>(null);

  useEffect(() => {
    if (!item || loading || bootstrappedItem.current === item.id) return;
    bootstrappedItem.current = item.id;

    if (item.threadId) {
      void setThreadId(item.threadId);
      graphData.setChatStarted(true);
      return;
    }

    graphData.clearState();
    void setThreadId(null);
    graphData.setArtifact({
      currentIndex: 1,
      contents: [
        {
          index: 1,
          type: "text",
          title: item.templateSnapshot.title,
          fullMarkdown: item.templateSnapshot.initialMarkdown,
        },
      ],
    });
    graphData.setUpdateRenderedArtifactRequired(true);
    graphData.setChatStarted(true);
    // Bootstrap is intentionally keyed by the immutable item id; graphData
    // methods are recreated by the context on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, loading]);

  useEffect(() => {
    if (
      !item ||
      !user ||
      !graphData.chatStarted ||
      !graphData.artifact ||
      graphData.messages.length > 0 ||
      graphData.isStreaming ||
      threadId ||
      kickedOffItem.current === item.id
    ) {
      return;
    }

    kickedOffItem.current = item.id;
    const kickoff = new HumanMessage({
      id: uuidv4(),
      content: "Open this workspace item and welcome the user.",
      additional_kwargs: { [OC_HIDE_FROM_UI_KEY]: true },
    });
    graphData.setMessages([kickoff]);
    void graphData
      .streamMessage({
        messages: [convertToOpenAIFormat(kickoff)],
        next: "replyToGeneralInput",
      })
      .catch((error) => {
        kickedOffItem.current = null;
        console.error("Workspace kickoff failed", error);
      });
    // Kickoff is intentionally keyed by state transitions, not the mutable
    // context object that owns those transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    item?.id,
    user?.id,
    graphData.chatStarted,
    graphData.artifact,
    graphData.messages.length,
    graphData.isStreaming,
    threadId,
  ]);

  if (loading || !item) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Loading workspace item…
      </div>
    );
  }

  return <Canvas />;
}
