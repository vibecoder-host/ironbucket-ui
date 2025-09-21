// Modern Dashboard JavaScript

// Global variables
let currentBucket = null;
let currentPath = '';
let currentView = 'grid';
let selectedFiles = new Set();
let files = [];
let buckets = [];
let contextTarget = null;
let renameTarget = null;
let recentFiles = [];
let starredFiles = new Set();
let activeFilters = new Set(['all']);
let originalFiles = [];
let currentSort = 'name-asc';
let sortPreferences = {};

window.s3Signer = null; // Will be set after S3 initialization

// Function to update global window variables
function updateGlobalVariables() {
    window.files = files;
    window.currentBucket = currentBucket;
    window.currentPath = currentPath;
    window.s3Signer = window.s3Signer || s3Signer;
    window.s3Fetch = s3Fetch;
    window.displayItems = displayItems;
    window.loadFiles = loadFiles;
    window.generatePresignedUrl = generatePresignedUrl;
}

// Clipboard for copy/paste operations
let clipboard = {
    items: [],
    operation: null, // 'copy' or 'cut'
    sourceBucket: null,
    sourcePath: null
};

// Pagination variables
let paginationConfig = {
    pageSize: 100,          // Number of items per page (optimized for performance)
    continuationToken: null, // S3 continuation token for next page
    hasNextPage: false,     // Whether more pages are available
    totalLoaded: 0,         // Total number of items loaded so far
    isLoading: false,       // Whether currently loading
    isTruncated: false,     // Whether the result was truncated (from S3 response)
    isLoadingAll: false     // Whether loading all remaining items
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    if (!requireAuth()) {
        return;
    }

    // Initialize S3 configuration
    if (!initializeS3Config()) {
        console.error('Failed to initialize S3 configuration');
        window.location.href = 'login.html';
        return;
    }

    // Update global variables after S3 initialization
    window.s3Signer = s3Signer;
    updateGlobalVariables();

    initializeUI();
    setupEventListeners();
    initializeTheme();

    // Check for resumable uploads
    checkResumableUploads();

    // Handle initial navigation from URL hash
    handleHashNavigation();

    updateUserInfo();
});

// Initialize UI
function initializeUI() {
    // Set initial view
    currentView = localStorage.getItem('viewMode') || 'grid';
    updateViewMode();

    // Load starred files
    const starred = localStorage.getItem('starredFiles');
    if (starred) {
        starredFiles = new Set(JSON.parse(starred));
    }

    // Load recent files
    const recent = localStorage.getItem('recentFiles');
    if (recent) {
        recentFiles = JSON.parse(recent);
    }
}

// Toggle sidebar for mobile - defined before setupEventListeners
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar.classList.contains('show')) {
        closeSidebar();
    } else {
        sidebar.classList.add('show');
        overlay.classList.add('show');
    }
}

// Close sidebar
function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.remove('show');
    overlay.classList.remove('show');
}

// Setup event listeners
function setupEventListeners() {
    // Header buttons
    document.getElementById('menuToggle').addEventListener('click', toggleSidebar);
    document.getElementById('userMenuBtn').addEventListener('click', toggleUserMenu);

    // Sidebar navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(item.dataset.view);
        });
    });


    // Toolbar buttons
    document.getElementById('createFolderBtn').addEventListener('click', () => showModal('createFolderModal'));
    document.getElementById('uploadFileBtn').addEventListener('click', () => showModal('uploadModal'));
    document.getElementById('refreshBtn').addEventListener('click', refresh);
    document.getElementById('gridViewBtn').addEventListener('click', () => setViewMode('grid'));
    document.getElementById('listViewBtn').addEventListener('click', () => setViewMode('list'));

    // Search
    document.getElementById('searchInput').addEventListener('input', handleSearch);

    // Advanced search button
    document.getElementById('advancedSearchBtn').addEventListener('click', () => showModal('advancedSearchModal'));

    // Initialize filters
    initializeFilters();

    // Initialize sorting
    initializeSorting();

    // Pagination
    document.getElementById('loadMoreBtn').addEventListener('click', loadMoreFiles);
    document.getElementById('loadAllBtn').addEventListener('click', loadAllFiles);

    // File upload
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('folderInput').addEventListener('change', handleFolderSelect);
    document.getElementById('hiddenFileInput').addEventListener('change', handleFileSelect);
    document.getElementById('startUploadBtn').addEventListener('click', startUpload);

    // Drag and drop
    setupDragAndDrop();

    // Context menu
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', hideContextMenu);

    // Window resize
    window.addEventListener('resize', handleResize);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Hash change event for browser navigation
    window.addEventListener('hashchange', handleHashNavigation);

    // Initialize rectangle selection
    initRectangleSelection();

    // Initialize infinite scroll
    initializeInfiniteScroll();

    // Mobile menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (menuToggle) {
        menuToggle.addEventListener('click', toggleSidebar);
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }

    // Close sidebar when a nav item is clicked on mobile
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });
}

// Rectangle Selection
let isSelecting = false;
let selectionStart = { x: 0, y: 0 };
let selectionRectangle = null;

function initRectangleSelection() {
    selectionRectangle = document.getElementById('selectionRectangle');
    const filesContainer = document.getElementById('filesContainer');

    filesContainer.addEventListener('mousedown', startSelection);
    document.addEventListener('mousemove', updateSelection);
    document.addEventListener('mouseup', endSelection);
}

function startSelection(e) {
    // Disable rectangle selection on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        return;
    }

    // Only start selection if clicking on empty space (not on file items or buttons)
    if (e.target.closest('.file-item') || e.target.closest('button') || e.target.closest('.bulk-action-bar')) {
        return;
    }

    // Clear existing selection if not holding Ctrl/Cmd
    if (!e.ctrlKey && !e.metaKey) {
        clearSelection();
    }

    const filesContainer = document.getElementById('filesContainer');
    const rect = filesContainer.getBoundingClientRect();

    isSelecting = true;
    selectionStart.x = e.clientX - rect.left + filesContainer.scrollLeft;
    selectionStart.y = e.clientY - rect.top + filesContainer.scrollTop;

    selectionRectangle.style.left = selectionStart.x + 'px';
    selectionRectangle.style.top = selectionStart.y + 'px';
    selectionRectangle.style.width = '0px';
    selectionRectangle.style.height = '0px';
    selectionRectangle.style.display = 'block';

    e.preventDefault();
}

function updateSelection(e) {
    if (!isSelecting) return;

    const filesContainer = document.getElementById('filesContainer');
    const rect = filesContainer.getBoundingClientRect();

    const currentX = e.clientX - rect.left + filesContainer.scrollLeft;
    const currentY = e.clientY - rect.top + filesContainer.scrollTop;

    const left = Math.min(currentX, selectionStart.x);
    const top = Math.min(currentY, selectionStart.y);
    const width = Math.abs(currentX - selectionStart.x);
    const height = Math.abs(currentY - selectionStart.y);

    selectionRectangle.style.left = left + 'px';
    selectionRectangle.style.top = top + 'px';
    selectionRectangle.style.width = width + 'px';
    selectionRectangle.style.height = height + 'px';

    // Check which files are within the selection rectangle
    const selectionRect = selectionRectangle.getBoundingClientRect();
    document.querySelectorAll('.file-item').forEach(item => {
        const itemRect = item.getBoundingClientRect();
        const isIntersecting = !(
            selectionRect.right < itemRect.left ||
            selectionRect.left > itemRect.right ||
            selectionRect.bottom < itemRect.top ||
            selectionRect.top > itemRect.bottom
        );

        if (isIntersecting) {
            if (!item.classList.contains('selected')) {
                item.classList.add('selected');
                selectedFiles.add(item.dataset.key);
            }
        } else if (!e.ctrlKey && !e.metaKey) {
            item.classList.remove('selected');
            selectedFiles.delete(item.dataset.key);
        }
    });

    updateBulkActionBar();
}

function endSelection(e) {
    if (!isSelecting) return;

    isSelecting = false;
    selectionRectangle.style.display = 'none';
}

function updateBulkActionBar() {
    const bulkActionBar = document.getElementById('bulkActionBar');
    const selectedCount = document.getElementById('selectedCount');

    // Check if elements exist
    if (!bulkActionBar) return;

    // Only show bulk action bar when 2 or more items are selected
    if (selectedFiles.size >= 2) {
        bulkActionBar.style.display = 'flex';
        if (selectedCount) {
            selectedCount.textContent = selectedFiles.size;
        }
    } else {
        bulkActionBar.style.display = 'none';
    }
}

function clearSelection() {
    document.querySelectorAll('.file-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    selectedFiles.clear();
    updateBulkActionBar();
}

// Update user info
function updateUserInfo() {
    if (S3_CONFIG) {
        document.getElementById('userEndpoint').textContent = S3_CONFIG.endpoint;
        document.getElementById('userName').textContent = S3_CONFIG.accessKey || 'User';
    }
}

// Toggle user menu
function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.classList.toggle('show');
}

// Show new menu
function showNewMenu(e) {
    // Function removed as New button was deleted
}

function hideNewMenu() {
    // Function removed as New button was deleted
}

// Handle hash navigation
function handleHashNavigation() {
    const hash = window.location.hash.substring(1); // Remove #

    if (!hash) {
        // No hash, show buckets view
        switchView('buckets');
        return;
    }

    // Handle old format (bucket=bucketname) for backwards compatibility
    let cleanHash = hash;
    if (hash.startsWith('bucket=')) {
        cleanHash = hash.substring(7); // Remove 'bucket=' prefix
        // Update the URL to use the new format
        window.location.hash = cleanHash;
        return; // Let the hashchange event handle it again
    }

    // Parse hash: bucket/path/to/folder
    const parts = cleanHash.split('/');
    const bucket = parts[0];

    if (!bucket) {
        switchView('buckets');
        return;
    }

    // Set current bucket and path
    currentBucket = bucket;

    if (parts.length > 1) {
        // Has a path within the bucket
        currentPath = parts.slice(1).join('/');
    } else {
        currentPath = '';
    }

    // Update UI and load files
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    updateBreadcrumb();

    // Load sorting preferences for this path
    loadSortPreference(currentPath);

    loadFiles();
}

// Update URL hash based on current navigation
function updateUrlHash() {
    let hash = '';

    if (currentBucket) {
        hash = currentBucket;
        if (currentPath) {
            hash += '/' + currentPath;
        }
    }

    // Update URL without triggering hashchange event
    if (window.location.hash.substring(1) !== hash) {
        history.replaceState(null, null, hash ? '#' + hash : window.location.pathname);
    }
}

// Switch view
function switchView(view) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`).classList.add('active');

    // Handle different views
    switch(view) {
        case 'all':
        case 'buckets':
            currentBucket = null;
            currentPath = '';
            updateUrlHash();
            loadBuckets();
            break;
        case 'recent':
            showRecentFiles();
            break;
        case 'starred':
            showStarredFiles();
            break;
    }
}

// View mode
function setViewMode(mode) {
    currentView = mode;
    localStorage.setItem('viewMode', mode);


    updateViewMode();
}

function updateViewMode() {
    const grid = document.getElementById('filesGrid');
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');

    // Check if elements exist
    if (!grid) return;

    if (currentView === 'grid') {
        grid.classList.remove('list-view');
        if (gridBtn) gridBtn.classList.add('active');
        if (listBtn) listBtn.classList.remove('active');
    } else {
        grid.classList.add('list-view');
        if (listBtn) listBtn.classList.add('active');
        if (gridBtn) gridBtn.classList.remove('active');
    }
}

// Load buckets
async function loadBuckets() {
    currentBucket = null;
    currentPath = '';
    updateBreadcrumb();

    const container = document.getElementById('filesGrid');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const response = await s3Fetch('/');
        const text = await response.text();

        // Parse XML response
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        const bucketNodes = xmlDoc.getElementsByTagName('Bucket');
        buckets = [];

        for (let i = 0; i < bucketNodes.length; i++) {
            const nameNode = bucketNodes[i].getElementsByTagName('Name')[0];
            const creationNode = bucketNodes[i].getElementsByTagName('CreationDate')[0];

            if (nameNode) {
                buckets.push({
                    name: nameNode.textContent,
                    creationDate: creationNode ? creationNode.textContent : 'Unknown',
                    type: 'bucket'
                });
            }
        }

        displayItems(buckets);
        updateStorageInfo();
    } catch (error) {
        console.error('Error loading buckets:', error);
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Failed to load buckets</h3></div>';
    }
}

// Load files with pagination support
async function loadFiles(loadMore = false) {
    const container = document.getElementById('filesGrid');

    // Reset pagination if not loading more
    if (!loadMore) {
        resetPagination();
        files = [];
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    } else if (paginationConfig.isLoading) {
        return; // Prevent duplicate requests
    }

    paginationConfig.isLoading = true;
    updateLoadMoreButton();

    try {
        const prefix = currentPath ? currentPath + '/' : '';
        let url = `/${currentBucket}?list-type=2&delimiter=/&prefix=${encodeURIComponent(prefix)}&max-keys=${paginationConfig.pageSize}`;

        // Add continuation token if loading more
        if (loadMore && paginationConfig.continuationToken) {
            url += `&continuation-token=${encodeURIComponent(paginationConfig.continuationToken)}`;
        }

        const response = await s3Fetch(url);
        const text = await response.text();

        // Parse XML response
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        const newFiles = [];

        // Get folders (CommonPrefixes)
        const prefixes = xmlDoc.getElementsByTagName('CommonPrefixes');
        for (let i = 0; i < prefixes.length; i++) {
            const prefixNode = prefixes[i].getElementsByTagName('Prefix')[0];
            if (prefixNode) {
                const fullPath = prefixNode.textContent;
                const name = fullPath.replace(prefix, '').replace(/\/$/, '');
                newFiles.push({
                    name: name,
                    type: 'folder',
                    size: 0,
                    lastModified: null,
                    key: fullPath
                });
            }
        }

        // Get files (Contents)
        const contents = xmlDoc.getElementsByTagName('Contents');
        for (let i = 0; i < contents.length; i++) {
            const keyNode = contents[i].getElementsByTagName('Key')[0];
            const sizeNode = contents[i].getElementsByTagName('Size')[0];
            const modifiedNode = contents[i].getElementsByTagName('LastModified')[0];

            if (keyNode) {
                const key = keyNode.textContent;
                // Skip if it's the prefix itself or ends with /
                if (key === prefix || key.endsWith('/')) continue;

                const name = key.replace(prefix, '');
                // Skip "empty" files (folder markers)
                if (name === 'empty') continue;

                newFiles.push({
                    name: name,
                    type: 'file',
                    size: sizeNode ? parseInt(sizeNode.textContent) : 0,
                    lastModified: modifiedNode ? modifiedNode.textContent : null,
                    key: key
                });
            }
        }

        // Update pagination state
        const isTruncatedNode = xmlDoc.getElementsByTagName('IsTruncated')[0];
        const nextContinuationTokenNode = xmlDoc.getElementsByTagName('NextContinuationToken')[0];

        paginationConfig.isTruncated = isTruncatedNode ? isTruncatedNode.textContent === 'true' : false;
        paginationConfig.hasNextPage = paginationConfig.isTruncated;
        paginationConfig.continuationToken = nextContinuationTokenNode ? nextContinuationTokenNode.textContent : null;

        // Add new files to the global files array
        if (loadMore) {
            files = files.concat(newFiles);
        } else {
            files = newFiles;
            // Reset originalFiles when loading fresh data
            originalFiles = [];
        }

        paginationConfig.totalLoaded = files.length;

        updateGlobalVariables();

        // Apply filters and display files
        applyFilters();
        updatePaginationUI();

    } catch (error) {
        console.error('Error loading files:', error);
        if (!loadMore) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Failed to load files</h3></div>';
        }
    } finally {
        paginationConfig.isLoading = false;
        updateLoadMoreButton();
    }
}

// Display items (buckets or files)
function displayItems(items) {
    const container = document.getElementById('filesGrid');

    // Check if container exists
    if (!container) {
        console.error('Files container not found');
        return;
    }

    // Check if items is defined and is an array
    if (!items || !Array.isArray(items)) {
        items = [];
    }

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>This folder is empty</h3>
                <p>Upload files or create folders to get started</p>
                <button class="btn-primary" onclick="document.getElementById('hiddenFileInput').click()">
                    <i class="fas fa-upload"></i> Upload Files
                </button>
            </div>
        `;
        return;
    }

    let html = '';
    items.forEach(item => {
        if (currentView === 'grid') {
            html += createGridItem(item);
        } else {
            html += createListItem(item);
        }
    });

    container.innerHTML = html;

    // Restore selection state for items that were previously selected
    document.querySelectorAll('.file-item').forEach(el => {
        if (selectedFiles.has(el.dataset.key)) {
            el.classList.add('selected');
        }
    });

    // Update bulk action bar based on current selection
    updateBulkActionBar();

    // Add event listeners to items
    document.querySelectorAll('.file-item').forEach(el => {
        el.addEventListener('click', handleItemClick);
        el.addEventListener('dblclick', handleItemDoubleClick);

        // Add touch event support for mobile
        let touchStartTime = 0;
        let touchTimeout = null;

        el.addEventListener('touchstart', (e) => {
            touchStartTime = Date.now();
            touchTimeout = setTimeout(() => {
                // Long press - show context menu
                const touch = e.touches[0];
                const fakeEvent = {
                    currentTarget: el,
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    preventDefault: () => e.preventDefault()
                };
                showContextMenu(fakeEvent, el.dataset.key, el.dataset.type);
            }, 500);
        }, { passive: true });

        el.addEventListener('touchend', (e) => {
            clearTimeout(touchTimeout);
            const touchDuration = Date.now() - touchStartTime;

            if (touchDuration < 500) {
                // Short tap - treat as click
                e.preventDefault();

                // Check if this is a second tap (double tap detection)
                if (el.dataset.lastTap && (Date.now() - parseInt(el.dataset.lastTap)) < 300) {
                    // Double tap - open item
                    delete el.dataset.lastTap;
                    handleItemDoubleClick({ currentTarget: el });
                } else {
                    // Single tap - select item
                    el.dataset.lastTap = Date.now();
                    handleItemClick({
                        currentTarget: el,
                        target: e.target,
                        ctrlKey: false,
                        metaKey: false
                    });

                    // Clear double tap detection after timeout
                    setTimeout(() => {
                        delete el.dataset.lastTap;
                    }, 300);
                }
            }
        });

        el.addEventListener('touchmove', () => {
            clearTimeout(touchTimeout);
        });
    });
}

