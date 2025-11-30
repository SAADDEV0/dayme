
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Search, Calendar, ChevronLeft, ChevronRight,
  Trash2, Edit3, Image as ImageIcon, Loader2, LogIn, X, 
  CheckSquare, Square, BookHeart, LogOut, Star, LayoutGrid, Type,
  Filter, Grid3X3, Home, MoreHorizontal, Check, Maximize2, Wand2, AlignLeft, Calendar as CalendarIcon,
  Play, Video, Film
} from 'lucide-react';
import { JournalEntry, ViewState, JournalAttachment, GoogleConfig, ChecklistItem } from './types';
import { DriveService } from './services/driveService';
import { Button, TextArea, Input } from './components/Components';

// --- Constants ---
const GOOGLE_CLIENT_ID = "111426887413-md2gvq2djc7p7qqgp57p5v0s1eichp8b.apps.googleusercontent.com";
const GOOGLE_API_KEY = "AIzaSyA7EBoWEqbAYkTdCDKsm3kD-6vL21CdRkY";

const MOODS = [
  { id: 'happy', emoji: '🥰', label: 'Happy', color: 'bg-amber-400' },
  { id: 'excited', emoji: '🤩', label: 'Excited', color: 'bg-orange-400' },
  { id: 'calm', emoji: '😌', label: 'Calm', color: 'bg-sky-400' },
  { id: 'neutral', emoji: '😐', label: 'Neutral', color: 'bg-stone-400' },
  { id: 'tired', emoji: '😴', label: 'Tired', color: 'bg-purple-400' },
  { id: 'sad', emoji: '😔', label: 'Sad', color: 'bg-indigo-400' },
  { id: 'angry', emoji: '😤', label: 'Angry', color: 'bg-rose-500' },
];

const thumbnailCache = new Map<string, string>();

// --- Hooks ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

// --- Sub-Components ---

const LoadingScreen = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-surface-400 animate-fade-in">
    <Loader2 className="w-8 h-8 animate-spin mb-4 text-brand-500" />
    <p className="font-medium text-xs uppercase tracking-widest opacity-60">{message}</p>
  </div>
);

