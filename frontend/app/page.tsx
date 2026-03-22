"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useTheme } from "next-themes";

// Structure for parsed sentences
interface Sentence {
    globalIndex: number;
    text: string;
    page: number;
    isParagraphEnd?: boolean;
}

interface Voice {
    name: string;
    gender: string;
    locale: string;
}

interface VoiceTypePreset {
    id: string;
    label: string;
    description: string;
    icon: string;
    voice: string;
    speed: number;
}

const VOICE_TYPE_PRESETS: VoiceTypePreset[] = [
    { id: "narration", label: "Narration", description: "Deep & calm", icon: "auto_stories", voice: "en-US-GuyNeural", speed: 1.0 },
    { id: "lecture", label: "Lecture", description: "Clear & steady", icon: "school", voice: "en-US-DavisNeural", speed: 0.9 },
    { id: "explanation", label: "Explanation", description: "Neutral & precise", icon: "lightbulb", voice: "en-US-JennyNeural", speed: 1.0 },
    { id: "friendly", label: "Friendly", description: "Warm & upbeat", icon: "sentiment_satisfied", voice: "en-US-AriaNeural", speed: 1.1 },
    { id: "storytelling", label: "Storytelling", description: "Expressive & rich", icon: "menu_book", voice: "en-US-ChristopherNeural", speed: 0.95 },
    { id: "news", label: "News", description: "Crisp & formal", icon: "newspaper", voice: "en-US-SteffanNeural", speed: 1.05 },
];

const API_BASE_URL = "http://127.0.0.1:8000";