// Create grid item
function createGridItem(item) {
    const isFolder = item.type === 'folder' || item.type === 'bucket';
    const icon = getFileIcon(item);
    const isStarred = starredFiles.has(item.key || item.name);
    // Escape single quotes for JavaScript string
    const escapedKey = (item.key || item.name).replace(/'/g, "\\'");

    return `
        <div class="file-item" data-name="${item.name}" data-type="${item.type}" data-key="${item.key || item.name}">
            <div class="file-actions">
                <button class="btn-icon" onclick="toggleStar('${escapedKey}'); event.stopPropagation();">
                    <i class="fas fa-star ${isStarred ? 'starred' : ''}"></i>
                </button>
                <button class="btn-icon" onclick="showItemMenu(event, this)">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
            <div class="file-icon ${icon.class}">
                <i class="${icon.icon}"></i>
            </div>
            <div class="file-name" title="${item.name}">${item.name}</div>
            <div class="file-info">${formatFileInfo(item)}</div>
        </div>
    `;
}

// Create list item
function createListItem(item) {
    const icon = getFileIcon(item);
    const isStarred = starredFiles.has(item.key || item.name);
    // Escape single quotes for JavaScript string
    const escapedKey = (item.key || item.name).replace(/'/g, "\\'");

    return `
        <div class="file-item" data-name="${item.name}" data-type="${item.type}" data-key="${item.key || item.name}">
            <div class="file-icon ${icon.class}">
                <i class="${icon.icon}"></i>
            </div>
            <div class="file-details">
                <div class="file-name">${item.name}</div>
                <div class="file-meta">
                    <span>${formatFileSize(item.size)}</span>
                    <span style="cursor: help;" title="${(item.lastModified || item.creationDate) ? new Date(item.lastModified || item.creationDate).toLocaleString() : ''}">${formatDate(item.lastModified || item.creationDate)}</span>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn-icon" onclick="toggleStar('${escapedKey}'); event.stopPropagation();">
                    <i class="fas fa-star ${isStarred ? 'starred' : ''}"></i>
                </button>
                <button class="btn-icon" onclick="showItemMenu(event, this)">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        </div>
    `;
}

// Get file icon
function getFileIcon(item) {
    if (item.type === 'folder' || item.type === 'bucket') {
        return { icon: 'fas fa-folder', class: 'folder' };
    }

    const ext = item.name.split('.').pop().toLowerCase();
    const iconMap = {
        // Images
        jpg: { icon: 'fas fa-image', class: 'image' },
        jpeg: { icon: 'fas fa-image', class: 'image' },
        png: { icon: 'fas fa-image', class: 'image' },
        gif: { icon: 'fas fa-image', class: 'image' },
        svg: { icon: 'fas fa-image', class: 'image' },
        webp: { icon: 'fas fa-image', class: 'image' },

        // Documents
        pdf: { icon: 'fas fa-file-pdf', class: 'document' },
        doc: { icon: 'fas fa-file-word', class: 'document' },
        docx: { icon: 'fas fa-file-word', class: 'document' },
        xls: { icon: 'fas fa-file-excel', class: 'document' },
        xlsx: { icon: 'fas fa-file-excel', class: 'document' },
        ppt: { icon: 'fas fa-file-powerpoint', class: 'document' },
        pptx: { icon: 'fas fa-file-powerpoint', class: 'document' },
        txt: { icon: 'fas fa-file-alt', class: 'document' },

        // Video
        mp4: { icon: 'fas fa-file-video', class: 'video' },
        avi: { icon: 'fas fa-file-video', class: 'video' },
        mov: { icon: 'fas fa-file-video', class: 'video' },
        wmv: { icon: 'fas fa-file-video', class: 'video' },
        mkv: { icon: 'fas fa-file-video', class: 'video' },

        // Audio
        mp3: { icon: 'fas fa-file-audio', class: 'audio' },
        wav: { icon: 'fas fa-file-audio', class: 'audio' },
        flac: { icon: 'fas fa-file-audio', class: 'audio' },
        aac: { icon: 'fas fa-file-audio', class: 'audio' },

        // Archives
        zip: { icon: 'fas fa-file-archive', class: 'archive' },
        rar: { icon: 'fas fa-file-archive', class: 'archive' },
        tar: { icon: 'fas fa-file-archive', class: 'archive' },
        gz: { icon: 'fas fa-file-archive', class: 'archive' },
        '7z': { icon: 'fas fa-file-archive', class: 'archive' },

        // Code
        js: { icon: 'fas fa-file-code', class: 'code' },
        css: { icon: 'fas fa-file-code', class: 'code' },
        html: { icon: 'fas fa-file-code', class: 'code' },
        json: { icon: 'fas fa-file-code', class: 'code' },
        xml: { icon: 'fas fa-file-code', class: 'code' },
        py: { icon: 'fas fa-file-code', class: 'code' },
        java: { icon: 'fas fa-file-code', class: 'code' },
        cpp: { icon: 'fas fa-file-code', class: 'code' },
        c: { icon: 'fas fa-file-code', class: 'code' },
        php: { icon: 'fas fa-file-code', class: 'code' },
    };

    return iconMap[ext] || { icon: 'fas fa-file', class: 'default' };
}

// Handle item click
function handleItemClick(e) {
    const item = e.currentTarget;

    if (!e.target.closest('.file-actions')) {
        // Clear other selections if not holding ctrl
        if (!e.ctrlKey && !e.metaKey) {
            document.querySelectorAll('.file-item.selected').forEach(el => {
                el.classList.remove('selected');
            });
            selectedFiles.clear();
        }

        item.classList.toggle('selected');
        const key = item.dataset.key;
        if (item.classList.contains('selected')) {
            selectedFiles.add(key);
        } else {
            selectedFiles.delete(key);
        }

        updateBulkActionBar();
    }
}

// Handle item double click
function handleItemDoubleClick(e) {
    // Double click event triggered
    const item = e.currentTarget;
    const type = item.dataset.type;
    const name = item.dataset.name;
    const key = item.dataset.key;

    // Processing item click

    if (type === 'bucket') {
        openBucket(name);
    } else if (type === 'folder') {
        openFolder(key);
    } else {
        // Opening file preview
        previewFile(key);
    }
}

// Open bucket
function openBucket(bucketName) {
    currentBucket = bucketName;
    updateGlobalVariables();
    currentPath = '';
    updateUrlHash();
    updateBreadcrumb();

    // Load sorting preferences for this path (root of bucket)
    loadSortPreference(currentPath);

    loadFiles();
}

// Open folder
function openFolder(folderKey) {
    currentPath = folderKey.replace(/\/$/, '');
    updateGlobalVariables();
    updateUrlHash();
    updateBreadcrumb();

    // Load sorting preferences for this path
    loadSortPreference(currentPath);

    loadFiles();
}

// Update breadcrumb
function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    let html = '<a href="#" data-path=""><i class="fas fa-home"></i></a>';

    if (currentBucket) {
        html += '<span class="separator">/</span>';
        html += `<a href="#" data-path="" data-bucket="${currentBucket}">${currentBucket}</a>`;

        if (currentPath) {
            const parts = currentPath.split('/');
            let path = '';
            parts.forEach(part => {
                path += (path ? '/' : '') + part;
                html += '<span class="separator">/</span>';
                html += `<a href="#" data-path="${path}">${part}</a>`;
            });
        }
    }

    breadcrumb.innerHTML = html;

    // Add click handlers
    breadcrumb.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const bucket = link.dataset.bucket;
            const path = link.dataset.path;

            if (!bucket && !path) {
                currentBucket = null;
                currentPath = '';
                updateUrlHash();
                loadBuckets();
            } else if (bucket && !path) {
                openBucket(bucket);
            } else {
                currentPath = path;
                updateUrlHash();
                updateBreadcrumb();

                // Load sorting preferences for this path
                loadSortPreference(currentPath);

                loadFiles();
            }
        });
    });
}

// Context menu
function handleContextMenu(e) {
    const fileItem = e.target.closest('.file-item');
    if (!fileItem) return;

    e.preventDefault();
    contextTarget = fileItem;

    const menu = document.getElementById('contextMenu');
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.classList.add('show');

    // Update menu items based on file type
    const type = fileItem.dataset.type;
    const isFolder = type === 'folder' || type === 'bucket';

    menu.querySelectorAll('.context-item').forEach(item => {
        if (item.dataset.action === 'preview' && isFolder) {
            item.style.display = 'none';
        } else if (item.dataset.action === 'rename' && isFolder) {
            item.style.display = 'none';  // Hide rename for folders
        } else if (item.dataset.action === 'edit') {
            // Show edit option only for images
            const fileName = fileItem.dataset.name || '';
            const fileType = getFileType(fileName);
            item.style.display = fileType === 'image' ? '' : 'none';
        } else if (item.dataset.action === 'editText') {
            // Show edit text option only for text files
            const fileName = fileItem.dataset.name || '';
            const isTextFile = window.fileEditor && window.fileEditor.isTextFile(fileName);
            item.style.display = isTextFile ? '' : 'none';
        } else if (item.dataset.action === 'paste') {
            // Show paste option only if there are items in clipboard
            item.style.display = clipboard.items && clipboard.items.length > 0 ? '' : 'none';
        } else {
            item.style.display = '';
        }
    });
}

function hideContextMenu() {
    document.getElementById('contextMenu').classList.remove('show');
}

// Show context menu when clicking 3-dots button
function showItemMenu(event, button) {
    event.stopPropagation();
    event.preventDefault();

    const fileItem = button.closest('.file-item');
    if (!fileItem) return;

    contextTarget = fileItem;

    const menu = document.getElementById('contextMenu');
    const rect = button.getBoundingClientRect();

    // Position menu next to the button
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.classList.add('show');

    // Update menu items based on file type
    const type = fileItem.dataset.type;
    const isFolder = type === 'folder' || type === 'bucket';

    menu.querySelectorAll('.context-item').forEach(item => {
        if (item.dataset.action === 'preview' && isFolder) {
            item.style.display = 'none';
        } else if (item.dataset.action === 'rename' && isFolder) {
            item.style.display = 'none';  // Hide rename for folders
        } else if (item.dataset.action === 'edit') {
            // Show edit option only for images
            const fileName = fileItem.dataset.name || '';
            const fileType = getFileType(fileName);
            item.style.display = fileType === 'image' ? '' : 'none';
        } else if (item.dataset.action === 'editText') {
            // Show edit text option only for text files
            const fileName = fileItem.dataset.name || '';
            const isTextFile = window.fileEditor && window.fileEditor.isTextFile(fileName);
            item.style.display = isTextFile ? '' : 'none';
        } else if (item.dataset.action === 'paste') {
            // Show paste option only if there are items in clipboard
            item.style.display = clipboard.items && clipboard.items.length > 0 ? '' : 'none';
        } else {
            item.style.display = '';
        }
    });
}

// Handle context menu actions
document.querySelectorAll('.context-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const action = item.dataset.action;
        handleContextAction(action);
        hideContextMenu();
    });
});

