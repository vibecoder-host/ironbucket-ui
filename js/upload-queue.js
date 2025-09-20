// Background Upload Queue Implementation
let uploadQueue = [];
let activeUploads = new Map();
let uploadQueuePaused = false;
let maxConcurrentUploads = 3;
let totalUploadSpeed = 0;
let uploadSpeedHistory = [];

// Initialize upload queue from localStorage
function initUploadQueue() {
    const savedQueue = localStorage.getItem(`uploadQueue_${currentBucket}`);
    if (savedQueue) {
        try {
            uploadQueue = JSON.parse(savedQueue);
            // Resume any pending uploads
            uploadQueue.forEach(item => {
                if (item.status === 'uploading') {
                    item.status = 'queued';
                }
            });
            updateUploadQueueUI();
        } catch (e) {
            console.error('Failed to restore upload queue:', e);
            uploadQueue = [];
        }
    }
}

// Add files to background upload queue
function addToUploadQueue(files, targetPath = currentPath) {
    const queuePanel = document.getElementById('uploadQueuePanel');
    queuePanel.style.display = 'block';

    Array.from(files).forEach(file => {
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const queueItem = {
            id: uploadId,
            file: file,
            fileName: file.webkitRelativePath || file.name,
            fileSize: file.size,
            bucket: currentBucket,
            targetPath: targetPath,
            status: 'queued', // queued, uploading, paused, completed, failed
            progress: 0,
            uploadedBytes: 0,
            startTime: null,
            speed: 0,
            error: null,
            multipartUpload: file.size > 5 * 1024 * 1024 ? {
                uploadId: null,
                parts: [],
                completedParts: []
            } : null
        };

        uploadQueue.push(queueItem);
    });

    saveUploadQueue();
    updateUploadQueueUI();
    processUploadQueue();
}

// Save upload queue to localStorage
function saveUploadQueue() {
    // Don't save file objects, just metadata
    const queueToSave = uploadQueue.map(item => ({
        ...item,
        file: undefined // Don't save file object
    }));
    localStorage.setItem(`uploadQueue_${currentBucket}`, JSON.stringify(queueToSave));
}

// Process upload queue
async function processUploadQueue() {
    if (uploadQueuePaused) return;

    const currentlyUploading = uploadQueue.filter(item => item.status === 'uploading').length;
    const queued = uploadQueue.filter(item => item.status === 'queued');

    while (currentlyUploading < maxConcurrentUploads && queued.length > 0) {
        const nextItem = queued.shift();
        uploadFileInBackground(nextItem);
    }
}

// Upload file in background
async function uploadFileInBackground(queueItem) {
    if (!queueItem.file) {
        // File object lost (page refreshed), mark as failed
        queueItem.status = 'failed';
        queueItem.error = 'File object lost. Please re-add the file.';
        updateUploadQueueUI();
        return;
    }

    queueItem.status = 'uploading';
    queueItem.startTime = Date.now();
    updateUploadQueueUI();

    try {
        const key = queueItem.targetPath ?
            `${queueItem.targetPath}/${queueItem.fileName}` :
            queueItem.fileName;

        if (queueItem.multipartUpload) {
            await uploadMultipartInBackground(queueItem, key);
        } else {
            await uploadSinglePartInBackground(queueItem, key);
        }

        queueItem.status = 'completed';
        queueItem.progress = 100;

        // Refresh file list if we're still in the same folder
        if (currentBucket === queueItem.bucket && currentPath === queueItem.targetPath) {
            await loadFiles();
        }

    } catch (error) {
        console.error('Background upload failed:', error);
        queueItem.status = 'failed';
        queueItem.error = error.message;
    }

    updateUploadQueueUI();
    saveUploadQueue();

    // Process next item in queue
    setTimeout(() => processUploadQueue(), 100);
}

