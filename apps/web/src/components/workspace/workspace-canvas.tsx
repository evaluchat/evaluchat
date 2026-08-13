"use client";

import { useEffect, useRef, useState } from "react";
import { HumanMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import { Canvas } from "@/components/canvas";
import { useAssistantContext } from "@/contexts/AssistantContext";
import { useGraphContext } from "@/contexts/GraphContext";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { useUserContext } from "@/contexts/UserContext";
import { useWorkspaceItem } from "@/contexts/WorkspaceItemContext";
import { convertToOpenAIFormat } from "@/lib/convert_messages";
import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";
import type { MarkdownWorkspaceItem } from "@/lib/workspace/types";
import { WorkspaceItemBanner } from "./workspace-item-banner";
import { WorkspaceItemDeleteDialog } from "./workspace-item-delete-dialog";
import { FormWorkspaceCanvas } from "./form-workspace-canvas";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

function MarkdownWorkspaceCanvas({ item }: { item: MarkdownWorkspaceItem }) {
  const { user } = useUserContext();
  const { threadId, setThreadId } = useThreadContext();
  const { graphData } = useGraphContext();
  const { selectedAssistant } = useAssistantContext();
  const router = useRouter();
  const { toast } = useToast();
  const bootstrappedItem = useRef<string | null>(null);
  const kickedOffItem = useRef<string | null>(null);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);

  async function abandonItem() {
    setIsAbandoning(true);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!response.ok) throw new Error("Could not abandon workspace item");
      setAbandonOpen(false);
      router.push("/workspace");
    } catch (error) {
      console.error("Failed to abandon workspace item", error);
      toast({
        title: "Could not abandon item",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAbandoning(false);
    }
  }

  useEffect(() => {
    if (bootstrappedItem.current === item.id) return;
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
    // Bootstrap is intentionally keyed by the immutable item id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    if (
      !user ||
      !selectedAssistant ||
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
    // Kickoff is intentionally keyed by state transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    item.id,
    user?.id,
    selectedAssistant,
    graphData.chatStarted,
    graphData.artifact,
    graphData.messages.length,
    graphData.isStreaming,
    threadId,
  ]);

  return (
    <>
      <Canvas
        editorBanner={
          <WorkspaceItemBanner
            item={item}
            onAbandon={() => setAbandonOpen(true)}
          />
        }
      />
      <WorkspaceItemDeleteDialog
        open={abandonOpen}
        onOpenChange={setAbandonOpen}
        onConfirm={() => void abandonItem()}
        itemTitle={item.templateSnapshot.title}
        isDeleting={isAbandoning}
        confirmLabel="Abandon"
      />
    </>
  );
}

export function WorkspaceCanvas() {
  const { item, loading } = useWorkspaceItem();

  if (loading || !item) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Loading workspace item…
      </div>
    );
  }

  if (item.kind === "form_template") {
    return <FormWorkspaceCanvas item={item} />;
  }

  if (item.kind === "method") {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        This workspace item is not available yet.
      </div>
    );
  }

  return <MarkdownWorkspaceCanvas item={item} />;
}