function handleContextAction(action) {
    if (!contextTarget) return;

    const key = contextTarget.dataset.key;
    const type = contextTarget.dataset.type;
    const name = contextTarget.dataset.name;

    switch(action) {
        case 'open':
            if (type === 'bucket') openBucket(name);
            else if (type === 'folder') openFolder(key);
            else previewFile(key);
            break;
        case 'download':
            if (type === 'folder') {
                downloadFolder(key);
            } else {
                downloadFile(key);
            }
            break;
        case 'preview':
            previewFile(key);
            break;
        case 'rename':
            // Disable rename for folders
            if (type === 'folder') {
                showNotification('Folder rename is not supported', 'info');
                return;
            }
            showRenameDialog(key, name, type);
            break;
        case 'copy':
            copyFile(key);
            break;
        case 'move':
            moveFile(key);
            break;
        case 'star':
            toggleStar(key);
            break;
        case 'share':
            shareFile(key);
            break;
        case 'versions':
            showVersions(key);
            break;
        case 'tags':
            showTags(key);
            break;
        case 'metadata':
            showMetadata(key);
            break;
        case 'details':
            showFileDetails(key);
            break;
        case 'delete':
            deleteItem(key, type);
            break;
        case 'paste':
            pasteFiles();
            break;
        case 'editText':
            editTextFile(key, name);
            break;
    }
}

// Edit text file
async function editTextFile(key, fileName) {
    try {
        // Check if file editor is available
        if (!window.fileEditor) {
            showError('File editor not available');
            return;
        }

        // Check if it's a text file
        if (!window.fileEditor.isTextFile(fileName)) {
            showError('This file type cannot be edited as text');
            return;
        }

        // Open the file in the editor
        await window.fileEditor.openFile(key, fileName);

    } catch (error) {
        console.error('Error editing text file:', error);
        showError('Failed to open text file editor');
    }
}

async function downloadFile(key) {
    try {
        const response = await s3Fetch(`/${currentBucket}/${key}`);

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = key.split('/').pop();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
    } catch (error) {
        console.error('Error downloading file:', error);
        showNotification('Failed to download file', 'error');
    }
}

// Download entire folder as ZIP
async function downloadFolder(folderKey) {
    if (!window.JSZip) {
        showNotification('ZIP library not loaded. Please refresh the page.', 'error');
        return;
    }

    showLoading('Preparing folder download...');

    try {
        const zip = new JSZip();

        // List all files in the folder
        const allFiles = await listAllFilesInFolder(folderKey);

        if (allFiles.length === 0) {
            hideLoading();
            showNotification('Folder is empty', 'info');
            return;
        }

        // Download each file and add to ZIP
        let downloadedCount = 0;
        const totalFiles = allFiles.length;

        for (const file of allFiles) {
            try {
                // Update loading message
                downloadedCount++;
                showLoading(`Downloading files... (${downloadedCount}/${totalFiles})`);

                // Download file
                const response = await s3Fetch(`/${currentBucket}/${file.key}`);
                if (response.ok) {
                    const blob = await response.blob();

                    // Get relative path within folder
                    const relativePath = file.key.substring(folderKey.length);
                    const cleanPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;

                    // Add file to ZIP
                    zip.file(cleanPath, blob);
                }
            } catch (error) {
                console.error(`Error downloading file ${file.key}:`, error);
            }
        }

        showLoading('Creating ZIP file...');

        // Generate ZIP file
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });

        // Download ZIP
        const url = window.URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;

        // Generate ZIP filename
        const folderName = folderKey.split('/').filter(s => s).pop() || 'folder';
        a.download = `${folderName}.zip`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        hideLoading();
        showNotification(`Downloaded ${downloadedCount} files as ZIP`, 'success');

    } catch (error) {
        console.error('Error downloading folder:', error);
        hideLoading();
        showNotification('Failed to download folder', 'error');
    }
}

// Helper function to list all files in a folder recursively
async function listAllFilesInFolder(folderKey) {
    const allFiles = [];
    let continuationToken = null;
    const prefix = folderKey.endsWith('/') ? folderKey : `${folderKey}/`;

    do {
        try {
            let url = `/${currentBucket}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`;

            if (continuationToken) {
                url += `&continuation-token=${encodeURIComponent(continuationToken)}`;
            }

            const response = await s3Fetch(url);

            if (!response.ok) {
                console.error('Failed to list folder contents');
                break;
            }

            const text = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, 'text/xml');

            // Get all files from the response
            const contents = xmlDoc.getElementsByTagName('Contents');
            for (let i = 0; i < contents.length; i++) {
                const key = contents[i].getElementsByTagName('Key')[0]?.textContent;
                const size = contents[i].getElementsByTagName('Size')[0]?.textContent;

                // Filter out the folder itself and add only files
                if (key && key !== prefix && !key.endsWith('/')) {
                    allFiles.push({
                        key: key,
                        size: parseInt(size) || 0
                    });
                }
            }

            // Check if there's more data
            const isTruncated = xmlDoc.getElementsByTagName('IsTruncated')[0]?.textContent === 'true';
            if (isTruncated) {
                continuationToken = xmlDoc.getElementsByTagName('NextContinuationToken')[0]?.textContent;
            } else {
                continuationToken = null;
            }
        } catch (error) {
            console.error('Error listing files in folder:', error);
            break;
        }
    } while (continuationToken);

    return allFiles;
}

async function previewFile(key) {
    // Opening preview

    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewModalTitle');
    const loading = document.getElementById('previewLoading');
    const iframe = document.getElementById('previewIframe');
    const image = document.getElementById('previewImage');
    const textDiv = document.getElementById('previewText');
    const textContent = document.getElementById('previewTextContent');
    const errorDiv = document.getElementById('previewError');
    const errorMessage = document.getElementById('previewErrorMessage');
    const fileInfo = document.getElementById('previewFileInfo');

    if (!modal) {
        console.error('Preview modal not found!');
        alert('Preview modal not found. Please refresh the page.');
        return;
    }

    const fileName = key.split('/').pop();
    const ext = fileName.split('.').pop().toLowerCase();

    // Simple approach: just clear iframe and show modal immediately
    iframe.src = 'about:blank';

    // Reset all preview elements visibility
    loading.style.display = 'flex';
    iframe.style.display = 'none';
    image.style.display = 'none';
    textDiv.style.display = 'none';
    errorDiv.style.display = 'none';

    // Update title with new filename
    title.textContent = fileName;

    // Show the modal immediately with loading spinner
    showModal('previewModal');

    // Get file info
    const file = files.find(f => f.key === key);
    if (file) {
        const dateElement = document.createElement('span');
        dateElement.style.cursor = 'help';
        dateElement.title = file.lastModified ? new Date(file.lastModified).toLocaleString() : '';
        dateElement.textContent = formatDate(file.lastModified);

        fileInfo.innerHTML = '';
        fileInfo.appendChild(document.createTextNode(`${formatFileSize(file.size)} • `));
        fileInfo.appendChild(dateElement);
    }

    // Set up download and share buttons
    document.getElementById('previewDownloadBtn').onclick = async () => {
        // Generate a fresh presigned URL for download
        const downloadUrl = await generatePresignedUrl(key, 300); // 5 min expiry for download
        window.open(downloadUrl, '_blank');
    };
    document.getElementById('previewDownloadBtnFooter').onclick = async () => {
        // Generate a fresh presigned URL for download
        const downloadUrl = await generatePresignedUrl(key, 300); // 5 min expiry for download
        window.open(downloadUrl, '_blank');
    };
    document.getElementById('previewShareBtn').onclick = () => shareFile(key);

    // Set up edit button for images and text files
    const editBtn = document.getElementById('previewEditBtn');
    const fileType = getFileType(fileName);
    const isTextFile = window.fileEditor && window.fileEditor.isTextFile(fileName);

    if (isTextFile) {
        editBtn.style.display = '';
        editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
        editBtn.onclick = () => {
            closeModal('previewModal');
            editTextFile(key, fileName);
        };
    } else {
        editBtn.style.display = 'none';
    }

    try {
        // Generating presigned URL for preview

        // Generate presigned URL for preview (1 hour expiry)
        const presignedUrl = await generatePresignedUrl(key, 3600);
        // Presigned URL generated

        loading.style.display = 'none';

        // Force iframe reload by removing and re-adding src attribute
        iframe.style.display = 'none';
        iframe.removeAttribute('src');
        iframe.removeAttribute('srcdoc');

        // Force a reflow
        void iframe.offsetHeight;

        // Now set the new source
        iframe.setAttribute('src', presignedUrl);
        iframe.style.display = 'block';

        // Store the presigned URL for potential cleanup or reuse
        iframe.dataset.presignedUrl = presignedUrl;

        // Add error handling for iframe load
        iframe.onerror = function() {
            console.error('Failed to load iframe content');
            iframe.style.display = 'none';
            errorDiv.style.display = 'flex';
            errorMessage.textContent = 'Failed to load preview. The file may be too large or the format is not supported.';
        };

        iframe.onload = function() {
            // Iframe loaded successfully
        };

        // For specific file types, we can still provide enhanced display
        if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
            // Images will be displayed by browser in iframe
            // Image file will be displayed in iframe
        } else if (['pdf'].includes(ext)) {
            // PDFs will use browser's built-in PDF viewer
            // PDF will be displayed using browser PDF viewer
        } else if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'log', 'csv', 'yml', 'yaml'].includes(ext)) {
            // Text files will be displayed as plain text in iframe
            // Text file will be displayed in iframe
        } else if (['mp4', 'webm', 'ogg', 'mp3', 'wav'].includes(ext)) {
            // Media files will use browser's built-in players
            // Media file will be played in iframe
        }

    } catch (error) {
        console.error('Error generating preview URL:', error);
        loading.style.display = 'none';
        errorDiv.style.display = 'flex';
        errorMessage.textContent = 'Failed to generate preview URL';
    }
}

// Generate public share URL that works through port 20000
async function generatePublicShareUrl(key, expiresIn = 3600) {
    // Use port 20000 which is the direct S3 service port
    const s3DirectUrl = window.S3_CONFIG.endpoint.replace(':443', ':20000').replace('https://', 'http://');

    // Generate presigned URL for the direct S3 endpoint
    const baseUrl = s3DirectUrl;

    // Properly encode the key for URL
    const encodedKey = key.split('/').map(part => encodeURIComponent(part)).join('/');
    const bucketPath = window.S3_CONFIG.forcePathStyle ? `/${currentBucket}` : '';
    const resourcePath = `${bucketPath}/${encodedKey}`;
    const fullUrl = `${baseUrl}${resourcePath}`;

    // Create signature for presigned URL
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substr(0, 8);
    const region = window.S3_CONFIG.region || 'us-east-1';
    const service = 's3';
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    // Query parameters must be sorted alphabetically for signature
    const queryParams = {
        'X-Amz-Algorithm': algorithm,
        'X-Amz-Credential': `${window.S3_CONFIG.accessKey}/${credentialScope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': expiresIn.toString(),
        'X-Amz-SignedHeaders': 'host'
    };

    // Sort query parameters alphabetically
    const sortedParams = Object.keys(queryParams)
        .sort()
        .map(key => `${key}=${encodeURIComponent(queryParams[key])}`)
        .join('&');

    // Generate signature
    const url = new URL(fullUrl);

    // For port 20000, don't include port in host header (it's non-standard)
    const hostHeader = url.hostname;

    // Encode each segment of the path for canonical request
    const pathSegments = [`${currentBucket}`, ...key.split('/')];
    const canonicalUri = '/' + pathSegments.map(segment => encodeURIComponent(segment)).join('/');

    const canonicalRequest = [
        'GET',
        canonicalUri,
        sortedParams,
        `host:${hostHeader}\n`,
        'host',
        'UNSIGNED-PAYLOAD'
    ].join('\n');

    const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        await hash(canonicalRequest)
    ].join('\n');

    const signingKey = await getSignatureKey(window.S3_CONFIG.secretKey, dateStamp, region, service);
    const signature = await hmacHex(signingKey, stringToSign);

    // Add signature to the sorted parameters
    const finalParams = `${sortedParams}&X-Amz-Signature=${signature}`;

    const presignedUrl = `${fullUrl}?${finalParams}`;
    // Generated public share URL
    return presignedUrl;
}

// Generate presigned URL
async function generatePresignedUrl(key, expiresIn = 3600) {
    // Generate presigned URL with AWS Signature V4
    // Now that IronBucket supports presigned URLs, we generate them directly
    const baseUrl = window.S3_CONFIG.endpoint;

    // Properly encode the key for URL
    const encodedKey = key.split('/').map(part => encodeURIComponent(part)).join('/');
    const bucketPath = window.S3_CONFIG.forcePathStyle ? `/${currentBucket}` : '';
    const resourcePath = `${bucketPath}/${encodedKey}`;
    const fullUrl = `${baseUrl}${resourcePath}`;

    // Create signature for presigned URL
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substr(0, 8);
    const region = window.S3_CONFIG.region || 'us-east-1';
    const service = 's3';
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    // Query parameters must be sorted alphabetically for signature
    const queryParams = {
        'X-Amz-Algorithm': algorithm,
        'X-Amz-Credential': `${window.S3_CONFIG.accessKey}/${credentialScope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': expiresIn.toString(),
        'X-Amz-SignedHeaders': 'host'
    };

    // Sort query parameters alphabetically
    const sortedParams = Object.keys(queryParams)
        .sort()
        .map(key => `${key}=${encodeURIComponent(queryParams[key])}`)
        .join('&');

    // Generate signature
    const url = new URL(fullUrl);

    // For S3 presigned URLs, use hostname without port for standard ports
    // The host header in the signature should match what the S3 service expects
    const hostHeader = url.hostname;

    // Encode each segment of the path for canonical request
    const pathSegments = [`${currentBucket}`, ...key.split('/')];
    const canonicalUri = '/' + pathSegments.map(segment => encodeURIComponent(segment)).join('/');

    const canonicalRequest = [
        'GET',
        canonicalUri,
        sortedParams,
        `host:${hostHeader}\n`,
        'host',
        'UNSIGNED-PAYLOAD'
    ].join('\n');

    const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        await hash(canonicalRequest)
    ].join('\n');

    const signingKey = await getSignatureKey(window.S3_CONFIG.secretKey, dateStamp, region, service);
    const signature = await hmacHex(signingKey, stringToSign);

    // Add signature to the sorted parameters
    const finalParams = `${sortedParams}&X-Amz-Signature=${signature}`;

    const presignedUrl = `${fullUrl}?${finalParams}`;
    // Generated presigned URL
    // Canonical Request prepared
    // String to Sign prepared
    return presignedUrl;
}

