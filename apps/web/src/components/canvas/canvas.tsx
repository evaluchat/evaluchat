"use client";

import { WebSearchResults } from "@/components/web-search-results";
import { ALL_MODEL_NAMES } from "@opencanvas/shared/models";
import {
  getActiveDefaultModelConfig,
  getActiveDefaultModelName,
} from "@/lib/active-model";
import { useGraphContext } from "@/contexts/GraphContext";
import { useToast } from "@/hooks/use-toast";
import { getLanguageTemplate } from "@/lib/get_language_template";
import {
  ArtifactCodeV3,
  ArtifactMarkdownV3,
  ArtifactV3,
  CustomModelConfig,
  ProgrammingLanguageOptions,
} from "@opencanvas/shared/types";
import React, { Suspense, useEffect, useState } from "react";

const ArtifactRenderer = React.lazy(() =>
  import("@/components/artifacts/ArtifactRenderer").then((m) => ({
    default: m.ArtifactRenderer,
  }))
);
const ContentComposerChatInterface = React.lazy(() =>
  import("./content-composer").then((m) => ({
    default: m.ContentComposerChatInterface,
  }))
);
import NoSSRWrapper from "../NoSSRWrapper";
import { useThreadContext } from "@/contexts/ThreadProvider";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { CHAT_COLLAPSED_QUERY_PARAM } from "@/constants";
import { useRouter, useSearchParams } from "next/navigation";
import { useTeachingAssignmentOptional } from "@/contexts/TeachingAssignmentContext";

