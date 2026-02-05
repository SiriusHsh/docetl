import React, {
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useDeferredValue,
} from "react";
import { Badge } from "@/components/ui/badge";
import { useInfiniteQuery, InfiniteData } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, Search } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { Database } from "lucide-react";
import { File } from "@/app/types";
import { backendFetch } from "@/lib/backendFetch";

interface FileChunk {
  content: string;
  totalSize: number;
  page: number;
  hasMore: boolean;
}

interface Match {
  id: number;
  lineIndex: number;
  startIndex: number;
  endIndex: number;
}

const DatasetView: React.FC<{ file: File | null }> = ({ file }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [matches, setMatches] = useState<Match[]>([]);
  const [hasFoundKeys, setHasFoundKeys] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    setKeys([]);
    setSearchTerm("");
    setCurrentMatchIndex(0);
    setMatches([]);
    setHasFoundKeys(false);
  }, [file?.path]);

  const fetchFileContent = async ({ pageParam = 0 }): Promise<FileChunk> => {
    if (!file?.path) throw new Error("未选择文件");
    const response = await backendFetch(
      `/api/readFilePage?path=${encodeURIComponent(
        file.path
      )}&page=${pageParam}`
    );
    if (!response.ok) throw new Error("获取文件内容失败");
    return response.json();
  };

  const { data, fetchNextPage, hasNextPage, isFetching, isError, error } =
    useInfiniteQuery<
      FileChunk,
      Error,
      InfiniteData<FileChunk>,
      [string, string | undefined],
      number
    >({
      queryKey: ["fileContent", file?.path],
      queryFn: ({ pageParam = 0 }) => fetchFileContent({ pageParam }),
      getNextPageParam: (lastPage) =>
        lastPage.hasMore ? lastPage.page + 1 : undefined,
      enabled: !!file?.path,
      initialPageParam: 0,
    });

  const lines = useMemo(() => {
    return data?.pages.flatMap((page) => page.content.split("\n")) ?? [];
  }, [data]);

  // Extract keys from the first valid JSON object in the data
  useEffect(() => {
    if (!data?.pages || hasFoundKeys) return;

    // Get all the content
    let allContent = data.pages.map((page) => page.content).join("");

    try {
      // Try to parse the chunk content as JSON first
      const parsed = JSON.parse(allContent);

      if (Array.isArray(parsed)) {
        // If it's an array, get keys from the first object
        if (parsed.length > 0 && typeof parsed[0] === "object") {
          setKeys(Object.keys(parsed[0]));
          setHasFoundKeys(true);
          return;
        }
      } else if (typeof parsed === "object" && parsed !== null) {
        // If it's a single object, get its keys
        setKeys(Object.keys(parsed));
        setHasFoundKeys(true);
        return;
      }
    } catch {
      // Strip away the first character if it's a [
      if (allContent[0] === "[") {
        allContent = allContent.slice(1);
      }

      // Keep trying to JSON.parse the content at a }, to get the dataset keys
      for (let i = 0; i < allContent.length; i++) {
        if (allContent[i] === "}") {
          try {
            const parsed = JSON.parse(allContent.slice(0, i + 1));
            setKeys(Object.keys(parsed));
            setHasFoundKeys(true);
            return;
          } catch {
            continue;
          }
        }
      }
    }
  }, [data?.pages, hasFoundKeys]);

  // Perform search and update matches
  useEffect(() => {
    if (deferredSearchTerm.length >= 5) {
      const newMatches: Match[] = [];
      const safeTerm = deferredSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let regex: RegExp | null = null;
      try {
        regex = new RegExp(safeTerm, "gi");
      } catch {
        regex = null;
      }
      if (regex) {
        lines.forEach((line, lineIndex) => {
          let match;
          while ((match = regex?.exec(line)) !== null) {
            newMatches.push({
              id: newMatches.length,
              lineIndex,
              startIndex: match.index,
              endIndex: match.index + match[0].length,
            });
          }
        });
      }
      setMatches(newMatches);
      setCurrentMatchIndex(0);
    } else {
      setMatches([]);
      setCurrentMatchIndex(0);
    }
  }, [deferredSearchTerm, lines]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // The search is already performed in the useEffect above
  };

  const navigateMatch = (direction: "next" | "prev") => {
    if (matches.length === 0) return;
    let newIndex =
      direction === "next" ? currentMatchIndex + 1 : currentMatchIndex - 1;
    if (newIndex < 0) newIndex = matches.length - 1;
    if (newIndex >= matches.length) newIndex = 0;
    setCurrentMatchIndex(newIndex);
  };

  const matchesByLine = useMemo(() => {
    const map = new Map<number, Match[]>();
    matches.forEach((match) => {
      const list = map.get(match.lineIndex);
      if (list) {
        list.push(match);
      } else {
        map.set(match.lineIndex, [match]);
      }
    });
    return map;
  }, [matches]);

  const highlightMatches = (text: string, lineIndex: number) => {
    if (!deferredSearchTerm || deferredSearchTerm.length < 5) return text;
    const lineMatches = matchesByLine.get(lineIndex) ?? [];
    if (lineMatches.length === 0) return text;
    const parts = [];
    let lastIndex = 0;
    lineMatches.forEach((match) => {
      if (lastIndex < match.startIndex) {
        parts.push(text.slice(lastIndex, match.startIndex));
      }
      parts.push(
        <mark
          key={match.id}
          className={`bg-yellow-200 ${
            currentMatchIndex === match.id ? "ring-2 ring-blue-500" : ""
          }`}
        >
          {text.slice(match.startIndex, match.endIndex)}
        </mark>
      );
      lastIndex = match.endIndex;
    });
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts;
  };

  const maybeFetchNextPage = useCallback(() => {
    const container = parentRef.current;
    if (!container || !hasNextPage || isFetching) return;
    const threshold = 240;
    if (
      container.scrollHeight -
        (container.scrollTop + container.clientHeight) <
      threshold
    ) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetching]);

  useEffect(() => {
    const container = parentRef.current;
    if (!container) return;
    const handleScroll = () => {
      maybeFetchNextPage();
    };
    handleScroll();
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [maybeFetchNextPage, lines.length]);

  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 10,
  });

  useEffect(() => {
    if (matches.length === 0) return;
    const target = matches[currentMatchIndex];
    if (!target) return;
    rowVirtualizer.scrollToIndex(target.lineIndex, { align: "center" });
  }, [currentMatchIndex, matches, rowVirtualizer]);


  if (!file) {
    return (
      <div className="h-full flex flex-col p-4">
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
          <Database className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="font-medium text-muted-foreground">未选择数据集</h3>
          <p className="text-sm text-muted-foreground/80">
            请在左侧选择或上传文件以查看内容。
          </p>
        </div>
      </div>
    );
  }

  if (isError) return <div>错误：{error.message}</div>;

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex justify-between items-center mb-4 border-b pb-3">
        <h2 className="text-base font-bold flex items-center">
          <Database className="mr-2" size={18} />
          {file?.name}
        </h2>
      </div>

      <Collapsible className="mb-4" open={statsOpen} onOpenChange={setStatsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 hover:text-primary transition-colors">
          <ChevronRight className="h-4 w-4 transition-transform ui-expanded:rotate-90" />
          <p className="text-sm font-medium">可用字段</p>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <div className="text-xs bg-muted/50 p-2 rounded-md">
            <div className="flex flex-wrap gap-1">
              {keys.map((key) => (
                <Badge
                  key={key}
                  variant="default"
                  className="transition-none hover:bg-primary hover:text-primary-foreground"
                >
                  {key}
                </Badge>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <form onSubmit={handleSearch} className="flex items-center mb-4">
        <Input
          type="text"
          placeholder="搜索（至少 5 个字符）..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mr-1"
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          disabled={searchTerm.length < 5}
        >
          <Search className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => navigateMatch("prev")}
          disabled={matches.length === 0}
          className="ml-1"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => navigateMatch("next")}
          disabled={matches.length === 0}
          className="ml-1"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
        <span className="ml-2 text-sm text-muted-foreground">
          {matches.length > 0
            ? `第 ${currentMatchIndex + 1} / ${matches.length} 个匹配`
            : "无匹配"}
        </span>
      </form>

      <div
        ref={parentRef}
        className="flex-grow overflow-y-auto relative"
      >
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const lineContent = lines[virtualRow.index] ?? "";
            return (
              <div
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute left-0 top-0 w-full"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="flex hover:bg-gray-50">
                  <span className="inline-block w-12 flex-shrink-0 text-muted-foreground select-none text-right pr-2 text-sm">
                    {virtualRow.index + 1}
                  </span>
                  <div className="flex-grow">
                    <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                      {highlightMatches(lineContent, virtualRow.index)}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {hasNextPage && !isFetching ? (
          <div className="py-4 text-center">
            <Button variant="outline" size="sm" onClick={() => fetchNextPage()}>
              加载更多
            </Button>
          </div>
        ) : null}
        {isFetching ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            加载更多...
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default DatasetView;