// Helper functions for signature
async function hash(string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function hmac(key, string) {
    const encoder = new TextEncoder();
    const keyData = typeof key === 'string' ? encoder.encode(key) : key;
    const data = encoder.encode(string);
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    return await crypto.subtle.sign('HMAC', cryptoKey, data);
}

async function hmacHex(key, string) {
    const sig = await hmac(key, string);
    return Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function getSignatureKey(secretKey, dateStamp, region, service) {
    const kDate = await hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    const kSigning = await hmac(kService, 'aws4_request');
    return kSigning;
}

function closePreview() {
    document.getElementById('previewPanel').classList.remove('show');
    document.querySelector('.files-container').style.paddingRight = '';
}

function updatePreviewDetails(key) {
    const file = files.find(f => f.key === key);
    if (!file) return;

    const details = document.getElementById('previewDetails');
    details.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">Type</span>
            <span class="detail-value">${getFileTypeDisplay(file.name)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Size</span>
            <span class="detail-value">${formatFileSize(file.size)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Modified</span>
            <span class="detail-value" style="cursor: help;" title="${file.lastModified ? new Date(file.lastModified).toLocaleString() : ''}">${formatDate(file.lastModified)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Path</span>
            <span class="detail-value" style="word-break: break-all;">${key}</span>
        </div>
    `;

    // Update action buttons
    document.getElementById('downloadPreviewBtn').onclick = () => downloadFile(key);
    document.getElementById('sharePreviewBtn').onclick = () => shareFile(key);
}

// Rename dialog
function showRenameDialog(key, currentName, type) {
    renameTarget = { key, currentName, type };
    const modal = document.getElementById('renameModal');
    const input = document.getElementById('renameInput');

    input.value = currentName;
    showModal('renameModal');

    setTimeout(() => {
        input.select();
    }, 100);
}

async function confirmRename() {
    if (!renameTarget) return;

    const newName = document.getElementById('renameInput').value.trim();
    if (!newName || newName === renameTarget.currentName) {
        closeModal('renameModal');
        return;
    }

    // Only support file rename, not folders
    if (renameTarget.type === 'folder') {
        showNotification('Folder rename is not supported', 'info');
        closeModal('renameModal');
        return;
    }

    try {
        const oldPath = renameTarget.key;
        const isFolder = false; // Force to false since we no longer support folder rename

        if (isFolder) {
            // For folders, we need to rename all objects with this prefix
            showNotification('Renaming folder...', 'info');

            // List all objects with the folder prefix
            // Add trailing slash if not present
            const prefix = oldPath.endsWith('/') ? oldPath : oldPath + '/';
            const response = await s3Fetch(`/${currentBucket}?prefix=${encodeURIComponent(prefix)}`);

            if (!response.ok) {
                throw new Error('Failed to list folder contents');
            }

            const text = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, 'text/xml');
            const contents = xmlDoc.getElementsByTagName('Contents');

            // Build new folder path
            const pathParts = oldPath.split('/').filter(p => p);
            pathParts[pathParts.length - 1] = newName;
            const newPrefix = pathParts.join('/') + '/';

            // Create the new folder marker first
            await s3Fetch(`/${currentBucket}/${newPrefix}`, {
                method: 'PUT',
                headers: {
                    'Content-Length': '0'
                }
            });

            // Copy all files to new location
            let successCount = 0;
            for (let i = 0; i < contents.length; i++) {
                const keyNode = contents[i].getElementsByTagName('Key')[0];
                if (keyNode) {
                    const oldKey = keyNode.textContent;
                    const newKey = oldKey.replace(prefix, newPrefix);

                    // Copy file to new location
                    const copyResponse = await s3Fetch(`/${currentBucket}/${newKey}`, {
                        method: 'PUT',
                        headers: {
                            'x-amz-copy-source': `/${currentBucket}/${oldKey}`
                        }
                    });

                    if (copyResponse.ok) {
                        // Delete old file
                        await s3Fetch(`/${currentBucket}/${oldKey}`, {
                            method: 'DELETE'
                        });
                        successCount++;
                    }
                }
            }

            // Also delete the folder marker itself if it exists
            // Try to delete the folder with trailing slash
            try {
                await s3Fetch(`/${currentBucket}/${prefix}`, {
                    method: 'DELETE'
                });
            } catch (e) {
                // Ignore if folder marker doesn't exist
            }

            // Also try without trailing slash (some S3 implementations)
            const folderWithoutSlash = prefix.slice(0, -1);
            if (folderWithoutSlash) {
                try {
                    await s3Fetch(`/${currentBucket}/${folderWithoutSlash}`, {
                        method: 'DELETE'
                    });
                } catch (e) {
                    // Ignore if folder marker doesn't exist
                }
            }

            closeModal('renameModal');
            refresh();
            showNotification(`Folder renamed successfully (${successCount} files moved)`, 'success');
        } else {
            // For files, use the simple rename
            const pathParts = oldPath.split('/');
            pathParts[pathParts.length - 1] = newName;
            const newPath = pathParts.join('/');

            // Use server-side copy for rename (now supported in IronBucket)
            showNotification('Renaming file...', 'info');

            console.log('Renaming file using server-side copy:', {
                from: oldPath,
                to: newPath,
                bucket: currentBucket
            });

            // Perform server-side copy
            const copyResponse = await s3Fetch(`/${currentBucket}/${newPath}`, {
                method: 'PUT',
                headers: {
                    'x-amz-copy-source': `/${currentBucket}/${oldPath}`
                }
            });

            if (copyResponse.ok) {
                console.log('File copied successfully using server-side copy');

                // Delete old file
                const deleteResponse = await s3Fetch(`/${currentBucket}/${oldPath}`, {
                    method: 'DELETE'
                });

                if (!deleteResponse.ok) {
                    console.warn('Failed to delete original file:', deleteResponse.status);
                    // Don't fail the whole operation if delete fails
                }

                closeModal('renameModal');
                refresh();
                showNotification('File renamed successfully', 'success');
            } else {
                // Log error details for debugging
                const errorText = await copyResponse.text();
                console.error(`Failed to rename file from ${oldPath} to ${newPath}:`, copyResponse.status);
                console.error('Error details:', errorText);
                throw new Error(`Failed to rename file (${copyResponse.status})`);
            }
        }
    } catch (error) {
        console.error('Error renaming:', error);
        showNotification('Failed to rename: ' + error.message, 'error');
    }
}

// Delete item
async function deleteItem(key, type) {
    const itemName = key.split('/').filter(p => p).pop();
    if (!confirm(`Are you sure you want to delete "${itemName}"?`)) {
        return;
    }

    try {
        if (type === 'bucket') {
            await s3Fetch(`/${key}`, {
                method: 'DELETE'
            });
            loadBuckets();
        } else if (type === 'folder') {
            await deleteFolder(key);
            refresh();
        } else {
            await s3Fetch(`/${currentBucket}/${key}`, {
                method: 'DELETE'
            });
            refresh();
        }

        showNotification('Item deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting item:', error);
        showNotification('Failed to delete item', 'error');
    }
}

async function deleteFolder(folderKey) {
    // Ensure folder key ends with /
    if (!folderKey.endsWith('/')) {
        folderKey += '/';
    }

    // List all objects in the folder (without delimiter to get all nested objects)
    const url = `/${currentBucket}?list-type=2&prefix=${encodeURIComponent(folderKey)}`;
    const response = await s3Fetch(url);
    const text = await response.text();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');

    const contents = xmlDoc.getElementsByTagName('Contents');

    // Delete all objects in the folder
    for (let i = 0; i < contents.length; i++) {
        const keyNode = contents[i].getElementsByTagName('Key')[0];
        if (keyNode) {
            const key = keyNode.textContent;
            await s3Fetch(`/${currentBucket}/${key}`, {
                method: 'DELETE'
            });
        }
    }

    // Finally, delete the folder itself (the directory marker)
    // In S3, folders are represented as zero-byte objects with keys ending in /
    await s3Fetch(`/${currentBucket}/${folderKey}`, {
        method: 'DELETE'
    });
}

// Create folder
async function createFolder() {
    const folderName = document.getElementById('folderNameInput').value.trim();

    if (!folderName) {
        alert('Please enter a folder name');
        return;
    }

    // In S3, folders are created by putting an empty object with a key ending in /
    // Some S3 implementations use a .keep file or just the folder key itself
    const folderKey = currentPath ? `${currentPath}/${folderName}/` : `${folderName}/`;

    try {
        // Try to create an empty object with the folder path
        // This creates a "folder" in S3-compatible storage
        const response = await s3Fetch(`/${currentBucket}/${folderKey}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': '0'
            },
            body: ''
        });

        if (response.ok) {
            closeModal('createFolderModal');
            document.getElementById('folderNameInput').value = '';
            refresh();
            showNotification('Folder created successfully', 'success');
        } else {
            console.error('Failed to create folder:', response.status, response.statusText);
            showNotification('Failed to create folder', 'error');
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        showNotification('Failed to create folder', 'error');
    }
}

// Drag and drop
function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    const container = document.getElementById('filesContainer');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        container.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        container.addEventListener(eventName, () => {
            dropZone.classList.add('active');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        container.addEventListener(eventName, () => {
            dropZone.classList.remove('active');
        }, false);
    });

    container.addEventListener('drop', handleDrop, false);
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    handleFiles(files);
}

function handleFolderSelect(e) {
    const files = e.target.files;
    handleFilesWithPaths(files);
}

function handleFiles(files) {
    if (!currentBucket) {
        alert('Please select a bucket first');
        return;
    }

    const uploadList = document.getElementById('uploadList');
    uploadList.innerHTML = '';

    // Store files for upload
    window.pendingUploads = Array.from(files);

    // Display files in upload list
    window.pendingUploads.forEach(file => {
        const item = createUploadItem(file);
        uploadList.appendChild(item);
    });

    showModal('uploadModal');
}

function handleFilesWithPaths(files) {
    if (!currentBucket) {
        alert('Please select a bucket first');
        return;
    }

    const uploadList = document.getElementById('uploadList');
    uploadList.innerHTML = '';

    // Store files for upload with their paths preserved
    window.pendingUploads = Array.from(files).map(file => {
        // For folder uploads, webkitRelativePath contains the full path
        if (file.webkitRelativePath) {
            // Create a new file object with the path as a property
            const fileWithPath = file;
            fileWithPath.uploadPath = currentPath + file.webkitRelativePath;
            return fileWithPath;
        }
        return file;
    });

    // Display files in upload list with paths
    window.pendingUploads.forEach(file => {
        const item = createUploadItem(file, file.uploadPath || file.name);
        uploadList.appendChild(item);
    });

    showModal('uploadModal');
}

// Start upload function
async function startUpload() {
    if (!window.pendingUploads || window.pendingUploads.length === 0) {
        alert('No files selected for upload');
        return;
    }

    // Add files to background upload queue instead of uploading directly
    addToUploadQueue(window.pendingUploads, currentPath);

    // Clear pending uploads
    window.pendingUploads = [];

    // Close the modal
    closeModal('uploadModal');

    // Show notification
    showNotification('Files added to upload queue', 'success');
}

function createUploadItem(file, displayPath) {
    const div = document.createElement('div');
    div.className = 'upload-item';
    const fileName = displayPath || file.name;
    div.innerHTML = `
        <i class="upload-item-icon fas fa-file"></i>
        <div class="upload-item-details">
            <div class="upload-item-name" title="${fileName}">${fileName}</div>
            <div class="upload-progress">
                <div class="upload-progress-bar" style="width: 0%"></div>
            </div>
            <div class="upload-item-size">${formatFileSize(file.size)}</div>
        </div>
        <div class="upload-item-status">
            <i class="fas fa-spinner fa-spin"></i>
        </div>
    `;
    return div;
}

// Get proper MIME type based on file extension
function getMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        // Video
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'ogg': 'video/ogg',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'mkv': 'video/x-matroska',
        'flv': 'video/x-flv',
        'wmv': 'video/x-ms-wmv',
        'm4v': 'video/x-m4v',
        '3gp': 'video/3gpp',

        // Audio
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'm4a': 'audio/m4a',
        'aac': 'audio/aac',
        'flac': 'audio/flac',

        // Images
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'svg': 'image/svg+xml',
        'webp': 'image/webp',
        'ico': 'image/x-icon',

        // Documents
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

        // Text
        'txt': 'text/plain',
        'html': 'text/html',
        'htm': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'json': 'application/json',
        'xml': 'application/xml',
        'csv': 'text/csv',
        'md': 'text/markdown',

        // Archives
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        'tar': 'application/x-tar',
        'gz': 'application/gzip',

        // Other
        'bin': 'application/octet-stream',
        'exe': 'application/x-msdownload',
        'dmg': 'application/x-apple-diskimage',
        'iso': 'application/x-iso9660-image'
    };

    return mimeTypes[ext] || 'application/octet-stream';
}

async function uploadFile(file, itemElement) {
    // Use uploadPath if it exists (for folder uploads), otherwise use regular path
    const key = file.uploadPath || (currentPath ? `${currentPath}/${file.name}` : file.name);
    const progressBar = itemElement.querySelector('.upload-progress-bar');
    const statusIcon = itemElement.querySelector('.upload-item-status');

    // Use multipart upload for files larger than 5MB
    const MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5MB

    try {
        if (file.size > MULTIPART_THRESHOLD) {
            await multipartUpload(file, key, itemElement);
            // Add to recent files
            addToRecentFiles({
                key: key,
                name: file.name,
                size: file.size,
                lastModified: new Date().toISOString()
            });
        } else {
            // Regular upload for small files
            const contentType = file.type || getMimeType(file.name);
            console.log(`Uploading ${file.name} with Content-Type: ${contentType}`);

            // For media files, set Content-Disposition to inline to prevent download
            const isMediaFile = ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'mov', 'avi'].some(ext =>
                file.name.toLowerCase().endsWith('.' + ext)
            );

            const headers = {
                'Content-Type': contentType,
                'x-amz-meta-content-type': contentType,
                'Cache-Control': 'max-age=31536000'
            };

            if (isMediaFile) {
                headers['Content-Disposition'] = 'inline';
                headers['x-amz-meta-original-content-type'] = contentType;
            }

            const response = await s3Fetch(`/${currentBucket}/${key}`, {
                method: 'PUT',
                body: file,
                headers: headers
            });

            if (response.ok) {
                progressBar.style.width = '100%';
                statusIcon.innerHTML = '<i class="fas fa-check" style="color: var(--success-color)"></i>';

                // Add to recent files
                addToRecentFiles({
                    key: key,
                    name: file.name,
                    size: file.size,
                    lastModified: new Date().toISOString()
                });
            } else {
                throw new Error('Upload failed');
            }
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        statusIcon.innerHTML = '<i class="fas fa-times" style="color: var(--danger-color)"></i>';
    }
}

// Get resumable upload state from localStorage
function getResumableUploadState(fileKey) {
    const uploads = JSON.parse(localStorage.getItem('resumableUploads') || '{}');
    return uploads[fileKey];
}

// Save resumable upload state to localStorage
function saveResumableUploadState(fileKey, state) {
    const uploads = JSON.parse(localStorage.getItem('resumableUploads') || '{}');
    uploads[fileKey] = state;
    localStorage.setItem('resumableUploads', JSON.stringify(uploads));
}

// Remove resumable upload state from localStorage
function removeResumableUploadState(fileKey) {
    const uploads = JSON.parse(localStorage.getItem('resumableUploads') || '{}');
    delete uploads[fileKey];
    localStorage.setItem('resumableUploads', JSON.stringify(uploads));
}