// Upload single part file in background
async function uploadSinglePartInBackground(queueItem, key) {
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
        reader.onload = async (e) => {
            try {
                const response = await s3Fetch(`/${queueItem.bucket}/${key}`, {
                    method: 'PUT',
                    body: e.target.result,
                    headers: {
                        'Content-Type': queueItem.file.type || 'application/octet-stream'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Upload failed: ${response.status}`);
                }

                resolve();
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));

        // Track progress
        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                queueItem.progress = (e.loaded / e.total) * 100;
                queueItem.uploadedBytes = e.loaded;
                updateUploadSpeed(queueItem);
                updateUploadQueueUI();
            }
        };

        reader.readAsArrayBuffer(queueItem.file);
    });
}

// Upload multipart file in background
async function uploadMultipartInBackground(queueItem, key) {
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks
    const numParts = Math.ceil(queueItem.file.size / chunkSize);

    // Initiate multipart upload if not already initiated
    if (!queueItem.multipartUpload.uploadId) {
        const initiateResponse = await s3Fetch(`/${queueItem.bucket}/${key}?uploads`, {
            method: 'POST',
            headers: {
                'Content-Type': queueItem.file.type || 'application/octet-stream'
            }
        });

        const initiateText = await initiateResponse.text();
        const uploadIdMatch = initiateText.match(/<UploadId>([^<]+)<\/UploadId>/);
        if (!uploadIdMatch) throw new Error('Failed to initiate multipart upload');

        queueItem.multipartUpload.uploadId = uploadIdMatch[1];
    }

    // Upload parts
    for (let partNumber = 1; partNumber <= numParts; partNumber++) {
        if (queueItem.multipartUpload.completedParts.includes(partNumber)) {
            continue; // Skip already uploaded parts
        }

        const start = (partNumber - 1) * chunkSize;
        const end = Math.min(start + chunkSize, queueItem.file.size);
        const chunk = queueItem.file.slice(start, end);

        const partData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(chunk);
        });

        const partResponse = await s3Fetch(
            `/${queueItem.bucket}/${key}?partNumber=${partNumber}&uploadId=${queueItem.multipartUpload.uploadId}`,
            {
                method: 'PUT',
                body: partData
            }
        );

        if (!partResponse.ok) throw new Error(`Failed to upload part ${partNumber}`);

        const etag = partResponse.headers.get('etag');
        queueItem.multipartUpload.parts.push({ partNumber, etag });
        queueItem.multipartUpload.completedParts.push(partNumber);

        // Update progress
        queueItem.uploadedBytes = end;
        queueItem.progress = (end / queueItem.file.size) * 100;
        updateUploadSpeed(queueItem);
        updateUploadQueueUI();
        saveUploadQueue();

        // Check if paused
        if (uploadQueuePaused || queueItem.status === 'paused') {
            return;
        }
    }

    // Complete multipart upload
    const completeXml = `<?xml version="1.0" encoding="UTF-8"?>
        <CompleteMultipartUpload>
            ${queueItem.multipartUpload.parts.map(part =>
                `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag}</ETag></Part>`
            ).join('')}
        </CompleteMultipartUpload>`;

    await s3Fetch(
        `/${queueItem.bucket}/${key}?uploadId=${queueItem.multipartUpload.uploadId}`,
        {
            method: 'POST',
            body: completeXml,
            headers: { 'Content-Type': 'application/xml' }
        }
    );
}

// Update upload speed calculation
function updateUploadSpeed(queueItem) {
    const now = Date.now();
    const elapsed = (now - queueItem.startTime) / 1000; // seconds

    if (elapsed > 0) {
        queueItem.speed = queueItem.uploadedBytes / elapsed; // bytes per second

        // Update global speed
        uploadSpeedHistory.push({
            time: now,
            speed: queueItem.speed
        });

        // Keep only last 10 seconds of history
        uploadSpeedHistory = uploadSpeedHistory.filter(item =>
            now - item.time < 10000
        );

        // Calculate average speed
        if (uploadSpeedHistory.length > 0) {
            totalUploadSpeed = uploadSpeedHistory.reduce((sum, item) =>
                sum + item.speed, 0
            ) / uploadSpeedHistory.length;
        }
    }
}

// Update upload queue UI
function updateUploadQueueUI() {
    const queueList = document.getElementById('uploadQueueList');
    const queueCount = document.getElementById('queueCount');
    const uploadSpeed = document.getElementById('uploadSpeed');
    const timeRemaining = document.getElementById('uploadTimeRemaining');

    if (!queueList || !queueCount) return; // Elements not ready yet

    queueCount.textContent = uploadQueue.filter(item =>
        item.status !== 'completed' && item.status !== 'failed'
    ).length;

    if (uploadQueue.length === 0) {
        queueList.innerHTML = '<div class="upload-queue-empty">No uploads in queue</div>';
        return;
    }

    // Update queue list
    queueList.innerHTML = uploadQueue.map(item => `
        <div class="upload-queue-item ${item.status}" data-id="${item.id}">
            <div class="upload-queue-item-header">
                <div class="upload-queue-item-name" title="${item.fileName}">
                    ${item.fileName}
                </div>
                <div class="upload-queue-item-status">
                    ${getUploadStatusIcon(item.status)}
                    <div class="upload-queue-item-actions">
                        ${item.status === 'uploading' ?
                            `<button class="btn-icon" onclick="pauseUpload('${item.id}')" title="Pause">
                                <i class="fas fa-pause"></i>
                            </button>` : ''}
                        ${item.status === 'paused' ?
                            `<button class="btn-icon" onclick="resumeUpload('${item.id}')" title="Resume">
                                <i class="fas fa-play"></i>
                            </button>` : ''}
                        ${item.status === 'failed' ?
                            `<button class="btn-icon" onclick="retryUpload('${item.id}')" title="Retry">
                                <i class="fas fa-redo"></i>
                            </button>` : ''}
                        <button class="btn-icon" onclick="removeFromQueue('${item.id}')" title="Remove">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            </div>
            ${item.status === 'uploading' || item.status === 'paused' ? `
                <div class="upload-queue-item-progress">
                    <div class="upload-progress-bar">
                        <div class="upload-progress-fill" style="width: ${item.progress}%"></div>
                    </div>
                </div>
                <div class="upload-queue-item-details">
                    <span>${formatFileSize(item.uploadedBytes)} / ${formatFileSize(item.fileSize)}</span>
                    <span>${item.speed ? formatFileSize(item.speed) + '/s' : '--'}</span>
                </div>
            ` : ''}
            ${item.status === 'failed' ? `
                <div class="upload-queue-item-error" style="color: var(--danger-color); font-size: 11px; margin-top: 4px;">
                    ${item.error || 'Upload failed'}
                </div>
            ` : ''}
        </div>
    `).join('');

    // Update speed and time remaining
    if (uploadSpeed && timeRemaining) {
        if (totalUploadSpeed > 0) {
            uploadSpeed.textContent = formatFileSize(totalUploadSpeed) + '/s';

            // Calculate time remaining
            const remainingBytes = uploadQueue
                .filter(item => item.status === 'uploading' || item.status === 'queued')
                .reduce((sum, item) => sum + (item.fileSize - item.uploadedBytes), 0);

            if (remainingBytes > 0) {
                const secondsRemaining = remainingBytes / totalUploadSpeed;
                timeRemaining.textContent = formatDuration(secondsRemaining);
            } else {
                timeRemaining.textContent = '--';
            }
        } else {
            uploadSpeed.textContent = '0 MB/s';
            timeRemaining.textContent = '--';
        }
    }
}

// Get upload status icon
function getUploadStatusIcon(status) {
    switch (status) {
        case 'queued':
            return '<i class="fas fa-clock upload-status-icon"></i>';
        case 'uploading':
            return '<i class="fas fa-spinner upload-status-icon uploading"></i>';
        case 'paused':
            return '<i class="fas fa-pause-circle upload-status-icon paused"></i>';
        case 'completed':
            return '<i class="fas fa-check-circle upload-status-icon completed"></i>';
        case 'failed':
            return '<i class="fas fa-exclamation-circle upload-status-icon failed"></i>';
        default:
            return '';
    }
}

// Format duration
function formatDuration(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

// Queue control functions
function toggleUploadQueue() {
    const panel = document.getElementById('uploadQueuePanel');
    const icon = document.getElementById('queueToggleIcon');

    panel.classList.toggle('minimized');
    icon.className = panel.classList.contains('minimized') ?
        'fas fa-chevron-up' : 'fas fa-chevron-down';
}

function hideUploadQueue() {
    document.getElementById('uploadQueuePanel').style.display = 'none';
}

function clearCompletedUploads() {
    uploadQueue = uploadQueue.filter(item =>
        item.status !== 'completed' && item.status !== 'failed'
    );
    saveUploadQueue();
    updateUploadQueueUI();
}

function pauseUpload(uploadId) {
    const item = uploadQueue.find(i => i.id === uploadId);
    if (item && item.status === 'uploading') {
        item.status = 'paused';
        updateUploadQueueUI();
    }
}

function resumeUpload(uploadId) {
    const item = uploadQueue.find(i => i.id === uploadId);
    if (item && item.status === 'paused') {
        item.status = 'queued';
        updateUploadQueueUI();
        processUploadQueue();
    }
}

function retryUpload(uploadId) {
    const item = uploadQueue.find(i => i.id === uploadId);
    if (item && item.status === 'failed') {
        item.status = 'queued';
        item.error = null;
        item.progress = 0;
        item.uploadedBytes = 0;
        updateUploadQueueUI();
        processUploadQueue();
    }
}

function removeFromQueue(uploadId) {
    uploadQueue = uploadQueue.filter(i => i.id !== uploadId);
    saveUploadQueue();
    updateUploadQueueUI();
}

function pauseAllUploads() {
    uploadQueuePaused = true;
    uploadQueue.forEach(item => {
        if (item.status === 'uploading') {
            item.status = 'paused';
        }
    });
    document.getElementById('pauseAllBtn').style.display = 'none';
    document.getElementById('resumeAllBtn').style.display = 'inline-flex';
    updateUploadQueueUI();
}

function resumeAllUploads() {
    uploadQueuePaused = false;
    uploadQueue.forEach(item => {
        if (item.status === 'paused') {
            item.status = 'queued';
        }
    });
    document.getElementById('pauseAllBtn').style.display = 'inline-flex';
    document.getElementById('resumeAllBtn').style.display = 'none';
    updateUploadQueueUI();
    processUploadQueue();
}

function cancelAllUploads() {
    if (confirm('Are you sure you want to cancel all uploads?')) {
        uploadQueue = [];
        saveUploadQueue();
        updateUploadQueueUI();
        hideUploadQueue();
    }
}

// Initialize upload queue when page loads
document.addEventListener('DOMContentLoaded', () => {
    initUploadQueue();
});