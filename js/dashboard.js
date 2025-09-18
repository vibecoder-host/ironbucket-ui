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

    initializeUI();
    setupEventListeners();

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

    // File upload
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
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

    // Only show bulk action bar when 2 or more items are selected
    if (selectedFiles.size >= 2) {
        bulkActionBar.style.display = 'flex';
        selectedCount.textContent = selectedFiles.size;
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

    // Parse hash: bucket/path/to/folder
    const parts = hash.split('/');
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

    if (currentView === 'grid') {
        grid.classList.remove('list-view');
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
    } else {
        grid.classList.add('list-view');
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
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

// Load files
async function loadFiles() {
    const container = document.getElementById('filesGrid');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const prefix = currentPath ? currentPath + '/' : '';
        const url = `/${currentBucket}?list-type=2&delimiter=/&prefix=${encodeURIComponent(prefix)}`;
        const response = await s3Fetch(url);
        const text = await response.text();

        // Parse XML response
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        files = [];
        // Parsing S3 response, clearing files array

        // Get folders (CommonPrefixes)
        const prefixes = xmlDoc.getElementsByTagName('CommonPrefixes');
        for (let i = 0; i < prefixes.length; i++) {
            const prefixNode = prefixes[i].getElementsByTagName('Prefix')[0];
            if (prefixNode) {
                const fullPath = prefixNode.textContent;
                const name = fullPath.replace(prefix, '').replace(/\/$/, '');
                files.push({
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

                files.push({
                    name: name,
                    type: 'file',
                    size: sizeNode ? parseInt(sizeNode.textContent) : 0,
                    lastModified: modifiedNode ? modifiedNode.textContent : null,
                    key: key
                });
            }
        }

        // Loaded files/folders
        displayItems(files);
    } catch (error) {
        console.error('Error loading files:', error);
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Failed to load files</h3></div>';
    }
}

// Display items (buckets or files)
function displayItems(items) {
    const container = document.getElementById('filesGrid');

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
                    <span>${formatDate(item.lastModified || item.creationDate)}</span>
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
    currentPath = '';
    updateUrlHash();
    updateBreadcrumb();
    loadFiles();
}

// Open folder
function openFolder(folderKey) {
    currentPath = folderKey.replace(/\/$/, '');
    updateUrlHash();
    updateBreadcrumb();
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
        if (item.dataset.action === 'download' && isFolder) {
            item.style.display = 'none';
        } else if (item.dataset.action === 'preview' && isFolder) {
            item.style.display = 'none';
        } else if (item.dataset.action === 'rename' && isFolder) {
            item.style.display = 'none';  // Hide rename for folders
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
        if (item.dataset.action === 'download' && isFolder) {
            item.style.display = 'none';
        } else if (item.dataset.action === 'preview' && isFolder) {
            item.style.display = 'none';
        } else if (item.dataset.action === 'rename' && isFolder) {
            item.style.display = 'none';  // Hide rename for folders
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
            downloadFile(key);
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
        case 'details':
            showFileDetails(key);
            break;
        case 'delete':
            deleteItem(key, type);
            break;
    }
}

// File operations
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

    // Reset all preview elements
    loading.style.display = 'flex';
    iframe.style.display = 'none';
    image.style.display = 'none';
    textDiv.style.display = 'none';
    errorDiv.style.display = 'none';

    title.textContent = fileName;
    showModal('previewModal');

    // Get file info
    const file = files.find(f => f.key === key);
    if (file) {
        fileInfo.textContent = `${formatFileSize(file.size)} • ${formatDate(file.lastModified)}`;
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
            <span class="detail-value">${getFileType(file.name)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Size</span>
            <span class="detail-value">${formatFileSize(file.size)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Modified</span>
            <span class="detail-value">${formatDate(file.lastModified)}</span>
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

            // Copy to new location
            const copyResponse = await s3Fetch(`/${currentBucket}/${newPath}`, {
                method: 'PUT',
                headers: {
                    'x-amz-copy-source': `/${currentBucket}/${oldPath}`
                }
            });

            if (copyResponse.ok) {
                // Delete old file
                await s3Fetch(`/${currentBucket}/${oldPath}`, {
                    method: 'DELETE'
                });

                closeModal('renameModal');
                refresh();
                showNotification('File renamed successfully', 'success');
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

// Start upload function
function startUpload() {
    if (!window.pendingUploads || window.pendingUploads.length === 0) {
        alert('No files selected for upload');
        return;
    }

    const uploadItems = document.querySelectorAll('.upload-item');

    window.pendingUploads.forEach((file, index) => {
        uploadFile(file, uploadItems[index]);
    });

    // Disable the start upload button
    document.getElementById('startUploadBtn').disabled = true;
    document.getElementById('startUploadBtn').textContent = 'Uploading...';

    // Clear pending uploads
    setTimeout(() => {
        window.pendingUploads = [];
        document.getElementById('startUploadBtn').disabled = false;
        document.getElementById('startUploadBtn').textContent = 'Start Upload';

        // Auto close modal after uploads complete
        setTimeout(() => {
            closeModal('uploadModal');
            refresh();
        }, 2000);
    }, 3000);
}

function createUploadItem(file) {
    const div = document.createElement('div');
    div.className = 'upload-item';
    div.innerHTML = `
        <i class="upload-item-icon fas fa-file"></i>
        <div class="upload-item-details">
            <div class="upload-item-name">${file.name}</div>
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

async function uploadFile(file, itemElement) {
    const key = currentPath ? `${currentPath}/${file.name}` : file.name;
    const progressBar = itemElement.querySelector('.upload-progress-bar');
    const statusIcon = itemElement.querySelector('.upload-item-status');

    try {
        const response = await s3Fetch(`/${currentBucket}/${key}`, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type || 'application/octet-stream'
            }
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
    } catch (error) {
        console.error('Error uploading file:', error);
        statusIcon.innerHTML = '<i class="fas fa-times" style="color: var(--danger-color)"></i>';
    }
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
    showNotification('Copy feature coming soon', 'info');
}

function moveFile(key) {
    showNotification('Move feature coming soon', 'info');
}

// Show file details
function showFileDetails(key) {
    const file = files.find(f => f.key === key);
    if (!file) return;

    alert(`
        Name: ${file.name}
        Size: ${formatFileSize(file.size)}
        Modified: ${formatDate(file.lastModified)}
        Type: ${getFileType(file.name)}
        Path: ${key}
    `);
}

// Search
function handleSearch(e) {
    const query = e.target.value.toLowerCase();

    if (!query) {
        displayItems(files);
        return;
    }

    const filtered = files.filter(file =>
        file.name.toLowerCase().includes(query)
    );

    displayItems(filtered);
}

// Refresh
function refresh() {
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

    if (diff < 86400000) { // Less than 24 hours
        const hours = Math.floor(diff / 3600000);
        if (hours < 1) return 'Just now';
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (diff < 604800000) { // Less than 7 days
        const days = Math.floor(diff / 86400000);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function formatFileInfo(item) {
    if (item.type === 'folder' || item.type === 'bucket') {
        return item.type === 'bucket' ? 'Bucket' : 'Folder';
    }
    return formatFileSize(item.size);
}

function getFileType(fileName) {
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
        const textDiv = document.getElementById('previewText');
        const errorDiv = document.getElementById('previewError');

        // Clear iframe source to stop loading
        iframe.src = 'about:blank';
        iframe.srcdoc = '';
        iframe.style.display = 'none';

        // Hide all preview elements
        image.style.display = 'none';
        textDiv.style.display = 'none';
        errorDiv.style.display = 'none';

        // Clear any stored URLs
        if (iframe.dataset.presignedUrl) {
            delete iframe.dataset.presignedUrl;
        }
        if (iframe.dataset.blobUrl) {
            URL.revokeObjectURL(iframe.dataset.blobUrl);
            delete iframe.dataset.blobUrl;
        }

        // Clear image source
        if (image.src) {
            if (image.src.startsWith('blob:')) {
                URL.revokeObjectURL(image.src);
            }
            image.src = '';
        }
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

// Settings (placeholder)
function showSettings() {
    alert('Settings panel coming soon');
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

function moveSelected() {
    if (selectedFiles.size === 0) return;

    // TODO: Implement move functionality with folder selection dialog
    alert(`Move ${selectedFiles.size} item(s) - Feature coming soon`);
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