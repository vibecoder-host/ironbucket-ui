// Bucket Management Functions

// Open create bucket modal
function openCreateBucketModal() {
    // Reset form
    document.getElementById('bucketNameInput').value = '';
    document.getElementById('bucketEncryption').checked = false;
    document.getElementById('bucketVersioning').checked = false;
    document.getElementById('bucketNameError').style.display = 'none';
    document.getElementById('bucketNameInput').classList.remove('error');

    showModal('createBucketModal');

    // Focus on bucket name input
    setTimeout(() => {
        document.getElementById('bucketNameInput').focus();
    }, 100);
}

// Validate bucket name according to S3 rules
function validateBucketName(name) {
    const errors = [];

    // Check length
    if (name.length < 3) {
        errors.push('Bucket name must be at least 3 characters long');
    }
    if (name.length > 63) {
        errors.push('Bucket name must not exceed 63 characters');
    }

    // Check for valid characters (lowercase letters, numbers, dots, hyphens)
    if (!/^[a-z0-9.-]+$/.test(name)) {
        errors.push('Bucket name can only contain lowercase letters, numbers, dots (.), and hyphens (-)');
    }

    // Check for uppercase letters specifically
    if (/[A-Z]/.test(name)) {
        errors.push('Bucket name must not contain uppercase letters');
    }

    // Must not start with xn--
    if (name.startsWith('xn--')) {
        errors.push('Bucket name must not start with "xn--"');
    }

    // Must not end with -s3alias
    if (name.endsWith('-s3alias')) {
        errors.push('Bucket name must not end with "-s3alias"');
    }

    // Must not contain two adjacent periods
    if (name.includes('..')) {
        errors.push('Bucket name must not contain two adjacent periods');
    }

    // Must not contain period adjacent to hyphen
    if (name.includes('.-') || name.includes('-.')) {
        errors.push('Bucket name must not contain a period adjacent to a hyphen');
    }

    // Must not be formatted as IP address
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(name)) {
        // Additional check to ensure it's a valid IP range
        const parts = name.split('.');
        const isValidIP = parts.every(part => {
            const num = parseInt(part, 10);
            return num >= 0 && num <= 255;
        });
        if (isValidIP) {
            errors.push('Bucket name must not be formatted as an IP address');
        }
    }

    // Must start and end with lowercase letter or number
    if (!/^[a-z0-9]/.test(name)) {
        errors.push('Bucket name must start with a lowercase letter or number');
    }
    if (!/[a-z0-9]$/.test(name)) {
        errors.push('Bucket name must end with a lowercase letter or number');
    }

    return errors;
}

// Real-time validation as user types
document.addEventListener('DOMContentLoaded', () => {
    const bucketNameInput = document.getElementById('bucketNameInput');
    const bucketNameError = document.getElementById('bucketNameError');
    const createBucketBtn = document.getElementById('createBucketBtn');

    if (bucketNameInput) {
        bucketNameInput.addEventListener('input', (e) => {
            const name = e.target.value.trim();

            if (name.length === 0) {
                bucketNameError.style.display = 'none';
                bucketNameInput.classList.remove('error');
                createBucketBtn.disabled = false;
                return;
            }

            const errors = validateBucketName(name);

            if (errors.length > 0) {
                bucketNameError.textContent = errors[0]; // Show first error
                bucketNameError.style.display = 'block';
                bucketNameInput.classList.add('error');
                createBucketBtn.disabled = true;
            } else {
                bucketNameError.style.display = 'none';
                bucketNameInput.classList.remove('error');
                createBucketBtn.disabled = false;
            }
        });

        // Convert to lowercase as user types
        bucketNameInput.addEventListener('input', (e) => {
            const start = e.target.selectionStart;
            const end = e.target.selectionEnd;
            e.target.value = e.target.value.toLowerCase();
            e.target.setSelectionRange(start, end);
        });
    }
});

// Create bucket function
async function createBucket() {
    const bucketNameInput = document.getElementById('bucketNameInput');
    const bucketName = bucketNameInput.value.trim();
    const encryptionEnabled = document.getElementById('bucketEncryption').checked;
    const versioningEnabled = document.getElementById('bucketVersioning').checked;

    // Validate bucket name
    const errors = validateBucketName(bucketName);
    if (errors.length > 0) {
        document.getElementById('bucketNameError').textContent = errors[0];
        document.getElementById('bucketNameError').style.display = 'block';
        bucketNameInput.classList.add('error');
        return;
    }

    showLoading('Creating bucket...');

    try {
        // Create the bucket using S3 API
        const response = await s3Fetch(`/${bucketName}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/xml'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Failed to create bucket: ${response.status}`);
        }

        // If encryption is enabled, configure bucket encryption
        if (encryptionEnabled) {
            await configureBucketEncryption(bucketName);
        }

        // If versioning is enabled, configure bucket versioning
        if (versioningEnabled) {
            await configureBucketVersioning(bucketName);
        }

        hideLoading();
        showNotification(`Bucket "${bucketName}" created successfully`, 'success');
        closeModal('createBucketModal');

        // Refresh the bucket list or navigate to the new bucket
        if (typeof loadBuckets === 'function') {
            loadBuckets();
        }

        // Navigate to the new bucket
        currentBucket = bucketName;
        currentPath = '';
        window.location.hash = bucketName;

    } catch (error) {
        hideLoading();
        console.error('Error creating bucket:', error);

        // Parse error message
        let errorMessage = error.message;
        if (errorMessage.includes('BucketAlreadyExists')) {
            errorMessage = 'A bucket with this name already exists';
        } else if (errorMessage.includes('BucketAlreadyOwnedByYou')) {
            errorMessage = 'You already own a bucket with this name';
        }

        showNotification(`Failed to create bucket: ${errorMessage}`, 'error');
    }
}