// Check for resumable uploads on page load
function checkResumableUploads() {
    const uploads = JSON.parse(localStorage.getItem('resumableUploads') || '{}');
    const pendingUploads = Object.keys(uploads);

    if (pendingUploads.length > 0) {
        const message = `You have ${pendingUploads.length} incomplete upload(s). Would you like to resume?`;
        if (confirm(message)) {
            resumeAllUploads();
        } else {
            // Clear if user doesn't want to resume
            localStorage.removeItem('resumableUploads');
        }
    }
}

// Resume all pending uploads
async function resumeAllUploads() {
    const uploads = JSON.parse(localStorage.getItem('resumableUploads') || '{}');

    for (const [fileKey, uploadState] of Object.entries(uploads)) {
        try {
            // Create a dummy file object for resuming
            const file = {
                name: uploadState.fileName,
                size: uploadState.fileSize,
                type: uploadState.contentType
            };

            // Note: We can't resume the actual file content from localStorage
            // This would need the user to re-select the file
            showNotification(`To resume upload of ${file.name}, please re-select the file`, 'info');
        } catch (error) {
            console.error(`Error resuming upload for ${fileKey}:`, error);
        }
    }
}

// Multipart upload for large files with resume capability
async function multipartUpload(file, key, itemElement) {
    const progressBar = itemElement.querySelector('.upload-progress-bar');
    const statusIcon = itemElement.querySelector('.upload-item-status');
    const nameElement = itemElement.querySelector('.upload-item-name');

    // Create unique key for this upload
    const uploadKey = `${currentBucket}/${key}/${file.size}/${file.lastModified}`;

    // Chunk size: 5MB (minimum size for multipart upload except last part)
    const CHUNK_SIZE = 5 * 1024 * 1024;
    const numParts = Math.ceil(file.size / CHUNK_SIZE);

    // Check for existing upload state
    let uploadState = getResumableUploadState(uploadKey);
    let uploadId = uploadState?.uploadId;
    let parts = uploadState?.parts || [];
    let startPart = uploadState ? uploadState.lastCompletedPart + 1 : 1;

    try {
        const contentType = file.type || getMimeType(file.name);

        // For media files, set Content-Disposition to inline
        const isMediaFile = ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'mov', 'avi'].some(ext =>
            file.name.toLowerCase().endsWith('.' + ext)
        );

        // Step 1: Initiate multipart upload (if not resuming)
        if (!uploadId) {
            nameElement.textContent = `${file.name} (Initializing multipart upload...)`;
            console.log(`Initiating multipart upload for ${file.name} with Content-Type: ${contentType}`);

            const headers = {
                'Content-Type': contentType,
                'x-amz-meta-content-type': contentType,
                'Cache-Control': 'max-age=31536000'
            };

            if (isMediaFile) {
                headers['Content-Disposition'] = 'inline';
                headers['x-amz-meta-original-content-type'] = contentType;
            }

            const initiateResponse = await s3Fetch(`/${currentBucket}/${key}?uploads`, {
                method: 'POST',
                headers: headers
            });

            if (!initiateResponse.ok) {
                throw new Error('Failed to initiate multipart upload');
            }

            const initiateText = await initiateResponse.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(initiateText, 'text/xml');
            uploadId = xmlDoc.getElementsByTagName('UploadId')[0]?.textContent;

            if (!uploadId) {
                throw new Error('No upload ID received');
            }

            // Save initial upload state
            saveResumableUploadState(uploadKey, {
                uploadId: uploadId,
                fileName: file.name,
                fileSize: file.size,
                contentType: contentType,
                key: key,
                bucket: currentBucket,
                parts: [],
                lastCompletedPart: 0,
                totalParts: numParts,
                timestamp: new Date().toISOString()
            });
        } else {
            nameElement.textContent = `${file.name} (Resuming upload from part ${startPart}/${numParts}...)`;
            console.log(`Resuming upload for ${file.name} from part ${startPart}`);
        }

        // Step 2: Upload parts
        let uploadedBytes = (startPart - 1) * CHUNK_SIZE; // Account for already uploaded parts

        for (let partNumber = startPart; partNumber <= numParts; partNumber++) {
            const start = (partNumber - 1) * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            nameElement.textContent = `${file.name} (Part ${partNumber}/${numParts})`;

            const partResponse = await s3Fetch(`/${currentBucket}/${key}?partNumber=${partNumber}&uploadId=${uploadId}`, {
                method: 'PUT',
                body: chunk
                // Note: Individual parts don't need Content-Type header
                // The Content-Type is set during initiation and applies to the final object
            });

            if (!partResponse.ok) {
                // Save state before throwing error
                const currentState = getResumableUploadState(uploadKey) || {};
                currentState.lastCompletedPart = partNumber - 1;
                currentState.parts = parts;
                saveResumableUploadState(uploadKey, currentState);
                throw new Error(`Failed to upload part ${partNumber}`);
            }

            const etag = partResponse.headers.get('ETag');
            parts.push({
                ETag: etag,
                PartNumber: partNumber
            });

            uploadedBytes += (end - start);
            const percentComplete = Math.round((uploadedBytes / file.size) * 100);
            progressBar.style.width = `${percentComplete}%`;

            // Save progress after each successful part
            const currentState = getResumableUploadState(uploadKey) || {};
            currentState.lastCompletedPart = partNumber;
            currentState.parts = parts;
            saveResumableUploadState(uploadKey, currentState);
        }

        // Step 3: Complete multipart upload
        nameElement.textContent = `${file.name} (Completing upload...)`;
        const completeXml = createCompleteMultipartXml(parts);

        // Important: Set the object's Content-Type during completion
        // The 'Content-Type' header here is for the XML request body
        // We need to pass the object's content type separately
        const completeHeaders = {
            'Content-Type': 'application/xml',
            'x-amz-meta-content-type': contentType
        };

        // Add the actual content type for the stored object if supported by the S3 implementation
        if (isMediaFile) {
            completeHeaders['x-amz-meta-original-content-type'] = contentType;
        }

        const completeResponse = await s3Fetch(`/${currentBucket}/${key}?uploadId=${uploadId}`, {
            method: 'POST',
            body: completeXml,
            headers: completeHeaders
        });

        if (completeResponse.ok) {
            progressBar.style.width = '100%';
            statusIcon.innerHTML = '<i class="fas fa-check" style="color: var(--success-color)"></i>';
            nameElement.textContent = file.name;

            // Remove upload state on successful completion
            removeResumableUploadState(uploadKey);
        } else {
            throw new Error('Failed to complete multipart upload');
        }

    } catch (error) {
        console.error('Multipart upload error:', error);
        progressBar.style.width = '100%';
        progressBar.style.backgroundColor = 'var(--danger-color)';
        statusIcon.innerHTML = '<i class="fas fa-times" style="color: var(--danger-color)"></i>';
        nameElement.textContent = `${file.name} (Failed)`;
        throw error;
    }
}

function createCompleteMultipartXml(parts) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>';
    xml += '<CompleteMultipartUpload>';

    parts.forEach(part => {
        xml += '<Part>';
        xml += `<ETag>${part.ETag}</ETag>`;
        xml += `<PartNumber>${part.PartNumber}</PartNumber>`;
        xml += '</Part>';
    });

    xml += '</CompleteMultipartUpload>';
    return xml;
}

// Storage info
async function updateStorageInfo() {
    // This would need a real API endpoint to get storage usage
    // For now, just show a placeholder
    // Storage indicator removed
}

// Recent files
function addToRecentFiles(file) {
    recentFiles = recentFiles.filter(f => f.key !== file.key);
    recentFiles.unshift(file);
    recentFiles = recentFiles.slice(0, 20); // Keep only 20 recent files
    localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
}

function showRecentFiles() {
    displayItems(recentFiles);
}

// Starred files
function toggleStar(key) {
    if (starredFiles.has(key)) {
        starredFiles.delete(key);
    } else {
        starredFiles.add(key);
    }
    localStorage.setItem('starredFiles', JSON.stringify(Array.from(starredFiles)));

    // Update UI
    document.querySelectorAll(`.file-item[data-key="${key}"] .fa-star`).forEach(star => {
        star.classList.toggle('starred');
    });
}

function showStarredFiles() {
    const starred = files.filter(f => starredFiles.has(f.key));
    displayItems(starred);
}


// Share file
// Global variables for share modal
let currentShareKey = null;
let selectedExpirationMinutes = 5;

function shareFile(key) {
    currentShareKey = key;
    selectedExpirationMinutes = 5; // Reset to default

    // Set filename in modal
    const fileName = key.split('/').pop();
    document.getElementById('shareFileName').textContent = fileName;

    // Reset modal state
    document.getElementById('shareGenerateSection').style.display = 'block';
    document.getElementById('shareLinkSection').style.display = 'none';
    document.getElementById('generateLinkBtn').disabled = false;
    document.getElementById('generateLinkBtn').innerHTML = '<i class="fas fa-link"></i> Generate Link';

    // Reset expiration selection
    document.querySelectorAll('.expiration-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.minutes === '5') {
            btn.classList.add('active');
        }
    });

    showModal('shareModal');
}

function selectExpiration(button) {
    // Remove active class from all buttons
    document.querySelectorAll('.expiration-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Add active class to selected button
    button.classList.add('active');
    selectedExpirationMinutes = parseInt(button.dataset.minutes);
}

async function generateShareLink() {
    if (!currentShareKey) return;

    const generateBtn = document.getElementById('generateLinkBtn');
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    try {
        // Convert minutes to seconds for expiration
        const expiresInSeconds = selectedExpirationMinutes * 60;

        // Generate a proper S3 presigned URL
        const presignedUrl = await generatePresignedUrl(currentShareKey, expiresInSeconds);

        // Display the generated link
        document.getElementById('shareLink').value = presignedUrl;
        document.getElementById('shareGenerateSection').style.display = 'none';
        document.getElementById('shareLinkSection').style.display = 'block';

        // Calculate and display expiry time
        const expiryDate = new Date(Date.now() + (selectedExpirationMinutes * 60 * 1000));
        const expiryText = selectedExpirationMinutes < 60
            ? `Link expires in ${selectedExpirationMinutes} minutes`
            : `Link expires in ${selectedExpirationMinutes / 60} hour${selectedExpirationMinutes > 60 ? 's' : ''}`;
        document.getElementById('shareLinkExpiry').textContent =
            `${expiryText} (${expiryDate.toLocaleTimeString()})`;

        showNotification('Share link generated successfully', 'success');

    } catch (error) {
        console.error('Error generating share link:', error);
        showNotification('Failed to generate share link', 'error');
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-link"></i> Generate Link';
    }
}

function copyShareLink() {
    const linkInput = document.getElementById('shareLink');
    const copyBtn = document.getElementById('copyLinkBtn');

    // Select and copy the text
    linkInput.select();
    linkInput.setSelectionRange(0, 99999); // For mobile devices

    try {
        document.execCommand('copy');

        // Update button to show success
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        copyBtn.classList.add('btn-success');

        // Reset button after 2 seconds
        setTimeout(() => {
            copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            copyBtn.classList.remove('btn-success');
        }, 2000);

        showNotification('Link copied to clipboard', 'success');
    } catch (err) {
        // Fallback: use navigator.clipboard API if available
        if (navigator.clipboard) {
            navigator.clipboard.writeText(linkInput.value).then(() => {
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                }, 2000);
                showNotification('Link copied to clipboard', 'success');
            }).catch(() => {
                showNotification('Failed to copy link', 'error');
            });
        } else {
            showNotification('Copy not supported in your browser', 'error');
        }
    }
}

// Copy/Move files (placeholder)
function copyFile(key) {
    // Add single file or selected files to clipboard
    const itemsToCopy = [];

    if (selectedFiles.has(key)) {
        // Copy all selected files
        selectedFiles.forEach(selectedKey => {
            const file = files.find(f => f.key === selectedKey);
            if (file) {
                itemsToCopy.push({
                    key: file.key,
                    name: file.name,
                    type: file.type || 'file'
                });
            }
        });
    } else {
        // Copy single file
        const file = files.find(f => f.key === key);
        if (file) {
            itemsToCopy.push({
                key: file.key,
                name: file.name,
                type: file.type || 'file'
            });
        }
    }

    clipboard.items = itemsToCopy;
    clipboard.operation = 'copy';
    clipboard.sourceBucket = currentBucket;
    clipboard.sourcePath = currentPath;

    const count = itemsToCopy.length;
    const message = count === 1 ?
        `Copied "${itemsToCopy[0].name}" to clipboard` :
        `Copied ${count} items to clipboard`;
    showClipboardNotification(message);
}

function moveFile(key) {
    // Add single file or selected files to clipboard for cut operation
    const itemsToMove = [];

    if (selectedFiles.has(key)) {
        // Move all selected files
        selectedFiles.forEach(selectedKey => {
            const file = files.find(f => f.key === selectedKey);
            if (file) {
                itemsToMove.push({
                    key: file.key,
                    name: file.name,
                    type: file.type || 'file'
                });
            }
        });
    } else {
        // Move single file
        const file = files.find(f => f.key === key);
        if (file) {
            itemsToMove.push({
                key: file.key,
                name: file.name,
                type: file.type || 'file'
            });
        }
    }

    clipboard.items = itemsToMove;
    clipboard.operation = 'cut';
    clipboard.sourceBucket = currentBucket;
    clipboard.sourcePath = currentPath;

    const count = itemsToMove.length;
    const message = count === 1 ?
        `Cut "${itemsToMove[0].name}" to clipboard` :
        `Cut ${count} items to clipboard`;
    showClipboardNotification(message);
}

// Show file details
function showFileDetails(key) {
    const file = files.find(f => f.key === key);
    if (!file) return;

    alert(`
        Name: ${file.name}
        Size: ${formatFileSize(file.size)}
        Modified: ${formatDate(file.lastModified)}
        Type: ${getFileTypeDisplay(file.name)}
        Path: ${key}
    `);
}

// Search
function handleSearch(e) {
    const query = e.target.value.toLowerCase();

    if (!query) {
        // Reset to show filtered files and update pagination UI
        applyFilters();
        updatePaginationUI();
        return;
    }

    // Start with filter-applied files, then apply search
    let filteredFiles = originalFiles.length > 0 ? originalFiles : files;

    // Apply filters first
    if (!activeFilters.has('all')) {
        filteredFiles = filteredFiles.filter(file => {
            if (file.type === 'folder') {
                return activeFilters.has('folder');
            }
            const fileType = getFileType(file.name);
            return activeFilters.has(fileType);
        });
    }

    // Then apply search
    const searchFiltered = filteredFiles.filter(file =>
        file.name.toLowerCase().includes(query)
    );

    // Apply sorting before displaying
    const sortedSearchResults = sortFiles(searchFiltered, currentSortBy, currentSortOrder);
    displayItems(sortedSearchResults);

    // Hide pagination controls during search as we only search loaded items
    const paginationContainer = document.getElementById('paginationContainer');
    if (query) {
        paginationContainer.style.display = 'none';
    } else {
        updatePaginationUI();
    }
}

