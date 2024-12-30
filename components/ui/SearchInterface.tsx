"use client";
import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  Upload,
  Loader2,
  Play,
  Pause,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

// Types for our search results based on the API response
interface VideoSearchResult {
  id: string;
  url: string;
  thumbnailUrl?: string;
  title?: string;
  duration?: number;
  startTime?: number;
  endTime?: number;
  score: number;
  matchType?: string;
  description?: string;
  transcript?: string;
  createdAt: string;
}
interface SearchResponse {
  results: VideoSearchResult[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    hasMore: boolean;
  };
}

interface SearchQuery {
  type: "text" | "base64";
  value: string;
  embedding_model: string;
}

const SearchInterface = () => {
  // State management
  const [searchTerm, setSearchTerm] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<VideoSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<{ [key: string]: boolean }>({});
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});
  const [expandedSections, setExpandedSections] = useState<{
    [key: string]: { description: boolean; transcript: boolean };
  }>({});
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [base64Contents, setBase64Contents] = useState<
    { file: File; base64: string }[]
  >([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const pageSize = 10;

  const [lastSearchQueries, setLastSearchQueries] = useState<SearchQuery[]>([]);

  const toggleSection = (
    resultId: string,
    section: "description" | "transcript",
  ) => {
    setExpandedSections((prev) => ({
      ...prev,
      [resultId]: {
        ...(prev[resultId] || { description: false, transcript: false }),
        [section]: !(prev[resultId]?.[section] ?? false),
      },
    }));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Extract the base64 content without the data URL prefix
        const base64String = reader.result as string;
        const base64Content = base64String.split(",")[1];
        resolve(base64Content);
      };
      reader.onerror = (error) => reject(error);
    });
  };
  useEffect(() => {
    return () => {
      // Cleanup: pause all videos when component unmounts
      Object.values(videoRefs.current).forEach((video) => {
        if (video && !video.paused) {
          video.pause();
        }
      });
    };
  }, []);
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validImageTypes = ["image/jpeg", "image/png", "image/jpg"];
    const validFiles = files.filter((file) =>
      validImageTypes.includes(file.type),
    );

    if (validFiles.length !== files.length) {
      setError("Some files were skipped. Please upload only JPG or PNG files");
    }

    try {
      const newBase64Contents = await Promise.all(
        validFiles.map(async (file) => ({
          file,
          base64: await fileToBase64(file),
        })),
      );

      setSelectedFiles((prev) => [...prev, ...validFiles]);
      setBase64Contents((prev) => [...prev, ...newBase64Contents]);
    } catch (err) {
      setError("Failed to process one or more files");
      console.error("File processing error:", err);
    }
  };

  const removeImage = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setBase64Contents((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle text-based search
  const handleSearch = async (page = 1) => {
    if (!searchTerm.trim() && base64Contents.length === 0) {
      setError("Please enter a search term or upload files");
      return;
    }

    setLoading(true);
    setError("");
    setHasSearched(true);

    try {
      const queries: SearchQuery[] = [];

      if (searchTerm.trim()) {
        queries.push({
          type: "text",
          value: searchTerm,
          embedding_model: "multimodal",
        });
      }

      base64Contents.forEach(({ base64 }) => {
        queries.push({
          type: "base64",
          value: base64,
          embedding_model: "multimodal",
        });
      });

      // Save queries for pagination
      setLastSearchQueries(queries);

      const searchPayload = {
        queries,
        page,
        page_size: pageSize,
      };

      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchPayload),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data: SearchResponse = await response.json();

      // Reset video playback state when performing a new search
      Object.values(videoRefs.current).forEach((video) => {
        if (video && !video.paused) {
          video.pause();
        }
      });
      setActiveVideoId(null);
      setIsPlaying({});

      // Update state with search results and pagination info
      setResults(data.results);
      setCurrentPage(data.pagination.currentPage);
      setTotalPages(data.pagination.totalPages);
      setTotalResults(data.pagination.totalResults);

      // Clear any previous errors
      setError("");

      // Handle no results case
      if (data.results.length === 0) {
        setError("No results found. Try adjusting your search.");
      }
    } catch (err) {
      console.error("Search error:", err);
      setError("An unexpected error occurred while searching");
      setResults([]);
      setCurrentPage(1);
      setTotalPages(0);
      setTotalResults(0);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = async (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || loading) return;

    setLoading(true);

    try {
      const searchPayload = {
        queries: lastSearchQueries,
        page: newPage,
        page_size: pageSize,
      };

      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchPayload),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data: SearchResponse = await response.json();

      // Reset video playback state
      Object.values(videoRefs.current).forEach((video) => {
        if (video && !video.paused) {
          video.pause();
        }
      });
      setActiveVideoId(null);
      setIsPlaying({});

      // Update state with new results
      setResults(data.results);
      setCurrentPage(data.pagination.currentPage);
      setTotalPages(data.pagination.totalPages);
      setTotalResults(data.pagination.totalResults);
    } catch (err) {
      setError("An error occurred while fetching more results");
      console.error("Pagination error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Handle video playback control
  const handleVideoClick = async (
    resultId: string,
    result: VideoSearchResult,
  ) => {
    const video = videoRefs.current[resultId];
    if (!video) return;

    try {
      if (activeVideoId === resultId) {
        if (video.paused) {
          await video.play();
          setIsPlaying((prev) => ({ ...prev, [resultId]: true }));
        } else {
          video.pause();
          setIsPlaying((prev) => ({ ...prev, [resultId]: false }));
        }
      } else {
        // Pause previously playing video
        if (activeVideoId && videoRefs.current[activeVideoId]) {
          videoRefs.current[activeVideoId].pause();
          setIsPlaying((prev) => ({ ...prev, [activeVideoId]: false }));
        }

        // Play the new video
        video.currentTime = result.startTime || 0;
        await video.play();
        setActiveVideoId(resultId);
        setIsPlaying((prev) => ({ ...prev, [resultId]: true }));
      }
    } catch (error) {
      // Handle any playback errors
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Video playback error:", error);
      }
      // Update state to reflect actual video state
      setIsPlaying((prev) => ({ ...prev, [resultId]: false }));
    }
  };
  // Handle video time updates

  const handlePlay = (resultId: string) => {
    setIsPlaying((prev) => ({ ...prev, [resultId]: true }));
  };

  const handlePause = (resultId: string) => {
    setIsPlaying((prev) => ({ ...prev, [resultId]: false }));
  };

  const renderPaginationControls = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-center gap-4 mt-8">
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1 || loading}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          <span className="text-sm text-gray-500">
            ({totalResults} total results)
          </span>
        </div>

        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages || loading}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search video content..."
              className="w-full p-3 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500"
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <input
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                accept=".jpg,.jpeg,.png"
              />
              <label
                htmlFor="file-upload"
                className={`cursor-pointer ${selectedFiles.length > 0 ? "text-blue-500" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Upload className="w-5 h-5" />
              </label>
            </div>
          </div>
          {/* Search input */}
          {/* Search button */}
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
          >
            <Search className="w-5 h-5" />
            {searchTerm && base64Contents.length > 0
              ? `Search All (${base64Contents.length + (searchTerm ? 1 : 0)} queries)`
              : "Search"}
          </button>
        </div>
      </div>
      {base64Contents.length > 0 && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-gray-700">
              Uploaded Images ({base64Contents.length}):
            </div>
            <button
              onClick={() => {
                setSelectedFiles([]);
                setBase64Contents([]);
              }}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Remove All
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {base64Contents.map(({ file, base64 }, index) => (
              <div key={index} className="relative group">
                <div className="aspect-square relative rounded-lg overflow-hidden border border-gray-200">
                  <img
                    src={`data:${file.type};base64,${base64}`}
                    alt={`Uploaded content ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/10 to-transparent" />
                </div>
                <button
                  onClick={() => removeImage(index)}
                  className="absolute top-2 right-2 p-1 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <div className="mt-1 text-xs text-gray-500 truncate">
                  {file.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-4 mb-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-1 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}
      {!loading && results.length === 0 && !error && hasSearched && (
        <div className="p-4 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                No Results
              </h3>
              <div className="mt-1 text-sm text-yellow-700">
                Try adjusting your search terms or uploading different images.
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Video Results */}
      <div className="space-y-6">
        {results.map((result) => (
          <div
            key={result.id}
            className="bg-white p-6 border rounded-lg shadow-sm hover:shadow-md transition-shadow"
          >
            {/* Video preview */}
            <div className="relative aspect-video mb-6 bg-black rounded-lg overflow-hidden group">
              <video
                ref={(el) => {
                  if (el) videoRefs.current[result.id] = el;
                }}
                src={result.url}
                className="w-full h-full object-contain"
                onPlay={() => handlePlay(result.id)}
                onPause={() => handlePause(result.id)}
              />

              {/* Simple play/pause button overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={() => handleVideoClick(result.id, result)}
                  className="text-white hover:text-blue-400 transition-colors bg-black/50 p-2 rounded-full"
                >
                  {isPlaying[result.id] ? (
                    <Pause className="w-8 h-8" />
                  ) : (
                    <Play className="w-8 h-8" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {result.title || "Untitled Video"}
              </h3>
              {result.duration && (
                <span className="text-sm text-gray-500">
                  Duration: {Math.floor(result.duration)}s
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
              <div className="flex items-center">
                <span className="font-medium mr-2">Relevance:</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                  {(result.score * 100).toFixed(1)}%
                </span>
              </div>
              {result.matchType && (
                <div className="flex items-center">
                  <span className="font-medium mr-2">Match Type:</span>
                  <span className="capitalize">{result.matchType}</span>
                </div>
              )}
              {result.startTime !== undefined &&
                result.endTime !== undefined && (
                  <div className="flex items-center">
                    <span className="font-medium mr-2">Segment:</span>
                    <span>
                      {result.startTime.toFixed(1)}s -{" "}
                      {result.endTime.toFixed(1)}s
                    </span>
                  </div>
                )}
            </div>
            <div className="space-y-4 mt-4">
              {result.description && (
                <div className="border rounded-lg">
                  <button
                    onClick={() => toggleSection(result.id, "description")}
                    className="flex items-center w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <ChevronDown
                      className={`w-5 h-5 text-gray-500 transition-transform duration-200 mr-2 ${
                        expandedSections[result.id]?.description
                          ? "transform rotate-180"
                          : ""
                      }`}
                    />
                    <h4 className="font-medium text-gray-900">
                      Scene Description
                    </h4>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-200 ${
                      expandedSections[result.id]?.description
                        ? "max-h-[500px] opacity-100"
                        : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="px-4 pb-4">
                      <p className="text-gray-700 text-sm whitespace-pre-wrap">
                        {result.description}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {result.transcript && (
                <div className="border rounded-lg">
                  <button
                    onClick={() => toggleSection(result.id, "transcript")}
                    className="flex items-center w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <ChevronDown
                      className={`w-5 h-5 text-gray-500 transition-transform duration-200 mr-2 ${
                        expandedSections[result.id]?.transcript
                          ? "transform rotate-180"
                          : ""
                      }`}
                    />
                    <h4 className="font-medium text-gray-900">Transcript</h4>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-200 ${
                      expandedSections[result.id]?.transcript
                        ? "max-h-[500px] opacity-100"
                        : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="px-4 pb-4">
                      <p className="text-gray-700 text-sm bg-gray-50 p-3 rounded">
                        {result.transcript}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {renderPaginationControls()}
    </div>
  );
};

export default SearchInterface;