export function CanvasComponent() {
  const { graphData } = useGraphContext();
  const { setModelName, setModelConfig } = useThreadContext();
  const { setArtifact, chatStarted, setChatStarted } = graphData;
  const teachingAssignment = useTeachingAssignmentOptional();
  const aiAssistanceEnabled =
    teachingAssignment?.apparatusConfiguration?.ai_assistance !== false;
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [webSearchResultsOpen, setWebSearchResultsOpen] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (aiAssistanceEnabled || chatStarted || graphData.artifact) return;
    // AI-off profiles still need a first-class authoring surface. Seed an
    // empty markdown artifact locally; submission remains available without a
    // graph run.
    setArtifact({
      currentIndex: 1,
      contents: [{ index: 1, type: "text", title: "Assignment", fullMarkdown: "" }],
    });
    setChatStarted(true);
    setIsEditing(true);
  }, [aiAssistanceEnabled, chatStarted, graphData.artifact, setArtifact, setChatStarted]);

  const chatCollapsedSearchParam = searchParams.get(CHAT_COLLAPSED_QUERY_PARAM);
  useEffect(() => {
    try {
      if (chatCollapsedSearchParam) {
        setChatCollapsed(JSON.parse(chatCollapsedSearchParam));
      }
    } catch (e) {
      setChatCollapsed(false);
      const queryParams = new URLSearchParams(searchParams.toString());
      queryParams.delete(CHAT_COLLAPSED_QUERY_PARAM);
      router.replace(`?${queryParams.toString()}`, { scroll: false });
    }
  }, [chatCollapsedSearchParam]);

  const handleQuickStart = (
    type: "text" | "code",
    language?: ProgrammingLanguageOptions
  ) => {
    if (type === "code" && !language) {
      toast({
        title: "Language not selected",
        description: "Please select a language to continue",
        duration: 5000,
      });
      return;
    }
    setChatStarted(true);

    let artifactContent: ArtifactCodeV3 | ArtifactMarkdownV3;
    if (type === "code" && language) {
      artifactContent = {
        index: 1,
        type: "code",
        title: `Quick start ${type}`,
        code: getLanguageTemplate(language),
        language,
      };
    } else {
      artifactContent = {
        index: 1,
        type: "text",
        title: `Quick start ${type}`,
        fullMarkdown: "",
      };
    }

    const newArtifact: ArtifactV3 = {
      currentIndex: 1,
      contents: [artifactContent],
    };
    // Do not worry about existing items in state. This should
    // never occur since this action can only be invoked if
    // there are no messages/artifacts in the thread.
    setArtifact(newArtifact);
    setIsEditing(true);
  };

  return (
    <div className="flex h-screen flex-col">
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {!chatStarted && aiAssistanceEnabled && (
          <NoSSRWrapper>
            <Suspense fallback={<div>Loading...</div>}>
              <ContentComposerChatInterface
                chatCollapsed={chatCollapsed}
                setChatCollapsed={(c) => {
                  setChatCollapsed(c);
                  const queryParams = new URLSearchParams(
                    searchParams.toString()
                  );
                  queryParams.set(
                    CHAT_COLLAPSED_QUERY_PARAM,
                    JSON.stringify(c)
                  );
                  router.replace(`?${queryParams.toString()}`, {
                    scroll: false,
                  });
                }}
                switchSelectedThreadCallback={(thread) => {
                  // Chat should only be "started" if there are messages present
                  if (
                    (thread.values as Record<string, any>)?.messages?.length
                  ) {
                    setChatStarted(true);
                    if (thread?.metadata?.customModelName) {
                      setModelName(
                        thread.metadata.customModelName as ALL_MODEL_NAMES
                      );
                    } else {
                      setModelName(getActiveDefaultModelName());
                    }

                    if (thread?.metadata?.modelConfig) {
                      setModelConfig(
                        (thread?.metadata?.customModelName ??
                          getActiveDefaultModelName()) as ALL_MODEL_NAMES,
                        (thread.metadata?.modelConfig ??
                          getActiveDefaultModelConfig()) as CustomModelConfig
                      );
                    } else {
                      setModelConfig(
                        getActiveDefaultModelName(),
                        getActiveDefaultModelConfig()
                      );
                    }
                  } else {
                    setChatStarted(false);
                  }
                }}
                setChatStarted={setChatStarted}
                hasChatStarted={chatStarted}
                handleQuickStart={handleQuickStart}
              />
            </Suspense>
          </NoSSRWrapper>
        )}
        {!chatCollapsed && chatStarted && aiAssistanceEnabled && (
          <ResizablePanel
            defaultSize={25}
            minSize={15}
            maxSize={50}
            className="transition-all duration-700 h-full min-h-0 mr-auto bg-gray-50/70 shadow-inner-right"
            id="chat-panel-main"
            order={1}
          >
            <NoSSRWrapper>
              <Suspense fallback={<div>Loading...</div>}>
                <ContentComposerChatInterface
                  chatCollapsed={chatCollapsed}
                  setChatCollapsed={(c) => {
                    setChatCollapsed(c);
                    const queryParams = new URLSearchParams(
                      searchParams.toString()
                    );
                    queryParams.set(
                      CHAT_COLLAPSED_QUERY_PARAM,
                      JSON.stringify(c)
                    );
                    router.replace(`?${queryParams.toString()}`, {
                      scroll: false,
                    });
                  }}
                  switchSelectedThreadCallback={(thread) => {
                    // Chat should only be "started" if there are messages present
                    if (
                      (thread.values as Record<string, any>)?.messages?.length
                    ) {
                      setChatStarted(true);
                      if (thread?.metadata?.customModelName) {
                        setModelName(
                          thread.metadata.customModelName as ALL_MODEL_NAMES
                        );
                      } else {
                        setModelName(getActiveDefaultModelName());
                      }

                      if (thread?.metadata?.modelConfig) {
                        setModelConfig(
                          (thread?.metadata.customModelName ??
                            getActiveDefaultModelName()) as ALL_MODEL_NAMES,
                          (thread.metadata.modelConfig ??
                            getActiveDefaultModelConfig()) as CustomModelConfig
                        );
                      } else {
                        setModelConfig(
                          getActiveDefaultModelName(),
                          getActiveDefaultModelConfig()
                        );
                      }
                    } else {
                      setChatStarted(false);
                    }
                  }}
                  setChatStarted={setChatStarted}
                  hasChatStarted={chatStarted}
                  handleQuickStart={handleQuickStart}
                />
              </Suspense>
            </NoSSRWrapper>
          </ResizablePanel>
        )}

        {chatStarted && (
          <>
            {aiAssistanceEnabled && <ResizableHandle />}
            <ResizablePanel
              defaultSize={aiAssistanceEnabled ? (chatCollapsed ? 100 : 75) : 100}
              maxSize={85}
              minSize={50}
              id="canvas-panel"
              order={2}
              className="flex flex-row w-full"
            >
              <div className="w-full ml-auto">
                <Suspense fallback={<div>Loading...</div>}>
                  <ArtifactRenderer
                    chatCollapsed={chatCollapsed}
                    setChatCollapsed={(c) => {
                      setChatCollapsed(c);
                      const queryParams = new URLSearchParams(
                        searchParams.toString()
                      );
                      queryParams.set(
                        CHAT_COLLAPSED_QUERY_PARAM,
                        JSON.stringify(c)
                      );
                      router.replace(`?${queryParams.toString()}`, {
                        scroll: false,
                      });
                    }}
                    setIsEditing={setIsEditing}
                    isEditing={isEditing}
                  />
                </Suspense>
              </div>
              <WebSearchResults
                open={webSearchResultsOpen}
                setOpen={setWebSearchResultsOpen}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}

export const Canvas = React.memo(CanvasComponent);