// Refresh
function refresh() {
    // Clear search input if present
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }

    // Reset original files array
    originalFiles = [];

    if (currentBucket) {
        loadFiles();
    } else {
        loadBuckets();
    }
}

// Keyboard shortcuts
function handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + A: Select all
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.add('selected');
            selectedFiles.add(item.dataset.key);
        });
        updateBulkActionBar();
    }

    // Ctrl/Cmd + C: Copy selected files
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey) {
        e.preventDefault();
        if (selectedFiles.size > 0) {
            // Copy the first selected file (or all if multiple)
            const firstSelected = Array.from(selectedFiles)[0];
            copyFile(firstSelected);
        }
    }

    // Ctrl/Cmd + X: Cut selected files
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        e.preventDefault();
        if (selectedFiles.size > 0) {
            // Cut the first selected file (or all if multiple)
            const firstSelected = Array.from(selectedFiles)[0];
            moveFile(firstSelected);
        }
    }

    // Ctrl/Cmd + V: Paste files
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        pasteFiles();
    }

    // Delete key: Delete selected
    if (e.key === 'Delete' && selectedFiles.size > 0) {
        deleteSelected();
    }

    // Escape: Clear selection
    if (e.key === 'Escape') {
        clearSelection();
        document.querySelectorAll('.file-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        selectedFiles.clear();
        closePreview();
    }
}

// Handle window resize
function handleResize() {
    // Adjust layout if needed
}

// Utility functions
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    // For negative differences (future dates), show the actual date/time
    if (diff < 0) {
        return date.toLocaleString();
    }

    // Less than 1 minute
    if (diff < 60000) {
        return 'Just now';
    }

    // Less than 1 hour - show minutes
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    }

    // Less than 24 hours - show hours and minutes
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        if (minutes > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} min ago`;
        }
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }

    // Less than 7 days
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }

    // Default to showing full date and time
    return date.toLocaleString();
}

function formatFileInfo(item) {
    if (item.type === 'folder' || item.type === 'bucket') {
        return item.type === 'bucket' ? 'Bucket' : 'Folder';
    }
    return formatFileSize(item.size);
}

function getFileType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();

    // Image files
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'ico'].includes(ext)) {
        return 'image';
    }

    // Video files
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp', 'm4v'].includes(ext)) {
        return 'video';
    }

    // Audio files
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a'].includes(ext)) {
        return 'audio';
    }

    // Document files
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp'].includes(ext)) {
        return 'document';
    }

    // Archive files
    if (['zip', 'rar', 'tar', 'gz', '7z', 'bz2', 'xz'].includes(ext)) {
        return 'archive';
    }

    // Code files
    if (['js', 'css', 'html', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'ts', 'jsx', 'tsx', 'vue', 'md', 'yml', 'yaml'].includes(ext)) {
        return 'code';
    }

    return 'other';
}

// Get file type for display purposes (legacy function for existing code)
function getFileTypeDisplay(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const types = {
        jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', svg: 'Image',
        pdf: 'PDF Document', doc: 'Word Document', docx: 'Word Document',
        xls: 'Excel Spreadsheet', xlsx: 'Excel Spreadsheet',
        ppt: 'PowerPoint', pptx: 'PowerPoint',
        txt: 'Text File', md: 'Markdown',
        mp4: 'Video', avi: 'Video', mov: 'Video',
        mp3: 'Audio', wav: 'Audio',
        zip: 'Archive', rar: 'Archive', tar: 'Archive',
        js: 'JavaScript', css: 'CSS', html: 'HTML',
        json: 'JSON', xml: 'XML'
    };
    return types[ext] || 'File';
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Modal functions
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('show');

    // Clean up when closing preview modal
    if (modalId === 'previewModal') {
        const iframe = document.getElementById('previewIframe');
        const image = document.getElementById('previewImage');

        // Clear iframe source to stop loading
        iframe.src = 'about:blank';
        iframe.style.display = 'none';

        // Clear any stored URLs
        if (iframe.dataset.presignedUrl) {
            delete iframe.dataset.presignedUrl;
        }
        if (iframe.dataset.blobUrl) {
            URL.revokeObjectURL(iframe.dataset.blobUrl);
            delete iframe.dataset.blobUrl;
        }

        // Clear image source
        if (image.src && image.src.startsWith('blob:')) {
            URL.revokeObjectURL(image.src);
        }
        image.src = '';
        image.style.display = 'none';
    }
}

// Notifications
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;

    // Add styles
    notification.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--danger-color)' : 'var(--primary-color)'};
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        box-shadow: var(--shadow-md);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 3000;
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Show loading overlay
function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const messageElement = document.getElementById('loadingMessage');

    if (overlay) {
        messageElement.textContent = message;
        overlay.style.display = 'flex';
    }
}

// Hide loading overlay
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Show clipboard notification
function showClipboardNotification(message) {
    const clipboardNotification = document.getElementById('clipboardNotification');
    const clipboardText = document.getElementById('clipboardText');

    clipboardText.textContent = message;
    clipboardNotification.classList.add('show');

    // Hide after 3 seconds
    setTimeout(() => {
        clipboardNotification.classList.remove('show');
    }, 3000);
}

// Paste files from clipboard
async function pasteFiles() {
    if (!clipboard.items || clipboard.items.length === 0) {
        showNotification('Clipboard is empty', 'info');
        return;
    }

    if (!currentBucket) {
        showNotification('Please select a bucket first', 'error');
        return;
    }

    const targetPath = currentPath;
    const targetBucket = currentBucket;

    // Check if source and target are the same for move operation
    if (clipboard.operation === 'cut' &&
        clipboard.sourceBucket === targetBucket &&
        clipboard.sourcePath === targetPath) {
        showNotification('Cannot move files to the same location', 'error');
        return;
    }

    showLoading('Processing paste operation...');

    let successCount = 0;
    let errorCount = 0;

    for (const item of clipboard.items) {
        try {
            // Check if this is a folder
            if (item.type === 'folder') {
                // For folders, we need to copy all files within the folder
                showLoading(`Copying folder ${item.name}...`);

                const folderKey = item.key.endsWith('/') ? item.key : `${item.key}/`;
                const allFilesInFolder = await listAllFilesInFolder(folderKey);

                if (allFilesInFolder.length === 0) {
                    // Empty folder - just create the folder marker
                    const targetFolderKey = targetPath ? `${targetPath}/${item.name}/` : `${item.name}/`;

                    // Create empty folder by putting an object with trailing slash
                    const createFolderResponse = await s3Fetch(`/${targetBucket}/${targetFolderKey}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/x-directory'
                        },
                        body: ''
                    });

                    if (createFolderResponse.ok) {
                        successCount++;
                    }
                } else {
                    // Copy all files in the folder
                    for (const file of allFilesInFolder) {
                        const sourceFileKey = file.key;
                        // Get relative path from the folder
                        const relativePath = sourceFileKey.substring(folderKey.length);
                        const targetFileKey = targetPath ?
                            `${targetPath}/${item.name}/${relativePath}` :
                            `${item.name}/${relativePath}`;

                        // Copy individual file
                        const copySource = `${clipboard.sourceBucket}/${encodeURIComponent(sourceFileKey)}`;
                        const copyHeaders = {
                            'x-amz-copy-source': copySource,
                            'x-amz-metadata-directive': 'COPY'
                        };

                        const copyResponse = await s3Fetch(`/${targetBucket}/${targetFileKey}`, {
                            method: 'PUT',
                            headers: copyHeaders
                        });

                        if (copyResponse.ok) {
                            // If move operation, delete the source file
                            if (clipboard.operation === 'cut') {
                                await s3Fetch(`/${clipboard.sourceBucket}/${sourceFileKey}`, {
                                    method: 'DELETE'
                                });
                            }
                        }
                    }
                    successCount++;
                }

                // If move operation, delete the folder marker
                if (clipboard.operation === 'cut') {
                    await s3Fetch(`/${clipboard.sourceBucket}/${folderKey}`, {
                        method: 'DELETE'
                    });
                }
            } else {
                // Regular file copy
                const sourceKey = item.key;
                const fileName = item.name;

                // Calculate target key
                let targetKey = targetPath ? `${targetPath}/${fileName}` : fileName;

                // For copy operation, check if file exists and add suffix
                if (clipboard.operation === 'copy') {
                    let counter = 1;
                    let testKey = targetKey;

                    while (files.some(f => f.key === testKey)) {
                        const nameParts = fileName.split('.');
                        const extension = nameParts.length > 1 ? `.${nameParts.pop()}` : '';
                        const baseName = nameParts.join('.');
                        const newName = `${baseName} (${counter})${extension}`;
                        testKey = targetPath ? `${targetPath}/${newName}` : newName;
                        counter++;
                    }
                    targetKey = testKey;
                }

                // Perform server-side copy using S3 COPY operation
                const copySource = `${clipboard.sourceBucket}/${encodeURIComponent(sourceKey)}`;
                const copyHeaders = {
                    'x-amz-copy-source': copySource,
                    'x-amz-metadata-directive': 'COPY'
                };

                const copyResponse = await s3Fetch(`/${targetBucket}/${targetKey}`, {
                    method: 'PUT',
                    headers: copyHeaders
                });

                if (!copyResponse.ok) {
                    const errorText = await copyResponse.text();
                    console.error('Copy error:', errorText);
                    throw new Error(`Failed to copy ${fileName}`);
                }

                // If it's a move operation, delete the source file
                if (clipboard.operation === 'cut') {
                    const deleteResponse = await s3Fetch(`/${clipboard.sourceBucket}/${sourceKey}`, {
                        method: 'DELETE'
                    });

                    if (!deleteResponse.ok) {
                        console.warn(`Failed to delete source file ${sourceKey} after copy`);
                    }
                }

                successCount++;
            }
        } catch (error) {
            console.error(`Error ${clipboard.operation === 'copy' ? 'copying' : 'moving'} ${item.name}:`, error);
            errorCount++;
        }
    }

    hideLoading();

    // Show result notification
    if (successCount > 0 && errorCount === 0) {
        const action = clipboard.operation === 'copy' ? 'copied' : 'moved';
        const message = successCount === 1 ?
            `Successfully ${action} 1 file` :
            `Successfully ${action} ${successCount} files`;
        showNotification(message, 'success');

        // Clear clipboard after successful move operation
        if (clipboard.operation === 'cut') {
            clipboard.items = [];
            clipboard.operation = null;
        }

        // Refresh the file list
        loadFiles();
    } else if (errorCount > 0 && successCount === 0) {
        showNotification(`Failed to ${clipboard.operation} files`, 'error');
    } else {
        showNotification(`${clipboard.operation === 'copy' ? 'Copied' : 'Moved'} ${successCount} files, ${errorCount} failed`, 'warning');
    }
}

// Settings (placeholder)
function showSettings() {
    alert('Settings panel coming soon');
}

