const { useState, useEffect, useMemo, useCallback, useRef } = React;

function App() {
  const videoContainerRef = useRef(null);
  const [skipCountdown, setSkipCountdown] = useState(0);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      if (videoContainerRef.current?.requestFullscreen) videoContainerRef.current.requestFullscreen();
      else if (videoContainerRef.current?.webkitRequestFullscreen) videoContainerRef.current.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  };

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState(new Set());
  const [activeSource, setActiveSource] = useState('All');
  const [activeVideo, setActiveVideo] = useState(null);
  const [sortOption, setSortOption] = useState("random");
  const [page, setPage] = useState(1);
  const itemsPerPage = 30;

  const [favorites, setFavorites] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ubu_favorites') || '[]')); } 
    catch { return new Set(); }
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    if (activeVideo) setSkipCountdown(30);
    else setSkipCountdown(0);
  }, [activeVideo]);

  useEffect(() => {
    let interval;
    if (skipCountdown > 0) {
      interval = setInterval(() => setSkipCountdown(prev => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [skipCountdown]);

  useEffect(() => {
    localStorage.setItem('ubu_favorites', JSON.stringify(Array.from(favorites)));
  }, [favorites]);

  const toggleFavorite = (row) => {
    const uid = `${row.Title}_${row.Artist}`;
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // Fetch data
  useEffect(() => {
    Promise.all([
      fetch('ubu_data_light.json').then(res => res.json()).catch(() => []),
      fetch('prelinger_data_light.json').then(res => res.json()).catch(() => [])
    ]).then(([ubuJson, prelingerJson]) => {
        const ubuData = ubuJson.map(row => ({...row, Source: 'UbuWeb'}));
        const prelingerData = prelingerJson.map(row => ({...row, Source: 'Prelinger'}));
        const combined = [...ubuData, ...prelingerData];

        const parsed = combined.map(row => {
          const parseStringList = (str) => {
            if (!str) return [];
            return str.split(',').map(s => s.trim()).filter(s => s);
          };
          
          return {
            ...row,
            Genres_list: parseStringList(row.Genres),
            Moods_list: parseStringList(row.Moods),
            Themes_list: parseStringList(row.Themes),
            year_clean: parseInt(row.Year) || null,
            random_key: Math.random() // Unique seed for stable randomization
          };
        });
        setData(parsed);
        setLoading(false);
      });
  }, []);

  const toggleTag = (tag) => {
    setActiveTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    setPage(1); // Reset pagination on filter
  };

  const clearFilters = () => {
    setActiveTags(new Set());
    setActiveSource('All');
    setSearch("");
    setSortOption("random");
    setShowFavoritesOnly(false);
    setPage(1);
  };

  const filteredData = useMemo(() => {
    let result = data;
    if (activeSource !== 'All') {
      result = result.filter(row => row.Source === activeSource);
    }
    if (showFavoritesOnly) {
      result = result.filter(row => favorites.has(`${row.Title}_${row.Artist}`));
    }
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(row => 
        (row.Title && row.Title.toLowerCase().includes(lower)) || 
        (row.Description && row.Description.toLowerCase().includes(lower)) ||
        (row.Artist && row.Artist.toLowerCase().includes(lower))
      );
    }
    
    if (activeTags.size > 0) {
      result = result.filter(row => {
        const itemTags = [...row.Genres_list, ...row.Moods_list, ...row.Themes_list];
        // Must contain ALL active tags (AND logic)
        return Array.from(activeTags).every(tag => itemTags.includes(tag));
      });
    }
    return result;
  }, [data, search, activeTags, showFavoritesOnly, favorites, activeSource]);

  const sortedData = useMemo(() => {
    let result = [...filteredData];
    switch (sortOption) {
      case "year_asc": 
        result.sort((a, b) => (a.year_clean || 9999) - (b.year_clean || 9999)); 
        break;
      case "year_desc": 
        result.sort((a, b) => (b.year_clean || 0) - (a.year_clean || 0)); 
        break;
      case "title_asc": 
        result.sort((a, b) => (a.Title || '').localeCompare(b.Title || '')); 
        break;
      case "title_desc": 
        result.sort((a, b) => (b.Title || '').localeCompare(a.Title || '')); 
        break;
      case "artist_asc": 
        result.sort((a, b) => (a.Artist || '').localeCompare(b.Artist || '')); 
        break;
      case "artist_desc": 
        result.sort((a, b) => (b.Artist || '').localeCompare(a.Artist || '')); 
        break;
      case "random": 
      default: 
        result.sort((a, b) => a.random_key - b.random_key); 
        break;
    }
    return result;
  }, [filteredData, sortOption]);

  const uniqueTags = useMemo(() => {
    const genres = new Set(), moods = new Set(), themes = new Set();
    filteredData.forEach(row => {
      row.Genres_list.forEach(g => genres.add(g));
      row.Moods_list.forEach(m => moods.add(m));
      row.Themes_list.forEach(t => themes.add(t));
    });
    return {
      genres: Array.from(genres).sort(),
      moods: Array.from(moods).sort(),
      themes: Array.from(themes).sort()
    };
  }, [filteredData]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, page]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  const surpriseMe = useCallback((force = false) => {
    if (typeof force !== 'boolean') force = false; // Protect against native React click event injections
    if (!force && skipCountdown > 0) return;
    const validVideos = filteredData.filter(v => v.Link && typeof v.Link === 'string');
    if (validVideos.length > 0) {
      const random = validVideos[Math.floor(Math.random() * validVideos.length)];
      setActiveVideo(random);
    } else {
      alert("No playable videos found in the current filter context.");
    }
  }, [filteredData, skipCountdown]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Invisible global shortcut bypasses native fullscreen restrictions
      if (activeVideo && (e.key === 'ArrowRight' || e.key.toLowerCase() === 'n')) {
        surpriseMe();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeVideo, surpriseMe]);

  const ExpandableDescription = ({ text, defaultOpen = false, maxHeight = 'none' }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    if (!text) return null;
    return (
      <div style={{marginTop: '12px'}}>
        <div 
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          style={{cursor: 'pointer', color: 'var(--accent)', fontSize: '12px', fontWeight: '600', marginBottom: '8px'}}
        >
          {isOpen ? 'Hide Description ▲' : 'Read Description ▼'}
        </div>
        {isOpen && (
          <div style={{fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', maxHeight: maxHeight, overflowY: 'auto', paddingRight: '10px'}}>
            {text}
          </div>
        )}
      </div>
    );
  };

  const FilterSection = ({ title, tags, activeTags, onToggle, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [query, setQuery] = useState("");
    
    const baseTags = tags.filter(t => !activeTags.has(t));
    const visibleTags = baseTags.filter(t => t.toLowerCase().includes(query.toLowerCase()));

    return (
      <div className="filter-section" style={{marginBottom: '15px'}}>
        <div 
          className="filter-group-header" 
          onClick={() => setIsOpen(!isOpen)} 
          style={{cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
        >
          <span>{title} <span style={{color: 'var(--accent)', textTransform: 'none', letterSpacing: 'normal'}}>({baseTags.length})</span></span> 
          <span style={{fontSize: '9px'}}>{isOpen ? '▲' : '▼'}</span>
        </div>
        {isOpen && (
          <div className="tags-container" style={{marginTop: '10px'}}>
            <input 
              type="text" 
              placeholder={`Search ${title.toLowerCase()}...`}
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', fontSize: '13px',
                background: 'rgba(255,255,255,0.03)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                marginBottom: '10px', outline: 'none'
              }}
              onClick={e => e.stopPropagation()}
            />
            {visibleTags.map(t => (
              <div key={t} className="tag" onClick={() => { onToggle(t); setQuery(""); }}>{t}</div>
            ))}
            {visibleTags.length === 0 && <span style={{fontSize:'12px', color:'#666'}}>No matching tags.</span>}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div style={{padding: '50px', color: '#fff'}}>Loading visual archive...</div>;

  return (
    <div id="app">
      <aside className="sidebar">
        <div className="brand">UbuWeb.</div>
        
        <input 
          className="search-input"
          placeholder="Search Title, Artist, or Description..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />

        <div style={{display: 'flex', gap: '10px', marginBottom: '25px'}}>
          <button className="random-btn" style={{marginTop: 0, flex: 2}} onClick={() => surpriseMe(true)}>
            🎲 Surprise Me!
          </button>
          <button 
            className="random-btn" 
            style={{marginTop: 0, flex: 1, background: 'rgba(255,0,0,0.1)', borderColor: 'rgba(255,0,0,0.2)', color: '#ffaaaa'}} 
            onClick={clearFilters}
          >
            Clear
          </button>
        </div>

        <div style={{marginBottom: '20px'}}>
          <div className="filter-group-header" style={{marginTop: 0}}>Archive Source</div>
          <select 
            value={activeSource} 
            onChange={e => { setActiveSource(e.target.value); setPage(1); }}
            style={{
              width: '100%', padding: '8px 10px', fontSize: '13px',
              background: 'rgba(255,255,255,0.03)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
              outline: 'none', colorScheme: 'dark'
            }}
          >
            <option value="All">All Archives</option>
            <option value="UbuWeb">UbuWeb Archive</option>
            <option value="Prelinger">Prelinger Collections</option>
          </select>
        </div>

        <div style={{marginBottom: '20px'}}>
          <div className="filter-group-header" style={{marginTop: 0}}>Sort By</div>
          <select 
            value={sortOption} 
            onChange={e => { setSortOption(e.target.value); setPage(1); }}
            style={{
              width: '100%', padding: '8px 10px', fontSize: '13px',
              background: 'rgba(255,255,255,0.03)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
              outline: 'none', colorScheme: 'dark'
            }}
          >
            <option value="random">🎲 Randomized (Default)</option>
            <option value="year_desc">📅 Year: Newest First</option>
            <option value="year_asc">📅 Year: Oldest First</option>
            <option value="title_asc">🔤 Title: A-Z</option>
            <option value="title_desc">🔤 Title: Z-A</option>
            <option value="artist_asc">👤 Artist: A-Z</option>
            <option value="artist_desc">👤 Artist: Z-A</option>
          </select>
        </div>

        <div style={{marginBottom: '20px'}}>
          <div 
            className={`tag ${showFavoritesOnly ? 'active' : ''}`} 
            style={{display: 'block', textAlign: 'center', padding: '10px', fontSize: '14px', marginTop: '10px', transition: 'all 0.2s', background: showFavoritesOnly ? 'var(--accent)' : 'rgba(255,255,255,0.05)'}}
            onClick={() => { setShowFavoritesOnly(!showFavoritesOnly); setPage(1); }}
          >
            {showFavoritesOnly ? '❤️ Showing Favorites Only' : '🤍 Show My Favorites'}
          </div>
        </div>

        <div className="filter-group-header">Active Filters ({activeTags.size})</div>
        <div className="tags-container" style={{marginBottom: '20px'}}>
          {Array.from(activeTags).map(tag => (
            <div key={tag} className="tag active" onClick={() => toggleTag(tag)}>
              {tag} ×
            </div>
          ))}
          {activeTags.size === 0 && <div style={{fontSize:'12px', color:'#777'}}>No filters active. Click tags below to refine.</div>}
        </div>

        <FilterSection title="Genres" tags={uniqueTags.genres} activeTags={activeTags} onToggle={toggleTag} defaultOpen={false} />
        <FilterSection title="Moods" tags={uniqueTags.moods} activeTags={activeTags} onToggle={toggleTag} defaultOpen={false} />
        <FilterSection title="Themes" tags={uniqueTags.themes} activeTags={activeTags} onToggle={toggleTag} defaultOpen={false} />
      </aside>

      <main className="main">
        <div className="pagination-info">
          <span>Displaying <b>{filteredData.length}</b> cinematic works.</span>
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(page-1)}>Prev</button>
            <span>Page {page} of {totalPages || 1}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page+1)}>Next</button>
          </div>
        </div>

        <div className="masonry">
          {paginatedData.map((row, idx) => {
            const uid = `${row.Title}_${row.Artist}`;
            const isFav = favorites.has(uid);
            return (
              <div className="card" key={`card-${idx}`}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                  <h3 className="card-title" style={{marginRight: '10px'}}>{row.Title || 'Unknown Title'}</h3>
                  <button 
                    onClick={() => toggleFavorite(row)}
                    style={{background:'transparent', border:'none', cursor:'pointer', fontSize:'20px', padding:0, flexShrink: 0, marginTop: '-3px'}}
                    title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                  >
                    {isFav ? '❤️' : '🤍'}
                  </button>
                </div>
                <p className="card-artist">{row.Artist || 'Unknown Artist'} {row.year_clean ? `(${row.year_clean})` : ''} • {row.Source}</p>
                
                <div className="tags-container">
                  {row.Genres_list.map(t => (
                    <span key={t} className={`tag ${activeTags.has(t) ? 'active' : ''}`} onClick={() => toggleTag(t)}>🏷️ {t}</span>
                  ))}
                  {row.Moods_list.map(t => (
                    <span key={t} className={`tag ${activeTags.has(t) ? 'active' : ''}`} onClick={() => toggleTag(t)}>🎭 {t}</span>
                  ))}
                  {row.Themes_list.map(t => (
                    <span key={t} className={`tag ${activeTags.has(t) ? 'active' : ''}`} onClick={() => toggleTag(t)}>💡 {t}</span>
                  ))}
                </div>

                <ExpandableDescription text={row.Description} />
                
                <div className="card-actions">
                  {row.Link && typeof row.Link === 'string' ? (
                    <button className="btn-watch" onClick={() => setActiveVideo(row)}>
                      🎬 Watch Video
                    </button>
                  ) : (
                    <span style={{color: '#666', fontSize:'13px'}}>No Video Found</span>
                  )}
                  {row.Link && typeof row.Link === 'string' && (
                    <a 
                      href={row.Link.includes('archive.org/embed/') ? row.Link.replace('/embed/', '/details/') : row.Link} 
                      download={!row.Link.includes('archive.org/embed/')} 
                      className="btn-download" 
                      target="_blank" 
                      rel="noreferrer"
                    >
                      {row.Link.includes('archive.org/embed/') ? '📥 View Options' : '📥 Download'}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Video Modal Overlay */}
      {activeVideo && (
        <div className="modal-overlay" onClick={() => setActiveVideo(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setActiveVideo(null)}>×</button>
            <div className="video-container" ref={videoContainerRef}>
              <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', gap: '8px', zIndex: 9999 }}>
                <button 
                  onClick={() => toggleFavorite(activeVideo)}
                  style={{background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'6px', padding:'6px 10px', fontSize:'14px', cursor:'pointer', backdropFilter:'blur(4px)', color:'#fff'}}
                  title={favorites.has(`${activeVideo.Title}_${activeVideo.Artist}`) ? "Remove from Favorites" : "Add to Favorites"}
                >
                  {favorites.has(`${activeVideo.Title}_${activeVideo.Artist}`) ? '❤️' : '🤍'}
                </button>
                <button 
                  onClick={surpriseMe} 
                  title={skipCountdown > 0 ? `Please wait ${skipCountdown}s` : "Skip to random video"} 
                  style={{
                    background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.2)', 
                    borderRadius:'6px', padding:'6px 10px', fontSize:'14px', 
                    cursor: skipCountdown > 0 ? 'not-allowed' : 'pointer', 
                    opacity: skipCountdown > 0 ? 0.6 : 1,
                    backdropFilter:'blur(4px)', color:'#fff'
                  }}
                >
                  🎲 {skipCountdown > 0 ? `Skip (${skipCountdown})` : `Skip`}
                </button>
                <button onClick={toggleFullScreen} title="Toggle Fullscreen Controls" style={{background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'6px', padding:'6px 10px', fontSize:'14px', cursor:'pointer', backdropFilter:'blur(4px)', color:'#fff', fontWeight: 'bold'}}>
                  ⛶ Fullscreen
                </button>
              </div>
              {activeVideo.Link.match(/\.(mp4|mov|m4v|webm|ogg|flv|avi|mkv)(\?.*)?$/i) ? (
                <video 
                  controls 
                  controlsList="nofullscreen"
                  autoPlay 
                  name="media"
                  src={activeVideo.Link} 
                  onEnded={surpriseMe}
                  style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: '#000'}}
                >
                  <source src={activeVideo.Link} type="video/quicktime" />
                  <source src={activeVideo.Link} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <iframe 
                  src={activeVideo.Source === 'Prelinger' ? (activeVideo.Link.includes('?') ? `${activeVideo.Link}&start=5` : `${activeVideo.Link}?start=5`) : activeVideo.Link} 
                  title={activeVideo.Title}
                ></iframe>
              )}
            </div>
            <div className="modal-info">
              <div style={{display: 'flex', alignItems: 'center', marginBottom: '5px'}}>
                <h2 style={{margin: 0, fontSize: '22px', marginRight: '15px'}}>{activeVideo.Title}</h2>
                <button 
                  onClick={() => toggleFavorite(activeVideo)}
                  style={{background:'transparent', border:'none', cursor:'pointer', fontSize:'24px', padding:0}}
                  title={favorites.has(`${activeVideo.Title}_${activeVideo.Artist}`) ? "Remove from Favorites" : "Add to Favorites"}
                >
                  {favorites.has(`${activeVideo.Title}_${activeVideo.Artist}`) ? '❤️' : '🤍'}
                </button>
              </div>
              <p style={{margin: '0 0 10px 0', color: 'var(--accent)'}}>{activeVideo.Artist} • {activeVideo.Source}</p>
              <ExpandableDescription text={activeVideo.Description} defaultOpen={true} maxHeight="25vh" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