const SecureImage = ({ 
    fileId, 
    thumbnailUrl,
    fallbackSrc, 
    alt, 
    className, 
    imgClassName = "w-full h-full object-cover",
    onLoad 
}: { 
    fileId?: string, 
    thumbnailUrl?: string,
    fallbackSrc?: string, 
    alt: string, 
    className?: string,
    imgClassName?: string,
    onLoad?: () => void
}) => {
    const [src, setSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Cache key prioritizes the thumbnail URL as it's more specific to resolution
    const cacheKey = thumbnailUrl || fileId;

    useEffect(() => {
        let active = true;

        const load = async () => {
            if (!fileId && !thumbnailUrl) {
                if (active) setIsLoading(false);
                return;
            }

            // Memory Cache Hit (Fastest - Level 1)
            if (cacheKey && thumbnailCache.has(cacheKey)) {
                if (active) {
                    setSrc(thumbnailCache.get(cacheKey)!);
                    setIsLoading(false);
                    if (onLoad) onLoad();
                }
                return;
            }

            setIsLoading(true);
            setHasError(false);

            try {
                let blobUrl: string | null = null;

                // Priority 1: Thumbnail Link (optimized size)
                if (thumbnailUrl) {
                    try {
                        blobUrl = await DriveService.fetchAuthenticatedBlob(thumbnailUrl);
                    } catch (e) {
                        // console.warn("SecureImage: Thumbnail fetch failed, attempting fallback...");
                    }
                }

                // Priority 2: Full Media Download (if thumbnail failed or not provided)
                if (!blobUrl && fileId) {
                    try {
                        blobUrl = await DriveService.downloadMedia(fileId);
                    } catch (e) {
                         console.warn(`SecureImage: Failed to fetch ID ${fileId}`, e);
                    }
                }

                if (active) {
                    if (blobUrl) {
                        if (cacheKey) thumbnailCache.set(cacheKey, blobUrl);
                        setSrc(blobUrl);
                        if (onLoad) onLoad();
                    } else {
                         setHasError(true);
                    }
                }
            } catch (err) {
                if (active) setHasError(true);
            } finally {
                if (active) setIsLoading(false);
            }
        };

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                load();
                observer.disconnect();
            }
        }, { rootMargin: '200px' });

        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [fileId, thumbnailUrl, cacheKey, onLoad]);

    if (hasError) {
        return (
            <div className={`flex flex-col items-center justify-center bg-surface-100 dark:bg-surface-800 text-surface-400 ${className}`}>
                <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
            </div>
        );
    }

    return (
        <div ref={containerRef} className={`relative ${className?.includes('overflow-') ? '' : 'overflow-hidden'} ${className?.includes('bg-') ? '' : 'bg-surface-100 dark:bg-surface-800'} ${className}`}>
             {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-surface-50 dark:bg-surface-800">
                    <Loader2 className="w-5 h-5 animate-spin text-surface-300" />
                </div>
            )}
            {(src || fallbackSrc) && (
                <img 
                    src={src || fallbackSrc} 
                    alt={alt} 
                    className={`${imgClassName} transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                />
            )}
        </div>
    );
};

const SecureVideoPlayer = ({ fileId, className, autoPlay }: { fileId: string, className?: string, autoPlay?: boolean }) => {
    const [src, setSrc] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;
        DriveService.downloadMedia(fileId).then(url => {
            if (active) setSrc(url);
        }).catch(e => {
            console.error(e);
            if (active) setError(true);
        });
        return () => { active = false; };
    }, [fileId]);

    if (error) return (
        <div className={`flex flex-col items-center justify-center bg-black text-surface-400 ${className}`}>
            <Video className="w-8 h-8 opacity-50 mb-2" />
            <span className="text-xs">Error loading video</span>
        </div>
    );

    if (!src) return (
        <div className={`flex items-center justify-center bg-black text-white ${className}`}>
            <Loader2 className="w-8 h-8 animate-spin text-white/50" />
        </div>
    );

    return (
        <video 
            src={src} 
            controls 
            autoPlay={autoPlay} 
            playsInline
            className={`bg-black ${className}`} 
        />
    );
};

// --- Views ---

const LoginView: React.FC<{ onLogin: () => void }> = ({ onLogin }) => (
  <div className="h-[100dvh] flex flex-col items-center justify-center p-6 bg-surface-50 dark:bg-surface-950">
      <div className="w-full max-w-md bg-white dark:bg-surface-900 rounded-3xl p-8 md:p-12 shadow-soft border border-surface-200 dark:border-surface-800 text-center animate-slide-up">
          <div className="w-16 h-16 bg-brand-500 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg transform -rotate-3">
              <BookHeart className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-surface-900 dark:text-white mb-3">Dayme</h1>
          <p className="text-surface-500 mb-8 text-sm leading-relaxed">
              A safe space for your thoughts. Encrypted and stored in your Google Drive.
          </p>
          <button onClick={onLogin} className="w-full flex items-center justify-center gap-3 bg-surface-900 dark:bg-white text-white dark:text-surface-900 font-medium py-3 rounded-xl hover:scale-[1.02] transition-transform shadow-md">
              <LogIn className="w-4 h-4" />
              Sign in with Google
          </button>
      </div>
  </div>
);

const Sidebar = ({ 
    activeView, 
    onChangeView, 
    onSignOut 
}: { 
    activeView: ViewState['type'], 
    onChangeView: (v: ViewState['type']) => void,
    onSignOut: () => void
}) => {
    return (
        <div className="hidden md:flex flex-col w-20 h-full sticky top-0 py-6 items-center bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800 z-50">
            <div className="mb-10">
                <div className="w-10 h-10 bg-brand-500 text-white rounded-lg flex items-center justify-center shadow-md">
                    <BookHeart className="w-6 h-6" />
                </div>
            </div>

            <nav className="flex-1 flex flex-col gap-4 w-full px-3 items-center">
                <button 
                    onClick={() => onChangeView('LIST')}
                    title="Gallery"
                    className={`p-3 rounded-xl transition-all duration-300 ${activeView === 'LIST' ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400' : 'text-surface-400 hover:text-surface-900 dark:hover:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800'}`}
                >
                    <Grid3X3 className="w-5 h-5" />
                </button>
                
                <button 
                    onClick={() => onChangeView('CALENDAR')}
                    title="Calendar"
                    className={`p-3 rounded-xl transition-all duration-300 ${activeView === 'CALENDAR' ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400' : 'text-surface-400 hover:text-surface-900 dark:hover:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800'}`}
                >
                    <Calendar className="w-5 h-5" />
                </button>

                <button 
                    onClick={() => onChangeView('PHOTOS')}
                    title="Photos"
                    className={`p-3 rounded-xl transition-all duration-300 ${activeView === 'PHOTOS' ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400' : 'text-surface-400 hover:text-surface-900 dark:hover:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800'}`}
                >
                    <ImageIcon className="w-5 h-5" />
                </button>

                <button 
                    onClick={() => onChangeView('CREATE')}
                    title="New Entry"
                    className="p-3 rounded-xl text-surface-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-surface-50 dark:hover:bg-surface-800 transition-all"
                >
                    <Plus className="w-5 h-5" />
                </button>
            </nav>

            <div className="flex flex-col gap-3 mt-auto">
                <button onClick={onSignOut} className="p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-400 hover:text-red-500 transition-colors">
                    <LogOut className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

const MobileNavigation: React.FC<{ 
    activeView: ViewState['type'], 
    onChangeView: (v: ViewState['type']) => void 
}> = ({ activeView, onChangeView }) => {
    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-white/90 dark:bg-surface-900/95 backdrop-blur-md border-t border-surface-200 dark:border-surface-800 flex justify-around items-start pt-3 z-[60] pb-safe-bottom shadow-2xl">
            <button 
                onClick={() => onChangeView('LIST')}
                className={`flex flex-col items-center gap-1 w-16 ${activeView === 'LIST' ? 'text-brand-600 dark:text-brand-400' : 'text-surface-400 dark:text-surface-500'}`}
            >
                <Grid3X3 className="w-6 h-6" />
                <span className="text-[10px] font-medium">Gallery</span>
            </button>

            <button 
                onClick={() => onChangeView('PHOTOS')}
                className={`flex flex-col items-center gap-1 w-16 ${activeView === 'PHOTOS' ? 'text-brand-600 dark:text-brand-400' : 'text-surface-400 dark:text-surface-500'}`}
            >
                <ImageIcon className="w-6 h-6" />
                <span className="text-[10px] font-medium">Photos</span>
            </button>
            
            <button 
                onClick={() => onChangeView('CREATE')}
                className="flex flex-col items-center justify-center -mt-8"
            >
                <div className="w-14 h-14 rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 flex items-center justify-center border-4 border-surface-50 dark:border-surface-950">
                    <Plus className="w-7 h-7" />
                </div>
            </button>

            <button 
                onClick={() => onChangeView('CALENDAR')}
                className={`flex flex-col items-center gap-1 w-16 ${activeView === 'CALENDAR' ? 'text-brand-600 dark:text-brand-400' : 'text-surface-400 dark:text-surface-500'}`}
            >
                <Calendar className="w-6 h-6" />
                <span className="text-[10px] font-medium">Calendar</span>
            </button>
        </div>
    );
};

const CalendarView: React.FC<{
  entries: JournalEntry[];
  onSelectDate: (date: string, entryId?: string) => void;
  isLoading: boolean;
}> = ({ entries, onSelectDate, isLoading }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  // Map entries to days for easier lookup
  const entryMap = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    entries.forEach(e => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const existing = map.get(key) || [];
      map.set(key, [...existing, e]);
    });
    return map;
  }, [entries]);

  if (isLoading && entries.length === 0) return <LoadingScreen message="Loading Calendar..." />;

  const renderDays = () => {
    const days = [];
    // Padding
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`pad-${i}`} className="hidden md:block bg-transparent"></div>);
    }
    
    // Days
    for (let d = 1; d <= daysInMonth; d++) {
        const dateKey = `${year}-${currentDate.getMonth()}-${d}`;
        const dayEntries = entryMap.get(dateKey) || [];
        const entriesOnDay = dayEntries.sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        
        const jsDate = new Date(year, currentDate.getMonth(), d);
        const isToday = new Date().toDateString() === jsDate.toDateString();

        const coverEntry = entriesOnDay.find(e => e.coverImage || e.coverImageId);
        const thumbUrl = coverEntry?.coverImage ? coverEntry.coverImage.replace(/=s\d+/, '=s500') : undefined;
        
        // Handle click: View entry if exists, else Create
        const handleClick = () => {
             if (entriesOnDay.length > 0) {
                 const targetId = coverEntry ? coverEntry.id : entriesOnDay[0].id;
                 onSelectDate(jsDate.toISOString(), targetId);
             } else {
                 onSelectDate(jsDate.toISOString());
             }
        };

        days.push(
            <div 
                key={d} 
                onClick={handleClick}
                className={`
                    relative flex flex-col justify-between p-2 md:p-3 rounded-xl md:rounded-2xl transition-all duration-300
                    min-h-[110px] md:min-h-[180px] border
                    ${entriesOnDay.length > 0 
                        ? 'cursor-pointer hover:shadow-lg hover:-translate-y-1 z-10 border-surface-200 dark:border-surface-700' 
                        : 'cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-900 border-transparent hover:border-surface-200 dark:hover:border-surface-800'
                    }
                    ${!entriesOnDay.length && isToday ? 'bg-surface-50 dark:bg-surface-900 border-brand-200 dark:border-brand-900' : ''}
                    ${entriesOnDay.length > 0 && !coverEntry ? 'bg-white dark:bg-surface-800' : ''}
                    overflow-hidden
                `}
            >
                {/* Background Image */}
                {coverEntry && (
                    <div className="absolute inset-0 z-0">
                         <SecureImage 
                            fileId={coverEntry.coverImageId}
                            thumbnailUrl={thumbUrl}
                            fallbackSrc={coverEntry.coverImage}
                            alt=""
                            className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity"
                         />
                         <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />
                    </div>
                )}

                {/* Date Header */}
                <div className="relative z-10 flex justify-between items-start">
                    <span className={`
                        text-lg md:text-2xl font-serif font-semibold
                        ${coverEntry ? 'text-white' : (isToday ? 'text-brand-600 dark:text-brand-400' : 'text-surface-700 dark:text-surface-300')}
                    `}>
                        {d}
                    </span>
                    {isToday && <div className="w-2 h-2 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]" />}
                </div>

                {/* Entry Preview */}
                <div className="relative z-10 mt-auto">
                    {entriesOnDay.length > 0 && (
                        <div className="flex flex-col gap-1">
                            {/* Title/Snippet */}
                            <span className={`
                                text-[10px] md:text-xs font-medium leading-tight line-clamp-2 md:line-clamp-3
                                ${coverEntry ? 'text-white drop-shadow-sm' : 'text-surface-600 dark:text-surface-300'}
                            `}>
                                {entriesOnDay[0].title || "Untitled Memory"}
                            </span>
                            
                            {/* Moods */}
                            <div className="flex flex-wrap gap-1 mt-1">
                                {entriesOnDay.map((e, i) => {
                                    if(i > 2) return null;
                                    const m = MOODS.find(m => m.id === e.mood);
                                    if(!m) return null;
                                    return <span key={e.id} className="text-[10px] grayscale-[0.3] hover:grayscale-0 transition-all">{m.emoji}</span>;
                                })}
                                {entriesOnDay.length > 3 && <span className="text-[9px] text-surface-400">•••</span>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    return days;
  };

  return (
     <div className="flex-1 h-[100dvh] flex flex-col bg-surface-50 dark:bg-black overflow-hidden">
         {/* Clean Header */}
         <div className="flex-none px-4 md:px-8 py-4 md:py-6 flex items-end justify-between bg-surface-50/90 dark:bg-black/90 backdrop-blur-sm z-20">
             <div className="flex flex-col">
                 <h2 className="text-4xl md:text-5xl font-serif font-medium text-surface-900 dark:text-white tracking-tight">
                     {monthName}
                 </h2>
                 <button onClick={() => setCurrentDate(new Date())} className="text-left text-brand-600 dark:text-brand-400 text-sm font-bold uppercase tracking-widest mt-1 hover:underline">
                    {year} • Today
                 </button>
             </div>
             
             <div className="flex gap-1 bg-surface-100 dark:bg-surface-900 p-1 rounded-xl border border-surface-200 dark:border-surface-800">
                 <button onClick={prevMonth} className="p-3 hover:bg-white dark:hover:bg-surface-800 rounded-lg transition-all shadow-sm"><ChevronLeft className="w-5 h-5 text-surface-600 dark:text-surface-300" /></button>
                 <button onClick={nextMonth} className="p-3 hover:bg-white dark:hover:bg-surface-800 rounded-lg transition-all shadow-sm"><ChevronRight className="w-5 h-5 text-surface-600 dark:text-surface-300" /></button>
             </div>
         </div>
         
         {/* Weekday Headers */}
         <div className="flex-none grid grid-cols-7 gap-1 md:gap-3 px-2 md:px-8 mb-2">
             {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                 <div key={day} className="text-center text-[10px] md:text-xs font-bold uppercase tracking-widest text-surface-400 py-2">
                     {day}
                 </div>
             ))}
         </div>
         
         {/* Scrollable Calendar Grid */}
         <div className="flex-1 overflow-y-auto px-2 md:px-8 pb-32">
             <div className="grid grid-cols-7 gap-1 md:gap-3 auto-rows-fr">
                 {renderDays()}
             </div>
         </div>
     </div>
  );
};

const PhotoGalleryView: React.FC = () => {
    const [media, setMedia] = useState<JournalAttachment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedMedia, setSelectedMedia] = useState<JournalAttachment | null>(null);
    const [filterDate, setFilterDate] = useState('');
    const [filterType, setFilterType] = useState<'month' | 'day'>('month');

    useEffect(() => {
        const fetchMedia = async () => {
            setIsLoading(true);
            try {
                // Now fetching images AND videos
                const fetchedMedia: any[] = await DriveService.getAllMedia();
                
                // Process media
                const processedMedia = fetchedMedia
                    .filter(f => f.mimeType.startsWith('image/') || f.mimeType.startsWith('video/'))
                    .map(f => ({
                        ...f,
                        journalDate: f.appProperties?.journalDate || f.createdTime
                    }));

                // Sort by the derived date desc
                processedMedia.sort((a, b) => {
                    const dateA = new Date(a.journalDate).getTime();
                    const dateB = new Date(b.journalDate).getTime();
                    return dateB - dateA;
                });
                setMedia(processedMedia);
            } catch (e) {
                console.error("Failed to load media", e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchMedia();
    }, []);

    const filteredMedia = useMemo(() => {
        if (!filterDate) return media;
        return media.filter(item => {
            const dateStr = item.journalDate;
            if (!dateStr) return false;
            
            // Standardize checks
            if (filterType === 'month') {
                return dateStr.startsWith(filterDate);
            } else {
                return dateStr.startsWith(filterDate);
            }
        });
    }, [media, filterDate, filterType]);

    const getFilterLabel = () => {
        if (!filterDate) return '';
        const parts = filterDate.split('-').map(Number);
        const y = parts[0];
        const m = parts[1];
        const d = parts.length > 2 ? parts[2] : 1;
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString('default', { 
            month: 'long', 
            year: 'numeric',
            day: filterType === 'day' ? 'numeric' : undefined 
        });
    };

    if (isLoading) return <LoadingScreen message="Curating Gallery..." />;

    return (
        <div className="flex-1 h-[100dvh] overflow-y-auto bg-surface-50 dark:bg-surface-950 relative">
            <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-4 md:py-8">
                <header className="mb-6 md:mb-8 sticky top-0 z-40 bg-surface-50/95 dark:bg-surface-950/95 backdrop-blur-sm pt-2 pb-4 border-b border-transparent">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div>
                            <h2 className="text-2xl md:text-3xl font-bold text-surface-900 dark:text-white tracking-tight flex items-center gap-3">
                                <ImageIcon className="w-6 h-6 md:w-8 md:h-8 text-brand-500" />
                                Gallery
                            </h2>
                            <p className="text-surface-500 text-sm mt-1">
                                {filterDate 
                                    ? `Showing media from ${getFilterLabel()}`
                                    : 'All moments captured in your journal.'}
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-2 bg-white dark:bg-surface-900 p-1.5 rounded-xl border border-surface-200 dark:border-surface-800 shadow-sm">
                            <select 
                                value={filterType}
                                onChange={(e) => {
                                    setFilterType(e.target.value as 'month' | 'day');
                                    setFilterDate('');
                                }}
                                className="bg-transparent text-sm font-bold text-surface-600 dark:text-surface-300 focus:outline-none cursor-pointer pl-2 pr-1 py-1 hover:text-brand-600 transition-colors"
                            >
                                <option value="month">Month</option>
                                <option value="day">Day</option>
                            </select>

                            <div className="w-px h-4 bg-surface-200 dark:bg-surface-700" />

                            <div className="relative flex items-center">
                                <Calendar className="absolute left-3 w-4 h-4 text-surface-400 pointer-events-none" />
                                <input 
                                    type={filterType === 'month' ? 'month' : 'date'}
                                    value={filterDate}
                                    onChange={(e) => setFilterDate(e.target.value)}
                                    className="pl-9 pr-3 py-1.5 bg-transparent border-none text-sm font-medium text-surface-700 dark:text-surface-200 focus:ring-0 outline-none w-auto cursor-pointer"
                                />
                            </div>
                            {filterDate && (
                                <button 
                                    onClick={() => setFilterDate('')}
                                    className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-red-500 transition-colors"
                                    title="Clear filter"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {filteredMedia.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-50">
                        <ImageIcon className="w-12 h-12 text-surface-300 mb-4" />
                        <p className="font-medium text-sm text-surface-500">
                            {filterDate ? `No media found for this ${filterType}.` : 'No photos or videos yet.'}
                        </p>
                        {filterDate && (
                            <button onClick={() => setFilterDate('')} className="mt-4 text-brand-600 dark:text-brand-400 text-sm font-medium hover:underline">
                                Show all media
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4 pb-20">
                        {filteredMedia.map((item) => {
                            const dateObj = item.journalDate ? new Date(item.journalDate) : null;
                            const dateLabel = dateObj && !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : '';
                            const isVideo = item.mimeType.startsWith('video/');

                            return (
                                <div 
                                    key={item.id} 
                                    onClick={() => setSelectedMedia(item)}
                                    className="break-inside-avoid relative group rounded-xl overflow-hidden cursor-zoom-in border border-surface-200 dark:border-surface-800 bg-surface-100 dark:bg-surface-900"
                                >
                                    <SecureImage 
                                        fileId={item.id}
                                        thumbnailUrl={item.thumbnailLink ? item.thumbnailLink.replace(/=s\d+/, '=s500') : undefined}
                                        alt={item.name}
                                        className="w-full h-auto transition-transform duration-500 group-hover:scale-105"
                                    />
                                    
                                    {isVideo && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                                            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                                                <Play className="w-5 h-5 text-white fill-current ml-0.5" />
                                            </div>
                                        </div>
                                    )}

                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        {isVideo ? <Play className="w-8 h-8 text-white drop-shadow-md" /> : <Maximize2 className="w-6 h-6 text-white drop-shadow-md" />}
                                    </div>
                                    {dateLabel && (
                                        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                            <p className="text-[10px] text-white font-medium uppercase tracking-wider">
                                                {dateLabel}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Lightbox Modal */}
            {selectedMedia && (
                <div 
                    className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center animate-fade-in p-4"
                    onClick={() => setSelectedMedia(null)}
                >
                    <button 
                        onClick={() => setSelectedMedia(null)}
                        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-20"
                    >
                        <X className="w-6 h-6" />
                    </button>
                    
                    <div className="relative w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                         {selectedMedia.mimeType.startsWith('video/') ? (
                             <SecureVideoPlayer 
                                fileId={selectedMedia.id} 
                                autoPlay 
                                className="max-w-full max-h-[90vh] w-auto h-auto rounded-lg shadow-2xl" 
                             />
                         ) : (
                             <SecureImage 
                                fileId={selectedMedia.id}
                                thumbnailUrl={selectedMedia.thumbnailLink ? selectedMedia.thumbnailLink.replace(/=s\d+/, '=s1600') : undefined}
                                alt={selectedMedia.name}
                                className="!bg-transparent !overflow-visible flex items-center justify-center"
                                imgClassName="max-w-[95vw] max-h-[90vh] w-auto h-auto object-contain shadow-2xl rounded-sm"
                            />
                         )}
                         
                         <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur px-4 py-2 rounded-full text-white/90 text-sm font-medium pointer-events-none">
                             {selectedMedia.journalDate ? new Date(selectedMedia.journalDate).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Unknown Date'}
                         </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const EntryListView: React.FC<{
  entries: JournalEntry[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  isSearching: boolean;
  isLoadingInitial: boolean;
}> = ({ entries, onSelect, onCreate, searchTerm, onSearchChange, isSearching, isLoadingInitial }) => {
  
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
       const matchesMood = selectedMood ? e.mood === selectedMood : true;
       return matchesMood;
    });
  }, [entries, selectedMood]);

  if (isLoadingInitial) return <LoadingScreen message="Loading Gallery..." />;

  return (
    <div className="flex-1 h-[100dvh] overflow-y-auto bg-surface-50 dark:bg-surface-950 relative pb-24 md:pb-0">
       <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-4 md:py-8">
           <header className="mb-6 md:mb-8 sticky md:static top-0 z-40 bg-surface-50/95 dark:bg-surface-950/95 backdrop-blur-sm pt-2 pb-4">
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                   <div className="flex items-center justify-between">
                        <h2 className="text-2xl md:text-3xl font-bold text-surface-900 dark:text-white tracking-tight">
                            {isSearching ? 'Search Results' : 'Memories'}
                        </h2>
                   </div>
                   
                   <div className="w-full md:w-64 relative">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                       <input 
                         type="text" 
                         placeholder="Search..."
                         value={searchTerm}
                         onChange={(e) => onSearchChange(e.target.value)}
                         className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all shadow-sm"
                       />
                   </div>
               </div>

               {!isSearching && (
                   <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mask-gradient-r">
                       <button onClick={() => setSelectedMood(null)} className={`flex-none px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${selectedMood === null ? 'bg-surface-900 text-white border-transparent' : 'bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-800 text-surface-600'}`}>All</button>
                       {MOODS.map(m => (
                           <button 
                               key={m.id}
                               onClick={() => setSelectedMood(selectedMood === m.id ? null : m.id)}
                               className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium transition-all border flex items-center gap-1.5 ${selectedMood === m.id ? 'bg-brand-500 text-white border-transparent' : 'bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-800 text-surface-600'}`}
                           >
                               <span>{m.emoji}</span> {m.label}
                           </button>
                       ))}
                   </div>
               )}
           </header>

           {filteredEntries.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-20 opacity-50">
                   <LayoutGrid className="w-12 h-12 text-surface-300 mb-4" />
                   <p className="font-medium text-sm text-surface-500">No entries found.</p>
               </div>
           ) : (
               <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4">
                   {filteredEntries.map((entry) => {
                       const hasCover = entry.coverImageId || entry.coverImage;
                       const moodObj = MOODS.find(m => m.id === entry.mood);
                       const thumbUrl = entry.coverImage ? entry.coverImage.replace(/=s\d+/, '=s500') : undefined;

                       return (
                           <div 
                              key={entry.id} 
                              onClick={() => onSelect(entry.id)}
                              className="group flex flex-col bg-white dark:bg-surface-900 rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-surface-200 dark:border-surface-800"
                           >
                               <div className="aspect-[4/5] relative overflow-hidden bg-surface-100 dark:bg-surface-800">
                                   {hasCover ? (
                                        <SecureImage 
                                           fileId={entry.coverImageId}
                                           thumbnailUrl={thumbUrl}
                                           fallbackSrc={entry.coverImage}
                                           alt="Cover"
                                           className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                                       />
                                   ) : (
                                       <div className="w-full h-full flex flex-col items-center justify-center text-surface-300 dark:text-surface-700 p-4">
                                           <Type className="w-8 h-8 mb-2 opacity-50" />
                                            {entry.content && (
                                                <p className="text-[10px] line-clamp-4 text-center leading-relaxed opacity-60">
                                                    {entry.content.substring(0, 100)}
                                                </p>
                                            )}
                                       </div>
                                   )}
                                   {moodObj && <div className="absolute top-2 right-2 text-lg drop-shadow-md transform group-hover:scale-110 transition-transform">{moodObj.emoji}</div>}
                                   <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                               </div>
                               
                               <div className="p-3 flex flex-col gap-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                                        {new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                    </span>
                                    <h3 className="font-bold text-sm text-surface-900 dark:text-surface-100 truncate leading-tight">
                                        {entry.title || "Untitled"}
                                    </h3>
                               </div>
                           </div>
                       );
                   })}
               </div>
           )}
       </div>
    </div>
  );
};

const EntryEditorView: React.FC<{
  initialData?: Partial<JournalEntry>;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  onDeleteAttachment?: (id: string) => Promise<void>;
}> = ({ initialData, onSave, onCancel, onDeleteAttachment }) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [content, setContent] = useState(initialData?.content || '');
  const [date, setDate] = useState(initialData?.date || new Date().toISOString());
  const [mood, setMood] = useState(initialData?.mood || '');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(initialData?.checklist || []);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  const [coverImageId, setCoverImageId] = useState<string | undefined>(initialData?.coverImageId);
  const [coverImage, setCoverImage] = useState<string | undefined>(initialData?.coverImage);
  const [selectedPendingIndex, setSelectedPendingIndex] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialData && initialData.coverImageId !== coverImageId && !initialData.coverImageId) {
        setCoverImageId(undefined);
        setCoverImage(undefined);
    }
  }, [initialData, coverImageId]);

  const handleSave = async () => {
      setIsSaving(true);
      try { 
          await onSave({ 
            title, 
            content, 
            date, 
            mood, 
            files: pendingFiles, 
            checklist, 
            coverImageId: selectedPendingIndex !== null ? undefined : coverImageId, 
            coverImage: selectedPendingIndex !== null ? undefined : coverImage,
            coverIndex: selectedPendingIndex
          }); 
      } 
      finally { setIsSaving(false); }
  };

  const addChecklistItem = (e: React.FormEvent) => {
      e.preventDefault();
      if(newChecklistItem.trim()){
          setChecklist([...checklist, {text: newChecklistItem, checked: false}]);
          setNewChecklistItem('');
      }
  };

  const handleAutoFormat = () => {
      let text = content;
      text = text.replace(/\n{3,}/g, '\n\n');
      if (text.length > 0) text = text.charAt(0).toUpperCase() + text.slice(1);
      text = text.replace(/([.!?]\s+)([a-z])/g, (match, sep, char) => sep + char.toUpperCase());
      text = text.replace(/\s+([.,!?;:])/g, '$1');
      text = text.replace(/([.,!?;:])([a-zA-Z])/g, '$1 $2');
      text = text.replace(/^\* /gm, '- ');
      setContent(text);
  };

  return (
      <div className="fixed inset-0 z-[60] bg-surface-50 dark:bg-black flex flex-col animate-slide-up select-none">
          {/* Editor Header */}
          <div className="flex items-center justify-between px-4 md:px-8 py-4 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-surface-200 dark:border-surface-800 sticky top-0 z-20">
              <div className="flex items-center gap-2">
                 <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-surface-500 hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-100 dark:hover:bg-surface-900 transition-colors font-medium text-sm">
                      Cancel
                 </button>
              </div>

              <div className="flex items-center gap-2">
                  <button 
                      onClick={handleAutoFormat}
                      title="Auto Format Text"
                      className="p-2 rounded-lg text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                  >
                      <Wand2 className="w-5 h-5" />
                  </button>

                  <div className="w-px h-5 bg-surface-300 dark:bg-surface-700 mx-1" />

                  <Button onClick={handleSave} disabled={isSaving || (!title && !content)} className="px-5 py-2 text-sm font-semibold rounded-full">
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                  </Button>
              </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-surface-50 dark:bg-black">
              <div className="max-w-2xl mx-auto px-6 py-10">
                  
                  {/* Meta Bar */}
                  <div className="flex flex-col gap-6 mb-8">
                       <div className="flex items-center gap-2 relative group w-fit">
                            <CalendarIcon className="w-4 h-4 text-surface-400" />
                            <input 
                                type="date" 
                                value={new Date(date).toLocaleDateString('en-CA')} 
                                onChange={e => {
                                    if (!e.target.value) return;
                                    const [y, m, d] = e.target.value.split('-').map(Number);
                                    const localDate = new Date(y, m - 1, d);
                                    setDate(localDate.toISOString());
                                }} 
                                className="bg-transparent text-sm font-bold uppercase tracking-widest text-surface-500 hover:text-brand-600 dark:text-surface-400 dark:hover:text-brand-400 border-none focus:ring-0 p-0 cursor-pointer select-none"
                            />
                       </div>

                       <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mask-gradient-r">
                           {MOODS.map(m => (
                               <button 
                                   key={m.id} 
                                   onClick={() => setMood(m.id === mood ? '' : m.id)}
                                   className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium transition-all border flex items-center gap-1.5 select-none
                                       ${mood === m.id 
                                           ? 'bg-surface-900 dark:bg-surface-100 text-white dark:text-black border-transparent shadow-md transform scale-105' 
                                           : 'bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-800 text-surface-500 hover:border-surface-300 dark:hover:border-surface-600'
                                       }`}
                               >
                                   <span className="text-base">{m.emoji}</span> {m.label}
                               </button>
                           ))}
                       </div>
                  </div>

                  {/* Title */}
                  <textarea 
                      placeholder="Untitled"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      rows={1}
                      className="w-full text-4xl md:text-5xl font-serif font-bold bg-transparent border-none outline-none focus:ring-0 placeholder:text-surface-300 dark:placeholder:text-surface-700 text-surface-900 dark:text-white mb-6 leading-tight resize-none overflow-hidden select-text"
                      style={{ minHeight: '1.2em' }}
                      onInput={(e: any) => {
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                      }}
                  />

                  {/* Content */}
                  <TextArea 
                      placeholder="Start writing..."
                      value={content}
                      onChange={e => setContent(e.target.value)}
                      className="min-h-[40vh] text-lg leading-loose font-serif text-surface-800 dark:text-surface-200 !px-0 select-text"
                  />

                  {/* Checklist Section */}
                  <div className="mt-12 space-y-3">
                       <h4 className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-2 flex items-center gap-2">
                           <CheckSquare className="w-4 h-4" /> Checklist
                       </h4>
                       <div className="space-y-1">
                           {checklist.map((item, i) => (
                               <div key={i} className="flex items-center gap-3 group py-1">
                                   <button onClick={() => {const n = [...checklist]; n[i].checked = !n[i].checked; setChecklist(n)}} className={`transition-colors ${item.checked ? "text-brand-500" : "text-surface-300 hover:text-brand-500"}`}>
                                       {item.checked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                   </button>
                                   <input 
                                       value={item.text} 
                                       onChange={e => {const n = [...checklist]; n[i].text = e.target.value; setChecklist(n)}} 
                                       className={`flex-1 bg-transparent border-none focus:ring-0 p-0 text-base font-serif select-text ${item.checked ? 'line-through text-surface-400' : 'text-surface-800 dark:text-surface-200'}`} 
                                   />
                                   <button onClick={() => setChecklist(checklist.filter((_, idx) => idx !== i))} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                                       <Trash2 className="w-4 h-4 text-surface-400 hover:text-red-500" />
                                   </button>
                               </div>
                           ))}
                           <form onSubmit={addChecklistItem} className="flex items-center gap-3 opacity-60 focus-within:opacity-100 py-1 transition-opacity">
                               <Plus className="w-5 h-5 text-surface-400" />
                               <input 
                                   value={newChecklistItem} 
                                   onChange={e => setNewChecklistItem(e.target.value)} 
                                   placeholder="Add item..." 
                                   className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-base font-serif placeholder:text-surface-300 select-text" 
                               />
                           </form>
                       </div>
                  </div>

                  {/* Attachments Section */}
                  <div className="mt-12 pt-8 border-t border-surface-200 dark:border-surface-800">
                      <div className="flex items-center justify-between mb-6">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-surface-400 flex items-center gap-2">
                              <ImageIcon className="w-4 h-4" /> Gallery
                          </h4>
                          <Button onClick={() => fileInputRef.current?.click()} variant="ghost" className="!p-2 text-xs">
                              <Plus className="w-4 h-4 mr-1" /> Add Media
                          </Button>
                      </div>
                      
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                          {/* Existing Files */}
                          {initialData?.attachments?.map(att => (
                              <div 
                                key={att.id} 
                                onClick={() => { 
                                    setCoverImageId(att.id); 
                                    setCoverImage(att.thumbnailLink); 
                                    setSelectedPendingIndex(null); 
                                }}
                                className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all shadow-sm ${coverImageId === att.id ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-surface-200 dark:border-surface-800 hover:border-surface-300'}`}
                              >
                                  <SecureImage fileId={att.id} thumbnailUrl={att.thumbnailLink} alt="" className="w-full h-full object-cover" />
                                  
                                  {att.mimeType.startsWith('video/') && (
                                     <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                         <Play className="w-6 h-6 text-white drop-shadow-md fill-current" />
                                     </div>
                                  )}

                                  {coverImageId === att.id && (
                                      <div className="absolute top-2 right-2 bg-brand-500 text-white p-1 rounded-full shadow-sm z-10">
                                          <Star className="w-3 h-3 fill-current" />
                                      </div>
                                  )}
                                  
                                  <button 
                                      onClick={(e) => {e.stopPropagation(); onDeleteAttachment && onDeleteAttachment(att.id)}} 
                                      className="absolute bottom-2 right-2 bg-white/90 dark:bg-black/80 text-red-500 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shadow-sm z-10"
                                  >
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                              </div>
                          ))}

                          {/* Pending Files */}
                          {pendingFiles.map((f, i) => (
                              <div 
                                key={`pending-${i}`} 
                                onClick={() => { setSelectedPendingIndex(i); setCoverImageId(undefined); setCoverImage(undefined); }}
                                className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all shadow-sm ${selectedPendingIndex === i ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-surface-200 dark:border-surface-800 hover:border-surface-300'}`}
                              >
                                  {f.type.startsWith('video/') ? (
                                      <div className="w-full h-full bg-black flex items-center justify-center relative">
                                          <video src={URL.createObjectURL(f)} className="w-full h-full object-cover opacity-70" />
                                          <div className="absolute inset-0 flex items-center justify-center">
                                              <Play className="w-6 h-6 text-white/80" />
                                          </div>
                                          <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/50 rounded text-[10px] text-white font-bold tracking-wider">VIDEO</div>
                                      </div>
                                  ) : (
                                      <img src={URL.createObjectURL(f)} className="w-full h-full object-cover opacity-80" />
                                  )}
                                  
                                  {selectedPendingIndex === i && (
                                      <div className="absolute top-2 right-2 bg-brand-500 text-white p-1 rounded-full shadow-sm z-10">
                                          <Star className="w-3 h-3 fill-current" />
                                      </div>
                                  )}
                                  <button onClick={(e) => {e.stopPropagation(); setPendingFiles(p => p.filter((_, idx) => idx !== i))}} className="absolute bottom-2 right-2 bg-black/50 text-white p-1.5 rounded-lg hover:bg-red-500 transition-colors z-10"><X className="w-4 h-4" /></button>
                              </div>
                          ))}
                          
                          {/* Empty State / Add Button Tile */}
                          {(pendingFiles.length === 0 && (!initialData?.attachments || initialData.attachments.length === 0)) && (
                              <button 
                                  onClick={() => fileInputRef.current?.click()}
                                  className="aspect-square rounded-xl border-2 border-dashed border-surface-200 dark:border-surface-800 flex flex-col items-center justify-center text-surface-400 hover:text-brand-500 hover:border-brand-300 hover:bg-surface-50 dark:hover:bg-surface-900 transition-all"
                              >
                                  <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                                  <span className="text-[10px] font-bold uppercase tracking-widest">Add</span>
                              </button>
                          )}
                      </div>
                  </div>

                  <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,video/*" onChange={e => e.target.files && setPendingFiles(p => [...p, ...Array.from(e.target.files!)])} />
                  
                  {/* Bottom Spacer */}
                  <div className="h-24" />
              </div>
          </div>
      </div>
  );
};

const EntryReaderView: React.FC<{
    entry: JournalEntry;
    onBack: () => void;
    onEdit: () => void;
    onDelete: () => void;
    isLoading: boolean;
    fontStyle: string;
    setFontStyle: (style: string) => void;
  }> = ({ entry, onBack, onEdit, onDelete, isLoading, fontStyle, setFontStyle }) => {
    
    const [showFontMenu, setShowFontMenu] = useState(false);
    const [lightboxMedia, setLightboxMedia] = useState<JournalAttachment | null>(null);

    if (isLoading || !entry) return <LoadingScreen message="Loading..." />;
    const moodObj = MOODS.find(m => m.id === entry.mood);
  
    // High res for header
    const coverUrl = entry.coverImage ? entry.coverImage.replace(/=s\d+/, '=s1200') : undefined;

    // Define font configurations with display labels and actual CSS classes
    const fontConfig: Record<string, { label: string, class: string, description: string }> = {
        'serif': { label: 'Classic', class: 'font-serif', description: 'Lora' },
        'sans': { label: 'Modern', class: 'font-sans', description: 'Inter' },
        'mono': { label: 'Typewriter', class: 'font-mono text-sm tracking-wide', description: 'Courier Prime' },
        'hand': { label: 'Handwritten', class: 'font-hand text-lg leading-relaxed', description: 'Patrick Hand' },
        'elegant': { label: 'Elegant', class: 'font-elegant', description: 'Playfair Display' },
    };

    const currentFontConfig = fontConfig[fontStyle] || fontConfig['serif'];

    return (
      <div className="fixed inset-0 z-50 bg-surface-50 dark:bg-black flex flex-col animate-scale-in origin-bottom h-[100dvh]">
        <div className="flex items-center justify-between px-4 py-3 bg-white/90 dark:bg-black/90 backdrop-blur-md sticky top-0 z-30 border-b border-surface-200 dark:border-surface-800">
             <button onClick={onBack} className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors text-surface-600 dark:text-surface-400">
                 <ChevronLeft className="w-5 h-5" />
                 <span className="font-medium text-sm">Back</span>
             </button>
             <div className="flex items-center gap-1">
                 {/* Font Toggle */}
                 <div className="relative">
                    <button 
                        onClick={() => setShowFontMenu(!showFontMenu)}
                        className={`p-2 transition-colors rounded-lg ${showFontMenu ? 'bg-surface-100 dark:bg-surface-800 text-brand-600 dark:text-brand-400' : 'text-surface-500 hover:text-surface-900 dark:hover:text-surface-100'}`}
                    >
                        <Type className="w-5 h-5" />
                    </button>
                    {showFontMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowFontMenu(false)} />
                            <div className="absolute top-full right-0 mt-2 z-50 bg-white dark:bg-surface-900 rounded-xl shadow-xl border border-surface-200 dark:border-surface-700 min-w-[180px] overflow-hidden flex flex-col p-1 animate-scale-in origin-top-right">
                                <span className="px-3 py-2 text-[10px] uppercase font-bold text-surface-400 tracking-wider">Text Style</span>
                                {Object.entries(fontConfig).map(([key, config]) => (
                                    <button 
                                        key={key}
                                        onClick={() => { setFontStyle(key); setShowFontMenu(false); }} 
                                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left transition-colors
                                            ${fontStyle === key 
                                                ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 font-medium' 
                                                : 'text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800'
                                            }`}
                                    >
                                        <div className="flex flex-col">
                                            <span className={config.class.split(' ')[0]}>{config.label}</span>
                                            <span className="text-[10px] text-surface-400 font-sans opacity-70">{config.description}</span>
                                        </div>
                                        {fontStyle === key && <Check className="w-3 h-3" />}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                 </div>

                 <div className="w-px h-6 bg-surface-200 dark:bg-surface-800 mx-1" />
                 
                 <button onClick={onEdit} className="p-2 text-surface-500 hover:text-brand-600 transition-colors"><Edit3 className="w-5 h-5" /></button>
                 <button onClick={onDelete} className="p-2 text-surface-500 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
             </div>
        </div>
  
        <div className="flex-1 overflow-y-auto pb-safe-bottom bg-white dark:bg-surface-900">
            <article className="max-w-3xl mx-auto">
                {(entry.coverImageId || entry.coverImage) ? (
                    <div className="w-full aspect-video md:aspect-[21/9] relative overflow-hidden bg-surface-100 dark:bg-surface-800">
                         <SecureImage fileId={entry.coverImageId} thumbnailUrl={coverUrl} fallbackSrc={entry.coverImage} alt="Cover" className="w-full h-full object-cover" />
                    </div>
                ) : null}
                
                <div className="px-6 md:px-12 py-8 md:py-12">
                    <div className="flex items-center gap-3 mb-6">
                         <span className="text-surface-400 text-xs font-bold uppercase tracking-widest">
                             {new Date(entry.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                         </span>
                         {moodObj && <span className="text-xl" title={moodObj.label}>{moodObj.emoji}</span>}
                    </div>
                    
                    <h1 className="text-3xl md:text-5xl font-bold text-surface-900 dark:text-white leading-tight mb-8 font-display">
                        {entry.title || "Untitled"}
                    </h1>

                    <div className={`prose dark:prose-invert prose-lg max-w-none text-surface-600 dark:text-surface-300 leading-loose ${currentFontConfig.class} [&_p]:font-inherit`}>
                        {entry.content.split('\n').map((p, i) => <p key={i}>{p}</p>)}
                    </div>

                    {entry.checklist && entry.checklist.length > 0 && (
                        <div className="mt-12 bg-surface-50 dark:bg-surface-900 rounded-xl p-6 border border-surface-200 dark:border-surface-800">
                            <h4 className="font-bold text-xs uppercase tracking-widest text-surface-400 mb-4">Checklist</h4>
                            <div className="space-y-3">
                                {entry.checklist.map((item, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className={`w-4 h-4 rounded flex items-center justify-center border ${item.checked ? 'bg-brand-500 border-brand-500' : 'border-surface-300'}`}>
                                            {item.checked && <CheckSquare className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className={`text-base font-serif ${item.checked ? 'line-through text-surface-400' : 'text-surface-800 dark:text-surface-200'}`}>{item.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {entry.attachments && entry.attachments.length > 0 && (
                        <div className="mt-12 pt-8 border-t border-surface-200 dark:border-surface-800">
                            <h4 className="font-bold text-xs uppercase tracking-widest text-surface-400 mb-6">Gallery</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {entry.attachments.map((att) => (
                                    <div 
                                        key={att.id} 
                                        onClick={() => setLightboxMedia(att)}
                                        className="relative rounded-lg overflow-hidden aspect-square border border-surface-200 dark:border-surface-800 cursor-zoom-in"
                                    >
                                        <SecureImage 
                                            fileId={att.id} 
                                            thumbnailUrl={att.thumbnailLink ? att.thumbnailLink.replace(/=s\d+/, '=s500') : undefined} 
                                            alt="" 
                                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" 
                                        />
                                        {att.mimeType.startsWith('video/') && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors pointer-events-none">
                                                <Play className="w-8 h-8 text-white drop-shadow-md fill-current" />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </article>

             {/* Reader Lightbox */}
             {lightboxMedia && (
                <div 
                    className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center animate-fade-in p-4"
                    onClick={() => setLightboxMedia(null)}
                >
                    <button 
                        onClick={() => setLightboxMedia(null)}
                        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-20"
                    >
                        <X className="w-6 h-6" />
                    </button>
                    
                    <div className="relative w-full max-w-5xl max-h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                         {lightboxMedia.mimeType.startsWith('video/') ? (
                             <SecureVideoPlayer 
                                fileId={lightboxMedia.id} 
                                autoPlay 
                                className="max-w-full max-h-[90vh] w-auto h-auto rounded-lg shadow-2xl" 
                             />
                         ) : (
                             <SecureImage 
                                fileId={lightboxMedia.id}
                                thumbnailUrl={lightboxMedia.thumbnailLink ? lightboxMedia.thumbnailLink.replace(/=s\d+/, '=s1600') : undefined}
                                alt={lightboxMedia.name}
                                className="!bg-transparent !overflow-visible flex items-center justify-center"
                                imgClassName="max-w-[95vw] max-h-[90vh] w-auto h-auto object-contain shadow-2xl rounded-sm"
                            />
                         )}
                    </div>
                </div>
            )}
        </div>
      </div>
    );
};

const App: React.FC = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [view, setView] = useState<ViewState>({ type: 'LOGIN' }); 
  const [isLoading, setIsLoading] = useState(false);
  const [activeEntryData, setActiveEntryData] = useState<JournalEntry | undefined>(undefined);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<JournalEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Font Preference State
  const [fontPreference, setFontPreference] = useState(() => {
      return localStorage.getItem('mindflow_font_pref') || 'serif';
  });

  const updateFontPreference = (newFont: string) => {
      setFontPreference(newFont);
      localStorage.setItem('mindflow_font_pref', newFont);
  };
  
  const debouncedSearchTerm = useDebounce(searchTerm, 600);

  useEffect(() => {
    // Force dark mode
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
      const cfg: GoogleConfig = { clientId: GOOGLE_CLIENT_ID, apiKey: GOOGLE_API_KEY };
      initializeDrive(cfg);
  }, []);

  useEffect(() => {
      if (!DriveService.isInitialized) return;
      const performSearch = async () => {
          if (!debouncedSearchTerm.trim()) {
              setIsSearching(false);
              return;
          }
          setIsSearching(true);
          try {
              const results = await DriveService.searchEntries(debouncedSearchTerm);
              setSearchResults(results);
          } catch (e) {
              console.error("Search failed", e);
          }
      };
      performSearch();
  }, [debouncedSearchTerm]);

  const initializeDrive = async (cfg: GoogleConfig) => {
    setIsLoading(true);
    try {
        await DriveService.init(cfg);
        if (DriveService.restoreSession()) await refreshEntries();
        else setView({ type: 'LOGIN' });
    } catch (e) {
        console.error(e);
        setView({ type: 'LOGIN' });
    } finally {
        setIsLoading(false);
    }
  };

  const refreshEntries = async () => {
    const cached = DriveService.getCachedEntries();
    if (cached.length > 0) {
        setEntries(cached);
        if (view.type === 'LOGIN') setView({ type: 'LIST' });
    }
    if (cached.length === 0) setIsLoading(true);
    try {
        const list = await DriveService.listEntries();
        setEntries(list);
        if (view.type === 'LOGIN') setView({ type: 'LIST' });
    } catch(e) { console.error(e); } 
    finally { setIsLoading(false); }
  };

  const handleReadEntry = async (id: string) => {
      setIsLoading(true);
      setView({ type: 'READ', id });
      
      const sourceList = (isSearching && searchTerm) ? searchResults : entries;
      const meta = sourceList.find(e => e.id === id);
      
      if(meta) {
          try {
              const content = await DriveService.getEntryContent(id);
              if(content.attachments.length > 0 && !meta.coverImageId && !meta.coverImage) {
                  const first = content.attachments[0];
                  DriveService.updateCoverImage(id, first.id, first.thumbnailLink);
                  const updated = { ...meta, ...content, coverImageId: first.id, coverImage: first.thumbnailLink };
                  setActiveEntryData(updated);
                  setEntries(prev => prev.map(e => e.id === id ? updated : e));
              } else {
                  setActiveEntryData({ ...meta, ...content });
              }
          } catch(e) { console.error(e); }
      }
      setIsLoading(false);
  };

  const handleSaveEntry = async (data: any, isUpdate = false) => {
      const base = isUpdate && activeEntryData ? activeEntryData : { id: '', updatedAt: '' };
      const entry: JournalEntry = { ...base, ...data, updatedAt: new Date().toISOString() };
      try {
          const res = await DriveService.saveEntry(entry, data.files, data.coverIndex);
          const finalEntry = { ...entry, id: res.id, coverImageId: res.coverImageId, coverImage: res.coverImage };
          
          if(isUpdate) {
               const updateFn = (p: JournalEntry[]) => p.map(e => e.id === entry.id ? finalEntry : e);
               setEntries(updateFn);
               setSearchResults(updateFn);
               setActiveEntryData(finalEntry);
               setView({ type: 'READ', id: entry.id });
          } else {
               setEntries(p => [finalEntry, ...p]);
               setView({ type: 'LIST' });
               setTimeout(refreshEntries, 1000);
          }
      } catch(e) { alert("Save failed"); console.error(e); }
  };

  const handleDelete = async (id: string) => {
      if(!confirm("Delete this memory forever?")) return;
      await DriveService.deleteEntry(id);
      const filterFn = (p: JournalEntry[]) => p.filter(e => e.id !== id);
      setEntries(filterFn);
      setSearchResults(filterFn);
      setView({ type: 'LIST' });
  };

  const handleSignOut = () => {
      DriveService.signOut();
      setView({ type: 'LOGIN' });
  };

  const renderView = () => {
      switch(view.type) {
          case 'LOGIN': return <LoginView onLogin={() => DriveService.signIn().then(refreshEntries)} />;
          case 'LIST': 
            return (
                <div className="flex h-[100dvh] overflow-hidden bg-surface-50 dark:bg-black">
                    <Sidebar 
                      activeView="LIST" 
                      onChangeView={(t) => { if (t !== 'EDIT' && t !== 'READ') setView({type: t} as ViewState); }} 
                      onSignOut={handleSignOut} 
                    />
                    <EntryListView 
                        entries={(isSearching && searchTerm) ? searchResults : entries} 
                        onSelect={handleReadEntry} 
                        onCreate={() => setView({type: 'CREATE'})} 
                        searchTerm={searchTerm} 
                        onSearchChange={setSearchTerm} 
                        isSearching={!!(searchTerm && isSearching)}
                        isLoadingInitial={isLoading && entries.length === 0} 
                    />
                    <MobileNavigation 
                        activeView="LIST" 
                        onChangeView={(t) => { if (t !== 'EDIT' && t !== 'READ') setView({type: t} as ViewState); }} 
                    />
                </div>
            );
          case 'PHOTOS':
             return (
                 <div className="flex h-[100dvh] overflow-hidden bg-surface-50 dark:bg-black">
                     <Sidebar 
                       activeView="PHOTOS" 
                       onChangeView={(t) => { if (t !== 'EDIT' && t !== 'READ') setView({type: t} as ViewState); }} 
                       onSignOut={handleSignOut} 
                     />
                     <PhotoGalleryView />
                     <MobileNavigation 
                        activeView="PHOTOS" 
                        onChangeView={(t) => { if (t !== 'EDIT' && t !== 'READ') setView({type: t} as ViewState); }} 
                    />
                 </div>
             );
          case 'CALENDAR':
             return (
                 <div className="flex h-[100dvh] overflow-hidden bg-surface-50 dark:bg-black">
                     <Sidebar 
                       activeView="CALENDAR" 
                       onChangeView={(t) => { if (t !== 'EDIT' && t !== 'READ') setView({type: t} as ViewState); }} 
                       onSignOut={handleSignOut} 
                     />
                     <CalendarView 
                         entries={entries} 
                         onSelectDate={(date, entryId) => {
                             if (entryId) handleReadEntry(entryId);
                             else setView({ type: 'CREATE', date });
                         }} 
                         isLoading={isLoading && entries.length === 0}
                     />
                     <MobileNavigation 
                        activeView="CALENDAR" 
                        onChangeView={(t) => { if (t !== 'EDIT' && t !== 'READ') setView({type: t} as ViewState); }} 
                    />
                 </div>
             );
          case 'CREATE': 
             return <EntryEditorView 
                        initialData={view.date ? { date: view.date } : undefined} 
                        onSave={d => handleSaveEntry(d, false)} 
                        onCancel={() => setView({type: 'LIST'})} 
                    />;
          case 'EDIT': 
             return <EntryEditorView 
                initialData={activeEntryData} 
                onSave={d => handleSaveEntry(d, true)} 
                onCancel={() => setView({type: 'READ', id: activeEntryData!.id})} 
                onDeleteAttachment={async (aid) => { 
                 if(!confirm("Delete image?")) return; 
                 await DriveService.deleteFile(aid); 
                 setActiveEntryData(p => {
                    if (!p) return undefined;
                    const isCover = p.coverImageId === aid;
                    return {
                        ...p, 
                        attachments: p.attachments?.filter(a => a.id !== aid),
                        coverImageId: isCover ? undefined : p.coverImageId,
                        coverImage: isCover ? undefined : p.coverImage
                    };
                 }); 
             }} />;
          case 'READ': 
             return <EntryReaderView 
                      entry={activeEntryData!} 
                      onBack={() => setView({type: 'LIST'})} 
                      onEdit={() => setView({type: 'EDIT', id: activeEntryData!.id})} 
                      onDelete={() => handleDelete(activeEntryData!.id)} 
                      isLoading={isLoading} 
                      fontStyle={fontPreference}
                      setFontStyle={updateFontPreference}
                    />;
          default: return null;
      }
  };

  return (
    <div className="antialiased font-sans text-surface-900 dark:text-surface-50 transition-colors duration-300">
        {renderView()}
    </div>
  );
};

export default App;