// File Versioning
async function showVersions(key) {
    const modal = document.getElementById('versionsModal');
    const fileName = document.getElementById('versionFileName');
    const fileInfo = document.getElementById('versionFileInfo');
    const loading = document.getElementById('versionsLoading');
    const versionsList = document.getElementById('versionsList');
    const noVersions = document.getElementById('noVersions');
    const tableBody = document.getElementById('versionsTableBody');

    // Get file info
    const file = files.find(f => f.key === key);
    fileName.textContent = file ? file.name : key.split('/').pop();
    fileInfo.textContent = `Path: ${key}`;

    // Show modal with loading
    showModal('versionsModal');
    loading.style.display = 'block';
    versionsList.style.display = 'none';
    noVersions.style.display = 'none';

    try {
        // Check if bucket has versioning enabled first
        const versioningResponse = await s3Fetch(`/${currentBucket}?versioning`);
        if (!versioningResponse.ok) {
            throw new Error('Failed to check versioning status');
        }

        const versioningText = await versioningResponse.text();
        const versioningParser = new DOMParser();
        const versioningDoc = versioningParser.parseFromString(versioningText, 'text/xml');

        const status = versioningDoc.querySelector('Status');
        const isVersioningEnabled = status && status.textContent === 'Enabled';

        if (!isVersioningEnabled) {
            loading.style.display = 'none';
            noVersions.style.display = 'block';
            noVersions.innerHTML = '<i class="fas fa-info-circle"></i> Versioning is not enabled for this bucket. Enable versioning when creating a bucket to track file versions.';
            return;
        }

        // Try to fetch object versions - IronBucket may not fully support this
        const response = await s3Fetch(`/${currentBucket}/${key}?versions`);

        if (!response.ok) {
            throw new Error('Failed to fetch versions');
        }

        const text = await response.text();

        // Check if response is XML (versions list) or plain text (file content)
        if (!text.startsWith('<?xml')) {
            // IronBucket doesn't fully support per-object version listing
            loading.style.display = 'none';
            noVersions.style.display = 'block';
            noVersions.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Version history is not available. The S3 server may not fully support object versioning.';
            return;
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        const versions = xmlDoc.getElementsByTagName('Version');

        if (versions.length === 0) {
            loading.style.display = 'none';
            noVersions.style.display = 'block';
            return;
        }

        // Clear previous versions
        tableBody.innerHTML = '';

        // Process each version
        for (let i = 0; i < versions.length; i++) {
            const version = versions[i];
            const versionId = version.getElementsByTagName('VersionId')[0]?.textContent || 'null';
            const isLatest = version.getElementsByTagName('IsLatest')[0]?.textContent === 'true';
            const lastModified = version.getElementsByTagName('LastModified')[0]?.textContent;
            const size = version.getElementsByTagName('Size')[0]?.textContent;

            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid var(--border-color)';

            // Format the full datetime for tooltip
            const fullDateTime = lastModified ? new Date(lastModified).toLocaleString() : '';

            row.innerHTML = `
                <td style="padding: 12px; font-family: monospace; font-size: 12px;">${versionId.substring(0, 8)}...</td>
                <td style="padding: 12px; cursor: help;" title="${fullDateTime}">${formatDate(lastModified)}</td>
                <td style="padding: 12px;">${formatFileSize(parseInt(size))}</td>
                <td style="padding: 12px;">
                    ${isLatest ? '<span style="color: var(--success-color);"><i class="fas fa-check"></i> Yes</span>' : 'No'}
                </td>
                <td style="padding: 12px;">
                    <button class="btn-sm" onclick="downloadVersion('${key}', '${versionId}')" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    ${!isLatest ? `
                        <button class="btn-sm" onclick="restoreVersion('${key}', '${versionId}')" title="Restore">
                            <i class="fas fa-undo"></i>
                        </button>
                        <button class="btn-sm btn-danger" onclick="deleteVersion('${key}', '${versionId}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </td>
            `;
            tableBody.appendChild(row);
        }

        loading.style.display = 'none';
        versionsList.style.display = 'block';

    } catch (error) {
        console.error('Error fetching versions:', error);
        loading.style.display = 'none';
        noVersions.style.display = 'block';
    }
}

// Download specific version
async function downloadVersion(key, versionId) {
    try {
        const response = await s3Fetch(`/${currentBucket}/${key}?versionId=${versionId}`);

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${key.split('/').pop()}_v${versionId.substring(0, 8)}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
    } catch (error) {
        console.error('Error downloading version:', error);
        showNotification('Failed to download version', 'error');
    }
}

// Restore a specific version
async function restoreVersion(key, versionId) {
    if (!confirm('Are you sure you want to restore this version? This will make it the current version.')) {
        return;
    }

    try {
        // Copy the version to make it the latest
        const copyHeaders = {
            'x-amz-copy-source': `${currentBucket}/${key}?versionId=${versionId}`,
            'x-amz-metadata-directive': 'COPY'
        };

        const response = await s3Fetch(`/${currentBucket}/${key}`, {
            method: 'PUT',
            headers: copyHeaders
        });

        if (response.ok) {
            showNotification('Version restored successfully', 'success');
            closeModal('versionsModal');
            loadFiles();
        } else {
            throw new Error('Failed to restore version');
        }
    } catch (error) {
        console.error('Error restoring version:', error);
        showNotification('Failed to restore version', 'error');
    }
}

// Delete a specific version
async function deleteVersion(key, versionId) {
    if (!confirm('Are you sure you want to permanently delete this version?')) {
        return;
    }

    try {
        const response = await s3Fetch(`/${currentBucket}/${key}?versionId=${versionId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showNotification('Version deleted successfully', 'success');
            showVersions(key); // Refresh the versions list
        } else {
            throw new Error('Failed to delete version');
        }
    } catch (error) {
        console.error('Error deleting version:', error);
        showNotification('Failed to delete version', 'error');
    }
}

// File Tagging
let currentFileTags = [];
let currentFileKey = '';

async function showTags(key) {
    currentFileKey = key;
    currentFileTags = [];

    const modal = document.getElementById('tagsModal');
    const fileName = document.getElementById('tagsFileName');
    const loading = document.getElementById('tagsLoading');
    const tagsList = document.getElementById('tagsList');

    // Get file info
    const file = files.find(f => f.key === key);
    fileName.textContent = file ? file.name : key.split('/').pop();

    // Show modal with loading
    showModal('tagsModal');
    loading.style.display = 'block';
    tagsList.style.display = 'none';

    try {
        // Fetch object tags
        const response = await s3Fetch(`/${currentBucket}/${key}?tagging`);

        if (response.ok) {
            const text = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, 'text/xml');

            const tagSets = xmlDoc.getElementsByTagName('Tag');
            currentFileTags = [];

            for (let i = 0; i < tagSets.length; i++) {
                const tag = tagSets[i];
                const tagKey = tag.getElementsByTagName('Key')[0]?.textContent;
                const tagValue = tag.getElementsByTagName('Value')[0]?.textContent;

                if (tagKey) {
                    currentFileTags.push({ key: tagKey, value: tagValue || '' });
                }
            }
        }

        displayTags();
        loading.style.display = 'none';
        tagsList.style.display = 'block';

    } catch (error) {
        console.error('Error fetching tags:', error);
        loading.style.display = 'none';
        tagsList.style.display = 'block';
        displayTags();
    }
}

function displayTags() {
    const existingTags = document.getElementById('existingTags');
    existingTags.innerHTML = '<h4>Existing Tags</h4>';

    if (currentFileTags.length === 0) {
        existingTags.innerHTML += '<p style="color: var(--text-secondary);">No tags defined</p>';
        return;
    }

    const tagsContainer = document.createElement('div');
    currentFileTags.forEach((tag, index) => {
        const tagRow = document.createElement('div');
        tagRow.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
        tagRow.innerHTML = `
            <input type="text" value="${tag.key}"
                   style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;"
                   onchange="updateTag(${index}, 'key', this.value)">
            <input type="text" value="${tag.value}"
                   style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;"
                   onchange="updateTag(${index}, 'value', this.value)">
            <button class="btn-danger btn-sm" onclick="removeTag(${index})">
                <i class="fas fa-times"></i>
            </button>
        `;
        tagsContainer.appendChild(tagRow);
    });
    existingTags.appendChild(tagsContainer);
}

function updateTag(index, field, value) {
    if (currentFileTags[index]) {
        currentFileTags[index][field] = value;
    }
}

function removeTag(index) {
    currentFileTags.splice(index, 1);
    displayTags();
}

function addTag() {
    const keyInput = document.getElementById('newTagKey');
    const valueInput = document.getElementById('newTagValue');

    if (!keyInput.value.trim()) {
        showNotification('Tag key is required', 'error');
        return;
    }

    currentFileTags.push({
        key: keyInput.value.trim(),
        value: valueInput.value.trim()
    });

    keyInput.value = '';
    valueInput.value = '';
    displayTags();
}

async function saveTags() {
    showLoading('Saving tags...');

    try {
        // Build XML for tags
        let xml = '<?xml version="1.0" encoding="UTF-8"?>';
        xml += '<Tagging><TagSet>';

        currentFileTags.forEach(tag => {
            xml += '<Tag>';
            xml += `<Key>${tag.key}</Key>`;
            xml += `<Value>${tag.value}</Value>`;
            xml += '</Tag>';
        });

        xml += '</TagSet></Tagging>';

        const response = await s3Fetch(`/${currentBucket}/${currentFileKey}?tagging`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/xml'
            },
            body: xml
        });

        hideLoading();

        if (response.ok) {
            showNotification('Tags saved successfully', 'success');
            closeModal('tagsModal');
        } else {
            throw new Error('Failed to save tags');
        }
    } catch (error) {
        hideLoading();
        console.error('Error saving tags:', error);
        showNotification('Failed to save tags', 'error');
    }
}

// File Metadata
let currentFileMetadata = {
    system: {},
    custom: {}
};

async function showMetadata(key) {
    currentFileKey = key;
    currentFileMetadata = { system: {}, custom: {} };

    const modal = document.getElementById('metadataModal');
    const fileName = document.getElementById('metadataFileName');
    const loading = document.getElementById('metadataLoading');
    const content = document.getElementById('metadataContent');

    // Get file info
    const file = files.find(f => f.key === key);
    fileName.textContent = file ? file.name : key.split('/').pop();

    // Show modal with loading
    showModal('metadataModal');
    loading.style.display = 'block';
    content.style.display = 'none';

    try {
        // Fetch object metadata using HEAD request
        const response = await s3Fetch(`/${currentBucket}/${key}`, {
            method: 'HEAD'
        });

        if (response.ok) {
            // Process headers
            for (const [key, value] of response.headers.entries()) {
                if (key.startsWith('x-amz-meta-')) {
                    // Custom metadata
                    const metaKey = key.substring('x-amz-meta-'.length);
                    currentFileMetadata.custom[metaKey] = value;
                } else if (key.startsWith('x-amz-') ||
                          ['content-type', 'content-length', 'last-modified', 'etag', 'cache-control'].includes(key.toLowerCase())) {
                    // System metadata
                    currentFileMetadata.system[key] = value;
                }
            }
        }

        displayMetadata();
        loading.style.display = 'none';
        content.style.display = 'block';

    } catch (error) {
        console.error('Error fetching metadata:', error);
        loading.style.display = 'none';
        content.style.display = 'block';
        displayMetadata();
    }
}