// Configure bucket encryption
async function configureBucketEncryption(bucketName) {
    const encryptionXml = `<?xml version="1.0" encoding="UTF-8"?>
<ServerSideEncryptionConfiguration>
    <Rule>
        <ApplyServerSideEncryptionByDefault>
            <SSEAlgorithm>AES256</SSEAlgorithm>
        </ApplyServerSideEncryptionByDefault>
    </Rule>
</ServerSideEncryptionConfiguration>`;

    try {
        const response = await s3Fetch(`/${bucketName}?encryption`, {
            method: 'PUT',
            body: encryptionXml,
            headers: {
                'Content-Type': 'application/xml'
            }
        });

        if (!response.ok) {
            console.warn('Failed to enable bucket encryption:', response.status);
        }
    } catch (error) {
        console.error('Error configuring bucket encryption:', error);
    }
}

// Configure bucket versioning
async function configureBucketVersioning(bucketName) {
    const versioningXml = `<?xml version="1.0" encoding="UTF-8"?>
<VersioningConfiguration>
    <Status>Enabled</Status>
</VersioningConfiguration>`;

    try {
        const response = await s3Fetch(`/${bucketName}?versioning`, {
            method: 'PUT',
            body: versioningXml,
            headers: {
                'Content-Type': 'application/xml'
            }
        });

        if (!response.ok) {
            console.warn('Failed to enable bucket versioning:', response.status);
        }
    } catch (error) {
        console.error('Error configuring bucket versioning:', error);
    }
}

// Load buckets list (if in bucket view)
async function loadBuckets() {
    try {
        const response = await s3Fetch('/');

        if (!response.ok) {
            throw new Error('Failed to list buckets');
        }

        const xml = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        const buckets = Array.from(doc.querySelectorAll('Bucket')).map(bucket => ({
            name: bucket.querySelector('Name').textContent,
            creationDate: bucket.querySelector('CreationDate')?.textContent
        }));

        displayBuckets(buckets);

    } catch (error) {
        console.error('Error loading buckets:', error);
        showNotification('Failed to load buckets', 'error');
    }
}

// Display buckets in the UI
function displayBuckets(buckets) {
    const filesGrid = document.getElementById('filesGrid');
    if (!filesGrid) return;

    // Clear current content
    filesGrid.innerHTML = '';

    if (buckets.length === 0) {
        filesGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-database"></i>
                <h3>No buckets found</h3>
                <p>Create your first bucket to get started</p>
                <button class="btn-primary" onclick="openCreateBucketModal()">
                    <i class="fas fa-plus"></i> Create Bucket
                </button>
            </div>
        `;
        return;
    }

    // Display each bucket as a clickable item
    buckets.forEach(bucket => {
        const bucketElement = document.createElement('div');
        bucketElement.className = 'file-item folder-item';
        bucketElement.innerHTML = `
            <div class="file-icon">
                <i class="fas fa-database"></i>
            </div>
            <div class="file-details">
                <div class="file-name">${bucket.name}</div>
                <div class="file-meta">
                    Created: ${bucket.creationDate ? new Date(bucket.creationDate).toLocaleDateString() : 'Unknown'}
                </div>
            </div>
            <div class="file-actions">
                <button class="btn-icon" onclick="deleteBucket('${bucket.name}')" title="Delete bucket">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        bucketElement.addEventListener('click', (e) => {
            if (!e.target.closest('.file-actions')) {
                // Navigate to bucket
                currentBucket = bucket.name;
                currentPath = '';
                window.location.hash = bucket.name;
            }
        });

        filesGrid.appendChild(bucketElement);
    });
}

// Delete bucket function
async function deleteBucket(bucketName) {
    if (!confirm(`Are you sure you want to delete the bucket "${bucketName}"? The bucket must be empty.`)) {
        return;
    }

    showLoading('Deleting bucket...');

    try {
        const response = await s3Fetch(`/${bucketName}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Failed to delete bucket: ${response.status}`);
        }

        hideLoading();
        showNotification(`Bucket "${bucketName}" deleted successfully`, 'success');

        // Reload bucket list
        loadBuckets();

    } catch (error) {
        hideLoading();
        console.error('Error deleting bucket:', error);

        let errorMessage = error.message;
        if (errorMessage.includes('BucketNotEmpty')) {
            errorMessage = 'Bucket must be empty before it can be deleted';
        }

        showNotification(`Failed to delete bucket: ${errorMessage}`, 'error');
    }
}