export default function Home() {
    const [file, setFile] = useState<File | null>(null);
    const [content, setContent] = useState<any[]>([]);
    const [flatSentences, setFlatSentences] = useState<Sentence[]>([]);
    const [loading, setLoading] = useState(false);
    const [processingStep, setProcessingStep] = useState<string>("");
    const initialLoadDone = useRef<string | null>(null);

    // New reading mode features
    const [isReadingMode, setIsReadingMode] = useState(false);
    const [currentPageNumber, setCurrentPageNumber] = useState(1);
    const [isControlsMinimized, setIsControlsMinimized] = useState(false);
    const [isFocusMode, setIsFocusMode] = useState(false);

    // Search feature
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [transientSearchHighlight, setTransientSearchHighlight] = useState<number | null>(null);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim() || flatSentences.length === 0) return [];
        const query = searchQuery.toLowerCase();
        return flatSentences.filter(s => s.text.toLowerCase().includes(query)).slice(0, 15);
    }, [searchQuery, flatSentences]);

    const handleSearchResultClick = (result: Sentence) => {
        setCurrentPageNumber(result.page);
        setIsSearchOpen(false);
        setSearchQuery("");

        // Slight delay to allow pagination render
        setTimeout(() => {
            const el = document.getElementById(`sentence-${result.globalIndex}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Add a transient highlight effect using state
                setTransientSearchHighlight(result.globalIndex);
                setTimeout(() => {
                    setTransientSearchHighlight(null);
                }, 2000);
            }
        }, 150);
    };

    const [userHighlights, setUserHighlights] = useState<Set<number>>(new Set());
    const [userNotes, setUserNotes] = useState<Record<number, string>>({});
    const [selectedSentenceForAnnotation, setSelectedSentenceForAnnotation] = useState<number | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Theme
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const [noteDraft, setNoteDraft] = useState("");

    const availablePages = useMemo(() => {
        const pages = new Set<number>();
        flatSentences.forEach(s => pages.add(s.page));
        return Array.from(pages).sort((a, b) => a - b);
    }, [flatSentences]);

    // Voice State
    const [voices, setVoices] = useState<Voice[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<string>("en-US-AriaNeural");
    const [selectedVoiceType, setSelectedVoiceType] = useState<string>("custom");

    // Audio Player State
    const [activeTextIndex, setActiveTextIndex] = useState<number | null>(null);
    const [loadingAudio, setLoadingAudio] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioCacheRef = useRef<Map<number, string>>(new Map());
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);

    // Handle voice type selection
    const selectVoiceType = (typeId: string) => {
        const preset = VOICE_TYPE_PRESETS.find(p => p.id === typeId);
        if (preset) {
            setSelectedVoiceType(typeId);
            setSelectedVoice(preset.voice);
            setPlaybackSpeed(preset.speed);
            // Clear audio cache so next playback uses new voice
            for (const url of Array.from(audioCacheRef.current.values())) {
                URL.revokeObjectURL(url);
            }
            audioCacheRef.current.clear();
        } else {
            setSelectedVoiceType("custom");
        }
    };

    // Revert to Custom when user manually changes voice or speed
    const handleManualVoiceChange = (voice: string) => {
        setSelectedVoice(voice);
        setSelectedVoiceType("custom");
        // Clear cache for new voice
        for (const url of Array.from(audioCacheRef.current.values())) {
            URL.revokeObjectURL(url);
        }
        audioCacheRef.current.clear();
    };

    const handleManualSpeedChange = (speed: number) => {
        setPlaybackSpeed(speed);
        setSelectedVoiceType("custom");
    };

    // Fetch voices on mount
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/voices`)
            .then(res => res.json())
            .then(data => {
                setVoices(data);
                if (data.length > 0) {
                    setSelectedVoice(data[0].name);
                }
            })
            .catch(() => {});
    }, []);

    // Auto-scroll when activeTextIndex changes
    useEffect(() => {
        if (activeTextIndex !== null) {
            const el = document.getElementById(`sentence-${activeTextIndex}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [activeTextIndex]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = playbackSpeed;
        }
    }, [playbackSpeed, audioUrl, isPlaying]);

    // --- PERSISTENCE LOGIC ---
    const getStorageKey = (suffix: string) => {
        if (!file) return null;
        return `vt_v1_${file.name}_${suffix}`;
    };

    // Load state from localStorage when document content is ready
    useEffect(() => {
        if (!file || !isReadingMode || flatSentences.length === 0) return;
        
        // If we already loaded this file, don't reload (avoids loops)
        if (initialLoadDone.current === file.name) return;

        console.log(`Loading state for ${file.name}`);
        const highlightsKey = getStorageKey("highlights");
        const notesKey = getStorageKey("notes");
        const progressKey = getStorageKey("progress");
        const pageKey = getStorageKey("page");

        if (highlightsKey) {
            const saved = localStorage.getItem(highlightsKey);
            if (saved) setUserHighlights(new Set(JSON.parse(saved)));
            else setUserHighlights(new Set());
        }
        if (notesKey) {
            const saved = localStorage.getItem(notesKey);
            if (saved) setUserNotes(JSON.parse(saved));
            else setUserNotes({});
        }
        if (progressKey) {
            const saved = localStorage.getItem(progressKey);
            if (saved) setActiveTextIndex(JSON.parse(saved));
        }
        if (pageKey) {
            const saved = localStorage.getItem(pageKey);
            if (saved) setCurrentPageNumber(JSON.parse(saved));
        }

        initialLoadDone.current = file.name;
    }, [file, isReadingMode, flatSentences]);

    // Save highlights (only if initial load is done for this file)
    useEffect(() => {
        if (!file || initialLoadDone.current !== file.name) return;
        const key = getStorageKey("highlights");
        if (key && userHighlights.size > 0) {
            localStorage.setItem(key, JSON.stringify(Array.from(userHighlights)));
        } else if (key) {
            localStorage.removeItem(key);
        }
    }, [userHighlights, file]);

    // Save notes (only if initial load is done for this file)
    useEffect(() => {
        if (!file || initialLoadDone.current !== file.name) return;
        const key = getStorageKey("notes");
        if (key && Object.keys(userNotes).length > 0) {
            localStorage.setItem(key, JSON.stringify(userNotes));
        } else if (key) {
            localStorage.removeItem(key);
        }
    }, [userNotes, file]);

    // Save reading progress
    useEffect(() => {
        if (!file || initialLoadDone.current !== file.name) return;
        const key = getStorageKey("progress");
        if (key && activeTextIndex !== null) {
            localStorage.setItem(key, JSON.stringify(activeTextIndex));
        }
    }, [activeTextIndex, file]);

    // Save current page
    useEffect(() => {
        if (!file || initialLoadDone.current !== file.name) return;
        const key = getStorageKey("page");
        if (key) {
            localStorage.setItem(key, JSON.stringify(currentPageNumber));
        }
    }, [currentPageNumber, file]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Space for Play/Pause (avoiding inputs)
            if (e.code === 'Space' && 
                !(e.target instanceof HTMLInputElement) && 
                !(e.target instanceof HTMLTextAreaElement)) {
                e.preventDefault();
                togglePlayback();
            }
            // Ctrl + F for Focus Mode
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setIsFocusMode(prev => !prev);
            }
            // Escape to close modals or exit search
            if (e.key === 'Escape') {
                if (isSearchOpen) setIsSearchOpen(false);
                if (isSettingsOpen) setIsSettingsOpen(false);
                if (selectedSentenceForAnnotation !== null) setSelectedSentenceForAnnotation(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSearchOpen, isSettingsOpen, selectedSentenceForAnnotation, isPlaying, activeTextIndex, flatSentences]);
    // --- END PERSISTENCE LOGIC ---

    // Parse the page blocks into individual sentences when content updates
    useEffect(() => {
        const sentences: Sentence[] = [];
        let globalIndex = 0;

        content.forEach((pageData) => {
            // Split by double newline to identify paragraphs
            const paragraphs = pageData.text.split(/\n\n/);

            paragraphs.forEach((paragraph: string, pIndex: number) => {
                if (!paragraph.trim()) return;

                const ABBREVIATIONS = ["Mr", "Mrs", "Ms", "Dr", "Prof", "Sr", "Jr", "vs", "Mt", "St", "U.S", "U.K", "a.m", "p.m"];
                const regex = new RegExp(`(?<!\\b(?:${ABBREVIATIONS.join("|")}))([.?!]+["'\\s]*)`);
                const parts = paragraph.split(regex);
                let currentSentence = "";
                let sentencesInParagraph: number[] = [];

                for (let i = 0; i < parts.length; i++) {
                    currentSentence += parts[i];
                    if (i % 2 !== 0 || i === parts.length - 1) {
                        const trimmed = currentSentence.trim();
                        if (trimmed.length > 0) {
                            sentences.push({
                                globalIndex,
                                text: trimmed,
                                page: pageData.page,
                                isParagraphEnd: false // Default to false, will update the last one
                            });
                            sentencesInParagraph.push(sentences.length - 1);
                            globalIndex++;
                        }
                        currentSentence = "";
                    }
                }

                // Mark the last sentence in the paragraph
                if (sentencesInParagraph.length > 0) {
                    const lastSentenceIndex = sentencesInParagraph[sentencesInParagraph.length - 1];
                    sentences[lastSentenceIndex].isParagraphEnd = true;
                }
            });
        });
        setFlatSentences(sentences);
    }, [content]);

    // Preload audio chunk function
    const preloadAudio = async (index: number) => {
        if (index >= flatSentences.length || audioCacheRef.current.has(index)) return;
        try {
            const sentenceText = flatSentences[index].text;
            const url = `${API_BASE_URL}/api/tts?text=${encodeURIComponent(sentenceText)}&voice=${encodeURIComponent(selectedVoice)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("TTS fetch failed");
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            audioCacheRef.current.set(index, objectUrl);
        } catch (e) {
            console.error("Failed to preload:", e);
        }
    };

    // Preload next sentences when active matches
    useEffect(() => {
        if (activeTextIndex !== null) {
            preloadAudio(activeTextIndex + 1);
            preloadAudio(activeTextIndex + 2);

            // Cleanup old blobs to prevent memory leaks
            for (const [key, url] of Array.from(audioCacheRef.current.entries())) {
                if (key < activeTextIndex - 2 || key > activeTextIndex + 10) {
                    URL.revokeObjectURL(url);
                    audioCacheRef.current.delete(key);
                }
            }
        }
    }, [activeTextIndex, flatSentences, selectedVoice]);

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);
        setProcessingStep("Sending to server...");
        resetAudio();
        setContent([]);
        setFlatSentences([]);
        setUserHighlights(new Set());
        setUserNotes({});
        initialLoadDone.current = null;

        const fd = new FormData();
        fd.append("file", file);
        try {
            const res = await fetch(`${API_BASE_URL}/api/upload`, {
                method: "POST",
                body: fd,
            });
            setProcessingStep("Extracting text...");
            const data = await res.json();
            
            setProcessingStep("Splitting into sentences...");
            setContent(data.content);
            if (data.content && data.content.length > 0) {
                setCurrentPageNumber(data.content[0].page);
                setIsReadingMode(true);
            }
        } catch (err) {
            alert("Could not connect to the backend server. Please start the Python server (python server.py) first.");
        }
        setLoading(false);
        setProcessingStep("");
    };

    const exitReadingMode = () => {
        setIsReadingMode(false);
        resetAudio();
    };

    const resetAudio = () => {
        if (audioUrl && audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
        setIsPlaying(false);
        setActiveTextIndex(null);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }

        // Clear cache
        for (const url of Array.from(audioCacheRef.current.values())) {
            URL.revokeObjectURL(url);
        }
        audioCacheRef.current.clear();
    };

    const playSentence = async (index: number) => {
        if (index < 0 || index >= flatSentences.length) return;

        if (activeTextIndex === index) {
            // Toggle play/pause for the same sentence
            if (audioRef.current) {
                if (isPlaying) {
                    audioRef.current.pause();
                } else {
                    audioRef.current.play();
                }
            }
            return;
        }

        // Play new sentence
        setLoadingAudio(true);
        setActiveTextIndex(index);
        const sentenceText = flatSentences[index].text;

        try {
            const cachedUrl = audioCacheRef.current.get(index);
            if (cachedUrl) {
                setAudioUrl(cachedUrl);
            } else {
                const url = `${API_BASE_URL}/api/tts?text=${encodeURIComponent(sentenceText)}&voice=${encodeURIComponent(selectedVoice)}`;
                setAudioUrl(url);
            }
        } catch (err) {
            console.error(err);
            setActiveTextIndex(null);
            setIsPlaying(false);
            setLoadingAudio(false);
        } finally {
            setSelectedSentenceForAnnotation(null);
        }
    };

    const cycleSpeed = () => {
        const speeds = [1, 1.25, 1.5, 2, 2.5, 3];
        const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
        setPlaybackSpeed(speeds[nextIndex]);
    };

    const togglePlayback = () => {
        if (activeTextIndex === null && flatSentences.length > 0) {
            playSentence(0);
            return;
        }
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
    };

    const handleAudioEnded = () => {
        setIsPlaying(false);
        if (activeTextIndex !== null && activeTextIndex < flatSentences.length - 1) {
            playSentence(activeTextIndex + 1);
        } else {
            setActiveTextIndex(null);
        }
    };

    // Sync page with playing sentence or manual scroll
    useEffect(() => {
        if (activeTextIndex !== null) {
            const currentSentence = flatSentences[activeTextIndex];
            if (currentSentence) {
                setCurrentPageNumber(prevPage =>
                    currentSentence.page !== prevPage ? currentSentence.page : prevPage
                );
            }
        }
    }, [activeTextIndex, flatSentences]);

    // Track scroll to update page number
    useEffect(() => {
        if (!isReadingMode || flatSentences.length === 0) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const page = parseInt(entry.target.getAttribute('data-page') || '1');
                    setCurrentPageNumber(page);
                }
            });
        }, { threshold: 0.1, rootMargin: '-10% 0px -80% 0px' });

        // Observe elements that mark page boundaries or every sentence
        // For simplicity and accuracy, we'll observe a sampling of sentences
        flatSentences.forEach((s, i) => {
            if (i % 10 === 0 || s.isParagraphEnd) { // Check every 10 sentences or end of paragraphs
                const el = document.getElementById(`sentence-${s.globalIndex}`);
                if (el) observer.observe(el);
            }
        });

        return () => observer.disconnect();
    }, [isReadingMode, flatSentences, isReadingMode]);

    const toggleHighlight = (index: number) => {
        setUserHighlights(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
        setSelectedSentenceForAnnotation(null);
    };

    const saveNote = (index: number) => {
        if (noteDraft.trim()) {
            setUserNotes(prev => ({ ...prev, [index]: noteDraft.trim() }));
        } else {
            setUserNotes(prev => {
                const copy = { ...prev };
                delete copy[index];
                return copy;
            });
        }
        setSelectedSentenceForAnnotation(null);
        setNoteDraft("");
    };

    const handleSentenceClick = (index: number) => {
        if (selectedSentenceForAnnotation === index) {
            setSelectedSentenceForAnnotation(null);
        } else {
            setSelectedSentenceForAnnotation(index);
            setNoteDraft(userNotes[index] || "");
        }
    };

    // Render all sentences (Vertical Scroll)
    const sentencesToRender = flatSentences;

    return (
        <div className="relative flex min-h-screen flex-col overflow-x-hidden">
            {!isReadingMode ? (
                <div className="layout-container flex h-full grow flex-col">
                    {/* Header/Navigation */}
                    <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 lg:px-20 py-4 bg-background-light dark:bg-background-dark/80 backdrop-blur-md sticky top-0 z-50">
                        <div className="flex items-center gap-2 text-black dark:text-white">
                            <img src="/logo.png" alt="Voice Tech Logo" className="h-10 w-10 object-contain" />
                            <h2 className="text-slate-900 dark:text-white text-2xl font-bold tracking-tight">Voice Tech</h2>
                        </div>
                        <div className="flex flex-1 justify-end gap-6 items-center">
                            <nav className="hidden md:flex items-center gap-8">
                                <a className="text-slate-600 dark:text-slate-300 text-sm font-medium hover:text-black dark:hover:text-white transition-colors" href="#">Library</a>
                                <a href="#" onClick={(e) => { e.preventDefault(); setIsSettingsOpen(true); }} className="text-slate-600 dark:text-slate-300 text-sm font-medium hover:text-black dark:hover:text-white transition-colors">Voice Settings</a>
                                <a className="text-slate-600 dark:text-slate-300 text-sm font-medium hover:text-black dark:hover:text-white transition-colors" href="#">Premium</a>
                            </nav>
                            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 hidden md:block"></div>
                            <button className="flex items-center justify-center rounded-lg h-10 w-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-black/10 dark:hover:bg-white/10 hover:text-black dark:hover:text-white transition-all">
                                <span className="material-symbols-outlined">person</span>
                            </button>
                        </div>
                    </header>

                    <main className="flex-1 px-6 lg:px-40 py-12 max-w-[1200px] mx-auto w-full">
                        {/* Hero Section */}
                        <section className="text-center mb-16">
                            <h1 className="text-slate-900 dark:text-white text-4xl lg:text-5xl font-extrabold tracking-tight mb-4">
                                Turn any document into an <span className="text-black dark:text-white font-black">audiobook</span>
                            </h1>
                            <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl mx-auto">
                                Experience your favorite articles and books through high-quality AI voices. Simply upload and listen.
                            </p>
                        </section>

                        {/* Upload Area */}
                        <section className="mb-16">
                            <label className="group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/30 hover:border-black dark:hover:border-white hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-300 px-8 py-20 cursor-pointer">
                                <div className="flex flex-col items-center gap-6">
                                    <div className="size-20 flex items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-black dark:text-white group-hover:scale-110 transition-transform">
                                        {loading ? (
                                            <svg className="animate-spin h-8 w-8 text-black dark:text-white" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        ) : (
                                            <span className="material-symbols-outlined text-4xl">cloud_upload</span>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-center gap-2 text-center">
                                        <h3 className="text-slate-900 dark:text-white text-2xl font-bold">
                                            {file ? file.name : "Drag and drop your file"}
                                        </h3>
                                        <p className="text-slate-600 dark:text-slate-400">PDF, TXT, or Image files up to 50MB</p>
                                    </div>

                                    <input
                                        type="file"
                                        className="hidden"
                                        onChange={r => {
                                            const selectedFile = r.target.files?.[0] || null;
                                            setFile(selectedFile);
                                        }}
                                        accept=".pdf,.txt,.png,.jpg,.jpeg"
                                    />

                                    {file && !loading ? (
                                        <button
                                            onClick={(e) => { e.preventDefault(); handleUpload(); }}
                                            className="flex items-center justify-center rounded-lg h-12 px-8 bg-black dark:bg-white text-white dark:text-black text-base font-bold shadow-lg shadow-black/25 hover:bg-gray-800 dark:hover:bg-gray-200 transition-all active:scale-95 z-10"
                                        >
                                            Start Reading
                                        </button>
                                    ) : (
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="flex items-center justify-center rounded-lg h-12 px-8 bg-black dark:bg-white text-white dark:text-black text-base font-bold shadow-lg shadow-black/25 hover:bg-gray-800 dark:hover:bg-gray-200 transition-all active:scale-95">
                                                {loading ? "Processing..." : "Browse Files"}
                                            </div>
                                            {loading && processingStep && (
                                                <p className="text-sm font-medium text-slate-500 animate-pulse">{processingStep}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </label>

                            {/* Supported Formats Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
                                <div className="flex items-center gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5">
                                    <div className="flex size-12 items-center justify-center rounded-lg bg-black/10 dark:bg-white/10 text-black dark:text-white">
                                        <span className="material-symbols-outlined">picture_as_pdf</span>
                                    </div>
                                    <div>
                                        <h4 className="text-slate-900 dark:text-white font-bold">PDF Support</h4>
                                        <p className="text-xs text-slate-500">Documents &amp; E-books</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5">
                                    <div className="flex size-12 items-center justify-center rounded-lg bg-black/10 dark:bg-white/10 text-black dark:text-white">
                                        <span className="material-symbols-outlined">description</span>
                                    </div>
                                    <div>
                                        <h4 className="text-slate-900 dark:text-white font-bold">Text Files</h4>
                                        <p className="text-xs text-slate-500">TXT &amp; Markdown</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5">
                                    <div className="flex size-12 items-center justify-center rounded-lg bg-black/10 dark:bg-white/10 text-black dark:text-white">
                                        <span className="material-symbols-outlined">image</span>
                                    </div>
                                    <div>
                                        <h4 className="text-slate-900 dark:text-white font-bold">Image OCR</h4>
                                        <p className="text-xs text-slate-500">JPG, PNG Scanning</p>
                                    </div>
                                </div>
                            </div>
                        </section>


                    </main>

                    {/* Footer */}
                    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 py-10 px-6 lg:px-20">
                        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="flex items-center gap-2 text-slate-400">
                                <img src="/logo.png" alt="Voice Tech Logo" className="h-8 w-8 object-contain grayscale opacity-60" />
                                <span className="text-sm">© 2024 Voice Tech AI. Distraction-free listening.</span>
                            </div>
                            <div className="flex gap-8">
                                <a className="text-slate-500 hover:text-black dark:hover:text-white text-xs uppercase tracking-widest font-bold transition-colors" href="#">Privacy</a>
                                <a className="text-slate-500 hover:text-black dark:hover:text-white text-xs uppercase tracking-widest font-bold transition-colors" href="#">Terms</a>
                                <a className="text-slate-500 hover:text-black dark:hover:text-white text-xs uppercase tracking-widest font-bold transition-colors" href="#">Support</a>
                                <a className="text-slate-500 hover:text-black dark:hover:text-white text-xs uppercase tracking-widest font-bold transition-colors" href="#">API</a>
                            </div>
                        </div>
                    </footer>
                </div>
            ) : (
                /* Reading View */
                <div className="flex flex-col min-h-screen relative">
                    {/* Top Navigation Bar */}
                    <header className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-6 py-3 transition-transform duration-500 ${isFocusMode ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
                        <div className="flex items-center gap-3">
                            <button onClick={exitReadingMode} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors flex items-center justify-center">
                                <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">arrow_back</span>
                            </button>
                            <div className="flex flex-col">
                                <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 max-w-xs truncate">{file?.name || "Document"}</h1>
                                <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold">Page {currentPageNumber} of {availablePages[availablePages.length - 1] || 1}</p>
                            </div>
                        </div>

                        {/* Focus Toggle (Always accessible in header center if needed, but here we place it in buttons) */}
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setIsFocusMode(!isFocusMode)} 
                                className={`flex items-center justify-center p-2 rounded-lg transition-all ${isFocusMode ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                                title={isFocusMode ? "Disable Focus Mode" : "Enable Focus Mode"}
                            >
                                <span className="material-symbols-outlined">{isFocusMode ? 'visibility_off' : 'visibility'}</span>
                            </button>
                            <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="flex items-center justify-center p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors">
                                <span className="material-symbols-outlined">search</span>
                            </button>
                            <button onClick={() => setIsSettingsOpen(true)} className="flex items-center justify-center p-2 rounded-lg hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined">settings_slow_motion</span>
                            </button>
                            <button className="flex items-center justify-center p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined">text_fields</span>
                            </button>
                            <button className="flex items-center justify-center p-2 rounded-lg bg-black/10 dark:bg-white/10 text-black dark:text-white">
                                <img src="/logo.png" alt="Logo" className="h-8 w-8 object-contain invert dark:invert-0" />
                            </button>
                        </div>

                        {/* Search Dropdown */}
                        {isSearchOpen && (
                            <div className="absolute top-16 right-6 w-80 md:w-96 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 z-[100]">
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Search document..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-black dark:focus:ring-white text-slate-900 dark:text-slate-100 shadow-inner"
                                        aria-label="Search document"
                                    />
                                </div>

                                {searchQuery.trim() !== "" && (
                                    <div className="max-h-[60vh] overflow-y-auto flex flex-col gap-2 minimal-scrollbar pr-1">
                                        {searchResults.length > 0 ? searchResults.map(res => (
                                            <div
                                                key={res.globalIndex}
                                                onClick={() => handleSearchResultClick(res)}
                                                className="p-3 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                                            >
                                                <div className="flex justify-between items-center mb-1">
                                                    <p className="text-xs text-black dark:text-white font-bold flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[14px]">find_in_page</span>
                                                        Page {res.page}
                                                    </p>
                                                    <span className="text-[10px] text-slate-400">Match</span>
                                                </div>
                                                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3 leading-relaxed">
                                                    {res.text}
                                                </p>
                                            </div>
                                        )) : (
                                            <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-500">
                                                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">search_off</span>
                                                <p className="text-sm">No results found for "{searchQuery}"</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </header>

                    {/* Floating Focus Mode Toggle (Visible only when focus mode is active) */}
                    {isFocusMode && (
                        <button
                            onClick={() => setIsFocusMode(false)}
                            className="fixed top-4 right-4 z-[60] size-10 flex items-center justify-center rounded-full bg-slate-900/20 dark:bg-white/20 text-slate-900 dark:text-white backdrop-blur-md hover:bg-slate-900/30 dark:hover:bg-white/30 transition-all border border-slate-900/10 dark:border-white/10 shadow-lg"
                            title="Exit Focus Mode (Ctrl+F)"
                        >
                            <span className="material-symbols-outlined text-lg">visibility_off</span>
                        </button>
                    )}
                    {/* Reader Progress Bar (Fixed Top) */}
                    <div className={`fixed top-[57px] left-0 right-0 z-50 h-1 bg-slate-200 dark:bg-slate-800 transition-opacity duration-500 ${isFocusMode ? 'opacity-0' : 'opacity-100'}`}>
                        <div className="h-full bg-black dark:bg-white transition-all duration-300 ease-out" style={{ width: `${activeTextIndex !== null && flatSentences.length > 0 ? ((activeTextIndex + 1) / flatSentences.length) * 100 : 0}%` }}></div>
                    </div>

                    {/* Main Content Area */}
                    <main 
                        className="relative min-h-screen pt-24 pb-32 px-6 md:px-12 flex justify-center"
                    >
                        <article className="max-w-[800px] w-full mx-auto font-serif text-xl md:text-3xl leading-relaxed md:leading-[1.8] text-slate-800 dark:text-slate-200">
                            {sentencesToRender.length === 0 ? (
                                <p className="text-center text-slate-500 dark:text-slate-400 py-20 font-light text-2xl">No text to display.</p>
                            ) : (
                                <div className="whitespace-pre-wrap transition-all duration-500">
                                    {sentencesToRender.map((sentence) => {
                                        const isActive = activeTextIndex === sentence.globalIndex;
                                        const isHighlighted = userHighlights.has(sentence.globalIndex);
                                        const hasNote = !!userNotes[sentence.globalIndex];
                                        const isSearchResult = transientSearchHighlight === sentence.globalIndex;
                                        const isSelected = selectedSentenceForAnnotation === sentence.globalIndex;

                                        let styleClasses = "cursor-pointer transition-all duration-300 inline py-0.5 md:py-1 pr-1 relative z-10 ";

                                        if (isActive) {
                                            styleClasses += "bg-black/10 dark:bg-white/20 border-l-4 border-black dark:border-white pl-4 py-1 inline-block rounded-r-lg text-black dark:text-white font-medium ";
                                        } else if (isSearchResult) {
                                            styleClasses += "!bg-black/20 dark:!bg-white/30 !ring-4 !ring-black dark:!ring-white shadow-2xl pl-1 rounded-lg ";
                                        } else if (isHighlighted && isSelected) {
                                            styleClasses += "bg-gray-300/50 dark:bg-gray-500/50 text-black dark:text-white pl-1 ring-4 ring-black dark:ring-white rounded-lg ";
                                        } else if (isHighlighted) {
                                            styleClasses += "bg-gray-300/30 dark:bg-gray-500/30 text-black dark:text-white pl-1 rounded-lg ";
                                        } else if (isSelected) {
                                            styleClasses += "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white pl-1 ring-4 ring-slate-400 rounded-lg shadow-2xl ";
                                        } else {
                                            styleClasses += "hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white pl-1 rounded-lg ";
                                        }

                                        return (
                                            <span key={sentence.globalIndex} className="relative inline" data-page={sentence.page}>
                                                <span
                                                    id={`sentence-${sentence.globalIndex}`}
                                                    onClick={() => handleSentenceClick(sentence.globalIndex)}
                                                    onDoubleClick={() => playSentence(sentence.globalIndex)}
                                                    className={styleClasses}
                                                    title="Double-click to play, Single-click to annotate"
                                                >
                                                    {sentence.text + " "}
                                                </span>
                                                {hasNote && !isActive && !isSelected && (
                                                    <span className="absolute -top-4 -right-2 text-xl drop-shadow-md z-20" title={userNotes[sentence.globalIndex]}>📌</span>
                                                )}
                                                {sentence.isParagraphEnd && <><br /><br /></>}

                                                {/* Annotation Popup Context Menu */}
                                                {isSelected && (
                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 z-50 glass-dark rounded-2xl shadow-2xl p-5 w-80 font-sans text-base animate-in fade-in zoom-in duration-200">
                                                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-900 border-t border-l border-slate-700/50 rotate-45"></div>
                                                        <div className="relative">
                                                            <div className="flex gap-3 mb-4">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); toggleHighlight(sentence.globalIndex); }}
                                                                    className={`flex-1 text-sm py-2.5 rounded-xl font-bold transition-all shadow-sm ${isHighlighted ? 'bg-white/20 text-white hover:bg-white/30 border border-white/30' : 'bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-600'}`}
                                                                >
                                                                    {isHighlighted ? "Remove Highlight" : "Highlight"}
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); playSentence(sentence.globalIndex); }}
                                                                    className="flex-1 text-sm py-2.5 rounded-xl font-bold bg-white/20 text-white hover:bg-white/30 border border-white/30 transition-all shadow-sm flex items-center justify-center gap-2"
                                                                >
                                                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                                                    Play
                                                                </button>
                                                            </div>
                                                            <textarea
                                                                value={noteDraft}
                                                                onChange={(e) => setNoteDraft(e.target.value)}
                                                                placeholder="Add a sticky note..."
                                                                className="w-full h-28 bg-gray-950 border border-gray-700/50 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-white focus:ring-1 focus:ring-white resize-none mb-4 shadow-inner"
                                                            />
                                                            <div className="flex justify-between items-center">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setSelectedSentenceForAnnotation(null); }}
                                                                    className="text-sm text-gray-400 hover:text-white font-medium px-3 py-2 transition-colors rounded-lg hover:bg-gray-800"
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); saveNote(sentence.globalIndex); }}
                                                                    className="text-sm bg-black hover:bg-gray-800 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-black/50 transition-all active:scale-95"
                                                                >
                                                                    Save Note
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </article>
                    </main>

                    {/* Audio Element (Hidden) */}
                    {audioUrl && (
                        <audio
                            ref={audioRef}
                            src={audioUrl}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onEnded={handleAudioEnded}
                            onWaiting={() => setLoadingAudio(true)}
                            onPlaying={() => { setIsPlaying(true); setLoadingAudio(false); }}
                            onCanPlay={() => setLoadingAudio(false)}
                            autoPlay
                        />
                    )}

                    {/* Playback Controls (Sticky Bottom) */}
                    {flatSentences.length > 0 && (
                        <footer className={`fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-slate-800 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-xl px-4 md:px-12 py-4 md:py-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] transition-transform duration-500 ${isFocusMode ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
                            <div className="max-w-4xl mx-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-4 md:p-6 pointer-events-auto transition-transform">
                                <div className="flex flex-col gap-4 md:gap-6">
                                    {/* Visual Progress Bar (Non-interactive yet) */}
                                    <div className="space-y-2">
                                        <div className="relative h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className="absolute top-0 left-0 h-full bg-black dark:bg-white rounded-full transition-all duration-300 ease-out"
                                                style={{ width: `${activeTextIndex !== null ? ((activeTextIndex + 1) / flatSentences.length) * 100 : 0}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] md:text-xs font-medium text-slate-500 font-mono">
                                            <span>Sentence {activeTextIndex !== null ? activeTextIndex + 1 : 0}</span>
                                            <span>{flatSentences.length} Total</span>
                                        </div>
                                    </div>

                                    {/* Controls Row */}
                                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                                        {/* Left: Voice Selection */}
                                        <div className="flex items-center gap-3 w-full md:w-auto">
                                            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-full md:w-auto overflow-hidden">
                                                <span className="material-symbols-outlined text-slate-500 text-sm ml-2 hidden sm:block">record_voice_over</span>
                                                <select
                                                    value={selectedVoice}
                                                    onChange={(e) => handleManualVoiceChange(e.target.value)}
                                                    className="bg-transparent border-none text-xs font-bold text-slate-700 dark:text-slate-300 focus:ring-0 py-1 pl-1 pr-6 cursor-pointer max-w-[150px] truncate"
                                                >
                                                    {voices.map(v => (
                                                        <option key={v.name} value={v.name} className="bg-white dark:bg-slate-800">{v.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Center: Playback Buttons */}
                                        <div className="flex items-center gap-4 md:gap-6 order-first md:order-none w-full md:w-auto justify-center">
                                            <button
                                                onClick={() => playSentence(Math.max(0, (activeTextIndex || 0) - 1))}
                                                disabled={activeTextIndex === null || activeTextIndex === 0 || loadingAudio}
                                                className="p-2 text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-white disabled:opacity-30 transition-colors flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-black/10 dark:hover:bg-white/10 rounded-full"
                                            >
                                                <span className="material-symbols-outlined text-2xl">skip_previous</span>
                                            </button>

                                            <button
                                                onClick={togglePlayback}
                                                disabled={loadingAudio}
                                                className="size-12 md:size-16 flex items-center justify-center bg-black dark:bg-white text-white dark:text-black rounded-full hover:bg-gray-800 dark:hover:bg-gray-200 shadow-[0_8px_16px_rgba(0,0,0,0.3)] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 touch-manipulation flex-shrink-0"
                                            >
                                                {loadingAudio ? (
                                                    <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                ) : isPlaying ? (
                                                    <span className="material-symbols-outlined text-3xl md:text-4xl">pause</span>
                                                ) : (
                                                    <span className="material-symbols-outlined text-3xl md:text-4xl ml-1">play_arrow</span>
                                                )}
                                            </button>

                                            <button
                                                onClick={() => playSentence(Math.min(flatSentences.length - 1, (activeTextIndex || 0) + 1))}
                                                disabled={activeTextIndex === null || activeTextIndex === flatSentences.length - 1 || loadingAudio}
                                                className="p-2 text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-white disabled:opacity-30 transition-colors flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-black/10 dark:hover:bg-white/10 rounded-full"
                                            >
                                                <span className="material-symbols-outlined text-2xl">skip_next</span>
                                            </button>
                                        </div>

                                        {/* Right: Speed */}
                                        <div className="flex items-center justify-end w-full md:w-auto">
                                            <button
                                                onClick={cycleSpeed}
                                                className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-black dark:hover:bg-white hover:border-black dark:hover:border-white hover:text-white dark:hover:text-black transition-all font-mono"
                                                title="Playback Speed"
                                            >
                                                {playbackSpeed}x
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </footer>
                    )}
                </div>
            )}

            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all">
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined">tune</span>
                                Settings
                            </h3>
                            <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Appearance */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">palette</span>
                                    Appearance
                                </label>
                                {mounted && (
                                    <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                                        <button onClick={() => setTheme('light')} className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${theme === 'light' ? 'bg-white dark:bg-slate-700 shadow-sm text-black dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                                            <span className="material-symbols-outlined text-[18px]">light_mode</span> Light
                                        </button>
                                        <button onClick={() => setTheme('dark')} className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${theme === 'dark' ? 'bg-white dark:bg-slate-700 shadow-sm text-black dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                                            <span className="material-symbols-outlined text-[18px]">dark_mode</span> Dark
                                        </button>
                                        <button onClick={() => setTheme('system')} className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${theme === 'system' ? 'bg-white dark:bg-slate-700 shadow-sm text-black dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                                            <span className="material-symbols-outlined text-[18px]">computer</span> System
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Voice Type */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">graphic_eq</span>
                                    Voice Type
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {VOICE_TYPE_PRESETS.map(preset => (
                                        <button
                                            key={preset.id}
                                            onClick={() => selectVoiceType(preset.id)}
                                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 text-center ${selectedVoiceType === preset.id
                                                    ? 'border-black dark:border-white bg-black/10 dark:bg-white/20 shadow-md shadow-black/10'
                                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-black/50 dark:hover:border-white/50 hover:bg-black/5 dark:hover:bg-white/5'
                                                }`}
                                        >
                                            <span className={`material-symbols-outlined text-xl ${selectedVoiceType === preset.id ? 'text-black dark:text-white' : 'text-slate-400 dark:text-slate-500'
                                                }`}>{preset.icon}</span>
                                            <span className={`text-xs font-bold ${selectedVoiceType === preset.id ? 'text-black dark:text-white' : 'text-slate-700 dark:text-slate-300'
                                                }`}>{preset.label}</span>
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">{preset.description}</span>
                                        </button>
                                    ))}
                                </div>
                                {selectedVoiceType !== "custom" && (
                                    <p className="text-[11px] text-black/70 dark:text-white/70 font-medium flex items-center gap-1 mt-1">
                                        <span className="material-symbols-outlined text-[14px]">info</span>
                                        Manually changing voice or speed below will switch to Custom mode
                                    </p>
                                )}
                            </div>

                            {/* Voice Selection */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">record_voice_over</span>
                                    Neural Voice Engine
                                    {selectedVoiceType !== "custom" && (
                                        <span className="text-[10px] text-black dark:text-white bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded-full font-bold ml-auto">
                                            Set by {VOICE_TYPE_PRESETS.find(p => p.id === selectedVoiceType)?.label}
                                        </span>
                                    )}
                                </label>
                                <select
                                    value={selectedVoice}
                                    onChange={(e) => handleManualVoiceChange(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl h-12 px-4 focus:ring-2 focus:ring-black dark:focus:ring-white text-slate-900 dark:text-slate-100 font-medium cursor-pointer"
                                >
                                    {voices.map(v => (
                                        <option key={v.name} value={v.name}>{v.name} ({v.locale} - {v.gender})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Playback Speed */}
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">speed</span>
                                    Playback Speed
                                    {selectedVoiceType !== "custom" && (
                                        <span className="text-[10px] text-black dark:text-white bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded-full font-bold ml-auto">
                                            Set by {VOICE_TYPE_PRESETS.find(p => p.id === selectedVoiceType)?.label}
                                        </span>
                                    )}
                                </label>
                                <div className="flex gap-2">
                                    {[0.75, 1.0, 1.25, 1.5, 2.0].map(speed => (
                                        <button
                                            key={speed}
                                            onClick={() => handleManualSpeedChange(speed)}
                                            className={`flex-1 h-10 md:h-12 rounded-xl font-bold transition-colors ${playbackSpeed === speed ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-slate-50 dark:bg-slate-800 hover:bg-black/10 dark:hover:bg-white/10 hover:text-black dark:hover:text-white'}`}
                                        >
                                            {speed}x
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