function displayMetadata() {
    // Display system metadata
    const systemBody = document.getElementById('systemMetadataBody');
    systemBody.innerHTML = '';

    Object.entries(currentFileMetadata.system).forEach(([key, value]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="padding: 8px; border-bottom: 1px solid var(--border-color); font-weight: 500;">${key}</td>
            <td style="padding: 8px; border-bottom: 1px solid var(--border-color);">${value}</td>
        `;
        systemBody.appendChild(row);
    });

    // Display custom metadata
    const customList = document.getElementById('customMetadataList');
    customList.innerHTML = '';

    if (Object.keys(currentFileMetadata.custom).length === 0) {
        customList.innerHTML = '<p style="color: var(--text-secondary);">No custom metadata defined</p>';
    } else {
        Object.entries(currentFileMetadata.custom).forEach(([key, value]) => {
            const metaRow = document.createElement('div');
            metaRow.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
            metaRow.innerHTML = `
                <input type="text" value="x-amz-meta-${key}" disabled
                       style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-tertiary);">
                <input type="text" value="${value}"
                       style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;"
                       onchange="updateMetadata('${key}', this.value)">
                <button class="btn-danger btn-sm" onclick="removeMetadata('${key}')">
                    <i class="fas fa-times"></i>
                </button>
            `;
            customList.appendChild(metaRow);
        });
    }
}

function updateMetadata(key, value) {
    currentFileMetadata.custom[key] = value;
}

function removeMetadata(key) {
    delete currentFileMetadata.custom[key];
    displayMetadata();
}

function addMetadata() {
    const keyInput = document.getElementById('newMetaKey');
    const valueInput = document.getElementById('newMetaValue');

    if (!keyInput.value.trim()) {
        showNotification('Metadata key is required', 'error');
        return;
    }

    // Ensure the key starts with x-amz-meta- or is just the suffix
    let metaKey = keyInput.value.trim();
    if (metaKey.startsWith('x-amz-meta-')) {
        metaKey = metaKey.substring('x-amz-meta-'.length);
    }

    currentFileMetadata.custom[metaKey] = valueInput.value.trim();

    keyInput.value = '';
    valueInput.value = '';
    displayMetadata();
}

async function saveMetadata() {
    showLoading('Saving metadata...');

    try {
        // To update metadata, we need to copy the object to itself with new metadata
        // Encode the source key properly for the copy operation
        const encodedKey = encodeURIComponent(currentFileKey);
        const copyHeaders = {
            'x-amz-copy-source': `${currentBucket}/${encodedKey}`,
            'x-amz-metadata-directive': 'REPLACE'
        };

        // Add all custom metadata
        Object.entries(currentFileMetadata.custom).forEach(([key, value]) => {
            copyHeaders[`x-amz-meta-${key}`] = value;
        });

        // Preserve content-type if it exists
        if (currentFileMetadata.system['content-type']) {
            copyHeaders['Content-Type'] = currentFileMetadata.system['content-type'];
        }

        // If there's a cache-control header, preserve it
        if (currentFileMetadata.system['cache-control']) {
            copyHeaders['Cache-Control'] = currentFileMetadata.system['cache-control'];
        }

        const response = await s3Fetch(`/${currentBucket}/${currentFileKey}`, {
            method: 'PUT',
            headers: copyHeaders
        });

        hideLoading();

        if (response.ok) {
            showNotification('Metadata saved successfully', 'success');
            closeModal('metadataModal');
            // Refresh metadata to show the updated values
            showMetadata(currentFileKey);
        } else {
            const errorText = await response.text();
            console.error('Metadata save error:', errorText);
            throw new Error('Failed to save metadata');
        }
    } catch (error) {
        hideLoading();
        console.error('Error saving metadata:', error);
        showNotification('Failed to save metadata', 'error');
    }
}

function showStorageInfo() {
    alert('Storage details coming soon');
}

// Bulk Operations
async function deleteSelected() {
    const count = selectedFiles.size;
    if (count === 0) return;

    const message = count === 1
        ? 'Are you sure you want to delete this item?'
        : `Are you sure you want to delete ${count} items?`;

    if (!confirm(message)) return;

    const deletePromises = [];
    for (const key of selectedFiles) {
        deletePromises.push(deleteFile(key));
    }

    try {
        await Promise.all(deletePromises);
        showNotification(`${count} item(s) deleted successfully`, 'success');
        clearSelection();
        loadFiles(); // Reload the file list
    } catch (error) {
        showNotification(`Failed to delete some items: ${error.message}`, 'error');
    }
}

async function downloadSelected() {
    if (selectedFiles.size === 0) return;

    // Download files one by one
    for (const key of selectedFiles) {
        await downloadFile(key);
        // Add a small delay between downloads to avoid overwhelming the browser
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

function copySelected() {
    if (selectedFiles.size === 0) return;

    // Add all selected files to clipboard for copy operation
    const itemsToCopy = [];

    selectedFiles.forEach(selectedKey => {
        const file = files.find(f => f.key === selectedKey);
        if (file) {
            itemsToCopy.push({
                key: file.key,
                name: file.name,
                type: file.type || 'file'
            });
        }
    });

    clipboard.items = itemsToCopy;
    clipboard.operation = 'copy';
    clipboard.sourceBucket = currentBucket;
    clipboard.sourcePath = currentPath;

    const count = itemsToCopy.length;
    const message = count === 1 ?
        `Copied "${itemsToCopy[0].name}" to clipboard. Press Ctrl+V to paste.` :
        `Copied ${count} items to clipboard. Press Ctrl+V to paste.`;

    showClipboardNotification(message);
    clearSelection();
}

function moveSelected() {
    if (selectedFiles.size === 0) return;

    // Add all selected files to clipboard for cut operation
    const itemsToMove = [];

    selectedFiles.forEach(selectedKey => {
        const file = files.find(f => f.key === selectedKey);
        if (file) {
            itemsToMove.push({
                key: file.key,
                name: file.name,
                type: file.type || 'file'
            });
        }
    });

    clipboard.items = itemsToMove;
    clipboard.operation = 'cut';
    clipboard.sourceBucket = currentBucket;
    clipboard.sourcePath = currentPath;

    const count = itemsToMove.length;
    const message = count === 1 ?
        `Cut "${itemsToMove[0].name}" to clipboard. Press Ctrl+V to paste.` :
        `Cut ${count} items to clipboard. Press Ctrl+V to paste.`;

    showClipboardNotification(message);
    clearSelection();
}

// Helper function to delete a single file
async function deleteFile(key) {
    const response = await s3Fetch(`/${currentBucket}/${key}`, {
        method: 'DELETE'
    });

    if (!response.ok) {
        throw new Error(`Failed to delete ${key}`);
    }
}

// Update the existing deleteItem function to use deleteFile
async function deleteItem(key, type) {
    const itemName = key.split('/').pop();
    const confirmMessage = type === 'folder'
        ? `Delete folder "${itemName}" and all its contents?`
        : `Delete "${itemName}"?`;

    if (!confirm(confirmMessage)) return;

    try {
        if (type === 'folder') {
            // For folders, delete the folder marker
            await deleteFile(key + '/');
        } else {
            await deleteFile(key);
        }
        showNotification(`${itemName} deleted successfully`, 'success');
        loadFiles();
    } catch (error) {
        showNotification(`Failed to delete ${itemName}: ${error.message}`, 'error');
    }
}

// Pagination helper functions
function resetPagination() {
    paginationConfig.continuationToken = null;
    paginationConfig.hasNextPage = false;
    paginationConfig.totalLoaded = 0;
    paginationConfig.isLoading = false;
    paginationConfig.isTruncated = false;
    paginationConfig.isLoadingAll = false;
}

function updatePaginationUI() {
    const paginationContainer = document.getElementById('paginationContainer');
    const fileCountDisplay = document.getElementById('fileCountDisplay');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const loadAllBtn = document.getElementById('loadAllBtn');

    // Check if elements exist
    if (!paginationContainer) return;

    // Hide pagination if no items or if all items are loaded and there's no next page
    if (paginationConfig.totalLoaded === 0 || (!paginationConfig.hasNextPage && paginationConfig.totalLoaded > 0)) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';

    // Update file count display
    let countText = `Showing ${paginationConfig.totalLoaded} item${paginationConfig.totalLoaded !== 1 ? 's' : ''}`;
    if (paginationConfig.hasNextPage) {
        countText += ' (more available)';
    }
    fileCountDisplay.textContent = countText;

    // Update button visibility and states
    if (paginationConfig.hasNextPage && !paginationConfig.isLoadingAll) {
        loadMoreBtn.style.display = 'inline-block';
        loadAllBtn.style.display = 'inline-block';
    } else {
        loadMoreBtn.style.display = 'none';
        loadAllBtn.style.display = 'none';
    }
}

function updateLoadMoreButton() {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const loadAllBtn = document.getElementById('loadAllBtn');

    // Check if elements exist
    if (!loadMoreBtn || !loadAllBtn) return;

    if (paginationConfig.isLoading) {
        loadMoreBtn.disabled = true;
        loadAllBtn.disabled = true;
        if (paginationConfig.isLoadingAll) {
            loadAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading All...';
        } else {
            loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        }
    } else {
        loadMoreBtn.disabled = false;
        loadAllBtn.disabled = false;
        loadMoreBtn.innerHTML = '<i class="fas fa-plus"></i> Load More';
        loadAllBtn.innerHTML = '<i class="fas fa-download"></i> Load All';
    }
}

async function loadMoreFiles() {
    if (!paginationConfig.hasNextPage || paginationConfig.isLoading) {
        return;
    }
    await loadFiles(true);
}

async function loadAllFiles() {
    if (!paginationConfig.hasNextPage || paginationConfig.isLoading) {
        return;
    }

    paginationConfig.isLoadingAll = true;
    updateLoadMoreButton();

    try {
        // Keep loading until no more pages
        while (paginationConfig.hasNextPage) {
            await loadFiles(true);
            // Small delay to prevent overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (error) {
        console.error('Error loading all files:', error);
        showNotification('Failed to load all files', 'error');
    } finally {
        paginationConfig.isLoadingAll = false;
        updateLoadMoreButton();
        updatePaginationUI();
    }
}

// Optional: Add infinite scroll support
function initializeInfiniteScroll() {
    const filesContainer = document.getElementById('filesContainer');
    let scrollTimeout;

    filesContainer.addEventListener('scroll', () => {
        // Debounce scroll events
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const { scrollTop, scrollHeight, clientHeight } = filesContainer;

            // Check if user scrolled near bottom (within 200px)
            if (scrollHeight - scrollTop - clientHeight < 200) {
                // Only load more if we have next page and not currently loading
                if (paginationConfig.hasNextPage && !paginationConfig.isLoading && !document.getElementById('searchInput').value) {
                    loadMoreFiles();
                }
            }
        }, 150);
    });
}

// Dark mode functionality
function initializeTheme() {
    // Check for saved theme preference or default to light
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggle(savedTheme);

    // Add click listener to theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeToggle(newTheme);
}

function updateThemeToggle(theme) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (theme === 'dark') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
            themeToggle.title = 'Switch to light mode';
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
            themeToggle.title = 'Switch to dark mode';
        }
    }
}

// File Type Filter Functions
function initializeFilters() {
    const filterToggle = document.getElementById('filterBtn');
    const filterCheckboxes = document.querySelectorAll('.filter-option input[type="checkbox"]');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    if (filterToggle) {
        filterToggle.addEventListener('click', toggleFilterMenu);
    }

    // Set up filter checkbox event listeners
    filterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleFilterChange);
    });

    // Clear filters button
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearAllFilters);
    }

    // Close filter menu when clicking outside
    document.addEventListener('click', (e) => {
        const filterMenu = document.getElementById('filterMenu');
        const filterToggle = document.getElementById('filterBtn');

        if (filterMenu && !filterMenu.contains(e.target) && !filterToggle.contains(e.target)) {
            filterMenu.style.display = 'none';
        }
    });

    // Initialize filter state
    updateFilterUI();
}

function toggleFilterMenu() {
    const filterMenu = document.getElementById('filterMenu');
    if (filterMenu) {
        filterMenu.style.display = filterMenu.style.display === 'none' ? 'block' : 'none';
    }
}

function handleFilterChange(e) {
    const checkbox = e.target;
    const filterType = checkbox.value;

    if (filterType === 'all') {
        // If "All Files" is checked, uncheck all others and add 'all' to activeFilters
        if (checkbox.checked) {
            activeFilters.clear();
            activeFilters.add('all');

            // Uncheck all other checkboxes
            document.querySelectorAll('.filter-option input[type=\"checkbox\"]').forEach(cb => {
                if (cb.value !== 'all') {
                    cb.checked = false;
                }
            });
        } else {
            // If "All Files" is unchecked, don't allow it (at least one filter must be active)
            checkbox.checked = true;
            return;
        }
    } else {
        // If any specific filter is checked, remove 'all' and uncheck "All Files"
        if (checkbox.checked) {
            activeFilters.delete('all');
            activeFilters.add(filterType);

            // Uncheck "All Files" checkbox
            const allCheckbox = document.querySelector('.filter-option input[value="all"]');
            if (allCheckbox) {
                allCheckbox.checked = false;
            }
        } else {
            activeFilters.delete(filterType);

            // If no specific filters are active, activate "All Files"
            if (activeFilters.size === 0) {
                activeFilters.add('all');
                const allCheckbox = document.querySelector('.filter-option input[value="all"]');
                if (allCheckbox) {
                    allCheckbox.checked = true;
                }
            }
        }
    }

    updateFilterUI();
    applyFilters();
}

function applyFilters() {
    // Store original files if not already stored
    if (originalFiles.length === 0 && files.length > 0) {
        originalFiles = [...files];
    }

    let filesToDisplay;

    // If "All Files" is active, show all files
    if (activeFilters.has('all')) {
        filesToDisplay = files;
    } else {
        // Filter files based on active filters
        filesToDisplay = files.filter(file => {
            if (file.type === 'folder') {
                return activeFilters.has('folder');
            }

            const fileType = getFileType(file.name);
            return activeFilters.has(fileType);
        });
    }

    // Apply sorting before displaying
    const sortedFiles = sortFiles(filesToDisplay, currentSortBy, currentSortOrder);

    displayItems(sortedFiles);
}

function updateFilterUI() {
    updateFilterBadge();

    // Update checkbox states to match activeFilters
    document.querySelectorAll('.filter-option input[type=\"checkbox\"]').forEach(checkbox => {
        const filterType = checkbox.value;
        checkbox.checked = activeFilters.has(filterType);
    });
}

function updateFilterBadge() {
    const filterBadge = document.getElementById('filterBadge');
    if (!filterBadge) return;

    const activeCount = activeFilters.has('all') ? 0 : activeFilters.size;

    if (activeCount > 0) {
        filterBadge.textContent = activeCount;
        filterBadge.style.display = 'flex';
    } else {
        filterBadge.style.display = 'none';
    }
}

function clearAllFilters() {
    // Reset to show all files
    activeFilters.clear();
    activeFilters.add('all');

    // Update UI
    updateFilterUI();
    applyFilters();

    // Close filter menu
    const filterMenu = document.getElementById('filterMenu');
    if (filterMenu) {
        filterMenu.style.display = 'none';
    }
}

// Sorting Functions
let currentSortBy = 'name';
let currentSortOrder = 'asc';

function initializeSorting() {
    // Sort button click handler
    const sortBtn = document.getElementById('sortBtn');
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            const sortMenu = document.getElementById('sortMenu');
            if (sortMenu) {
                const isVisible = sortMenu.style.display === 'block';
                sortMenu.style.display = isVisible ? 'none' : 'block';
            }
        });
    }

    // Sort option change handlers
    document.querySelectorAll('input[name="sortBy"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                const [sortBy, sortOrder] = e.target.value.split('-');
                currentSortBy = sortBy;
                currentSortOrder = sortOrder || 'asc';

                // Save preference and apply sorting
                saveSortPreference(currentPath, e.target.value);
                applySorting();

                // Close sort menu
                const sortMenu = document.getElementById('sortMenu');
                if (sortMenu) {
                    sortMenu.style.display = 'none';
                }
            }
        });
    });

    // Load saved preferences for current path
    loadSortPreference(currentPath);

    // Close sort menu when clicking outside
    document.addEventListener('click', (e) => {
        const sortMenu = document.getElementById('sortMenu');
        const sortToggle = document.getElementById('sortBtn');

        if (sortMenu && !sortMenu.contains(e.target) && !sortToggle.contains(e.target)) {
            sortMenu.style.display = 'none';
        }
    });
}

function sortFiles(items, sortBy = currentSortBy, sortOrder = currentSortOrder) {
    if (!items || items.length === 0) return items;

    // Create a copy to avoid mutating the original array
    const sortedItems = [...items];

    // Separate folders and files for proper sorting (folders first)
    const folders = sortedItems.filter(item => item.type === 'folder');
    const files = sortedItems.filter(item => item.type !== 'folder');

    // Sort function based on sortBy parameter
    const getSortValue = (item) => {
        switch (sortBy) {
            case 'name':
                return item.name.toLowerCase();
            case 'size':
                return item.size || 0;
            case 'date':
                return new Date(item.lastModified || item.lastModifiedISO || 0).getTime();
            case 'type':
                if (item.type === 'folder') return 'folder';
                const ext = item.name.split('.').pop().toLowerCase();
                return ext || 'unknown';
            default:
                return item.name.toLowerCase();
        }
    };

    // Sort each group
    const sortGroup = (group) => {
        return group.sort((a, b) => {
            const aVal = getSortValue(a);
            const bVal = getSortValue(b);

            let comparison = 0;
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                comparison = aVal.localeCompare(bVal);
            } else if (typeof aVal === 'number' && typeof bVal === 'number') {
                comparison = aVal - bVal;
            } else {
                comparison = String(aVal).localeCompare(String(bVal));
            }

            return sortOrder === 'desc' ? -comparison : comparison;
        });
    };

    // Sort folders and files separately, then combine (folders first)
    const sortedFolders = sortGroup(folders);
    const sortedFiles = sortGroup(files);

    return [...sortedFolders, ...sortedFiles];
}

function saveSortPreference(path, sortValue) {
    try {
        const preferences = JSON.parse(localStorage.getItem('sortPreferences') || '{}');
        preferences[path || '/'] = sortValue;
        localStorage.setItem('sortPreferences', JSON.stringify(preferences));
    } catch (error) {
        console.warn('Failed to save sort preference:', error);
    }
}

function loadSortPreference(path) {
    try {
        const preferences = JSON.parse(localStorage.getItem('sortPreferences') || '{}');
        const savedSort = preferences[path || '/'] || 'name-asc';

        // Update current sort settings
        const [sortBy, sortOrder] = savedSort.split('-');
        currentSortBy = sortBy;
        currentSortOrder = sortOrder || 'asc';

        // Update UI to reflect loaded preference
        const radioToCheck = document.querySelector(`input[name="sortBy"][value="${savedSort}"]`);
        if (radioToCheck) {
            radioToCheck.checked = true;
        }

        return savedSort;
    } catch (error) {
        console.warn('Failed to load sort preference:', error);
        return 'name-asc';
    }
}

function applySorting() {
    // Apply sorting to current files
    if (files && files.length > 0) {
        const sortedFiles = sortFiles(files, currentSortBy, currentSortOrder);

        // If we have filtered results, also sort those
        if (originalFiles.length > 0) {
            // We're in a filtered state, need to re-apply filters with sorting
            applyFilters();
        } else {
            // Normal state, just display sorted files
            displayItems(sortedFiles);
        }
    }
}

// Advanced Search Functions
function applyAdvancedSearch() {
    const searchText = document.getElementById('advSearchText').value.trim();
    const searchType = document.getElementById('advSearchType').value;
    const minSize = parseFloat(document.getElementById('advSearchMinSize').value) || 0;
    const maxSize = parseFloat(document.getElementById('advSearchMaxSize').value) || Infinity;
    const fromDate = document.getElementById('advSearchFromDate').value;
    const toDate = document.getElementById('advSearchToDate').value;
    const useRegex = document.getElementById('advSearchRegex').checked;

    // Start with original files or current files
    let searchResults = originalFiles.length > 0 ? originalFiles : files;

    // Apply text search
    if (searchText) {
        if (useRegex) {
            try {
                const regex = new RegExp(searchText, 'i');
                searchResults = searchResults.filter(file => regex.test(file.name));
            } catch (e) {
                showNotification('Invalid regular expression', 'error');
                return;
            }
        } else {
            const query = searchText.toLowerCase();
            searchResults = searchResults.filter(file =>
                file.name.toLowerCase().includes(query)
            );
        }
    }

    // Apply type filter
    if (searchType) {
        searchResults = searchResults.filter(file => {
            if (searchType === 'folder') {
                return file.type === 'folder';
            }
            return getFileType(file.name) === searchType;
        });
    }

    // Apply size filter (convert MB to bytes)
    const minSizeBytes = minSize * 1024 * 1024;
    const maxSizeBytes = maxSize * 1024 * 1024;
    searchResults = searchResults.filter(file => {
        if (file.type === 'folder') return true;
        return file.size >= minSizeBytes && file.size <= maxSizeBytes;
    });

    // Apply date filter
    if (fromDate || toDate) {
        const fromTime = fromDate ? new Date(fromDate).getTime() : 0;
        const toTime = toDate ? new Date(toDate + 'T23:59:59').getTime() : Date.now();

        searchResults = searchResults.filter(file => {
            const fileTime = new Date(file.lastModified).getTime();
            return fileTime >= fromTime && fileTime <= toTime;
        });
    }

    // Apply sorting before displaying results
    const sortedSearchResults = sortFiles(searchResults, currentSortBy, currentSortOrder);
    displayItems(sortedSearchResults);

    // Update search input to show advanced search is active
    const searchInput = document.getElementById('searchInput');
    if (searchText) {
        searchInput.value = searchText;
    }

    // Close modal
    closeModal('advancedSearchModal');

    // Show notification
    showNotification(`Found ${searchResults.length} matching items`, 'success');
}

function clearAdvancedSearch() {
    // Clear all fields
    document.getElementById('advSearchText').value = '';
    document.getElementById('advSearchType').value = '';
    document.getElementById('advSearchMinSize').value = '';
    document.getElementById('advSearchMaxSize').value = '';
    document.getElementById('advSearchFromDate').value = '';
    document.getElementById('advSearchToDate').value = '';
    document.getElementById('advSearchRegex').checked = false;

    // Reset main search
    document.getElementById('searchInput').value = '';

    // Show all files with current sorting and filtering
    applyFilters();
}