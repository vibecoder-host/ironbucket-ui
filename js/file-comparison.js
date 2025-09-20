// File Comparison Feature
let comparisonMode = false;
let selectedForComparison = [];

// Toggle comparison mode
function toggleComparisonMode() {
    comparisonMode = !comparisonMode;
    const compareBtn = document.getElementById('compareBtn');

    if (comparisonMode) {
        compareBtn?.classList.add('active');
        showNotification('Select files to compare (max 2)', 'info');
        selectedForComparison = [];
        document.body.classList.add('comparison-mode');
    } else {
        compareBtn?.classList.remove('active');
        selectedForComparison = [];
        document.body.classList.remove('comparison-mode');
        clearComparisonSelection();
    }
}

// Add file to comparison
function addToComparison(bucket, key) {
    if (selectedForComparison.length >= 2) {
        showNotification('Maximum 2 files can be compared', 'warning');
        return;
    }

    const file = {
        bucket: bucket,
        key: key,
        name: key.split('/').pop()
    };

    selectedForComparison.push(file);

    if (selectedForComparison.length === 2) {
        openComparisonView();
    } else {
        showNotification(`Selected ${file.name}. Select one more file to compare.`, 'info');
    }
}

// Open comparison view
async function openComparisonView() {
    const [file1, file2] = selectedForComparison;

    showLoading('Loading files for comparison...');

    try {
        // Fetch both files
        const [response1, response2] = await Promise.all([
            s3Fetch(`/${file1.bucket}/${file1.key}`),
            s3Fetch(`/${file2.bucket}/${file2.key}`)
        ]);

        const [content1, content2] = await Promise.all([
            response1.text(),
            response2.text()
        ]);

        // Get file metadata
        const [head1, head2] = await Promise.all([
            s3Fetch(`/${file1.bucket}/${file1.key}`, { method: 'HEAD' }),
            s3Fetch(`/${file2.bucket}/${file2.key}`, { method: 'HEAD' })
        ]);

        hideLoading();

        // Create comparison modal
        createComparisonModal(file1, file2, content1, content2, head1.headers, head2.headers);

    } catch (error) {
        hideLoading();
        console.error('Error loading files for comparison:', error);
        showNotification('Failed to load files for comparison', 'error');
    }
}

// Create comparison modal
function createComparisonModal(file1, file2, content1, content2, headers1, headers2) {
    const modal = document.createElement('div');
    modal.className = 'modal comparison-modal';
    modal.id = 'comparisonModal';

    const size1 = headers1.get('content-length');
    const size2 = headers2.get('content-length');
    const modified1 = headers1.get('last-modified');
    const modified2 = headers2.get('last-modified');

    // Check if files are binary
    const isBinary1 = !isTextFile(content1);
    const isBinary2 = !isTextFile(content2);

    modal.innerHTML = `
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h2>File Comparison</h2>
                <button class="btn-icon" onclick="closeComparisonModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body comparison-body">
                <div class="comparison-info">
                    <div class="file-info">
                        <h3>${file1.name}</h3>
                        <span class="file-meta">Bucket: ${file1.bucket}</span>
                        <span class="file-meta">Size: ${formatFileSize(parseInt(size1))}</span>
                        <span class="file-meta">Modified: ${new Date(modified1).toLocaleString()}</span>
                    </div>
                    <div class="comparison-stats">
                        ${!isBinary1 && !isBinary2 ? getComparisonStats(content1, content2) : ''}
                    </div>
                    <div class="file-info">
                        <h3>${file2.name}</h3>
                        <span class="file-meta">Bucket: ${file2.bucket}</span>
                        <span class="file-meta">Size: ${formatFileSize(parseInt(size2))}</span>
                        <span class="file-meta">Modified: ${new Date(modified2).toLocaleString()}</span>
                    </div>
                </div>
                <div class="comparison-content">
                    ${isBinary1 || isBinary2 ?
                        '<div class="comparison-message">Binary files cannot be compared in text mode</div>' :
                        createDiffView(content1, content2)
                    }
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="downloadComparisonResult()">
                    <i class="fas fa-download"></i> Download Diff
                </button>
                <button class="btn-primary" onclick="closeComparisonModal()">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
}

// Check if content is text
function isTextFile(content) {
    // Simple heuristic: check for null bytes or too many non-printable characters
    for (let i = 0; i < Math.min(content.length, 1000); i++) {
        const code = content.charCodeAt(i);
        if (code === 0) return false; // Null byte
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
            return false; // Non-printable character (except tab, newline, carriage return)
        }
    }
    return true;
}

// Get comparison statistics
function getComparisonStats(content1, content2) {
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');

    const diff = computeDiff(lines1, lines2);
    let added = 0, removed = 0, modified = 0;

    diff.forEach(change => {
        if (change.type === 'add') added += change.lines.length;
        else if (change.type === 'remove') removed += change.lines.length;
        else if (change.type === 'modify') modified += change.lines.length;
    });

    return `
        <div class="diff-stats">
            <span class="stat-added"><i class="fas fa-plus"></i> ${added} added</span>
            <span class="stat-removed"><i class="fas fa-minus"></i> ${removed} removed</span>
            <span class="stat-modified"><i class="fas fa-pen"></i> ${modified} modified</span>
        </div>
    `;
}

// Create diff view
function createDiffView(content1, content2) {
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');

    const diff = computeDiff(lines1, lines2);

    let html = '<div class="diff-view">';
    html += '<div class="diff-side diff-left"><h4>Original</h4><div class="diff-content">';

    let lineNum1 = 1;
    let lineNum2 = 1;
    let rightContent = '<div class="diff-side diff-right"><h4>Modified</h4><div class="diff-content">';

    diff.forEach(change => {
        if (change.type === 'unchanged') {
            change.lines.forEach(line => {
                html += `<div class="diff-line"><span class="line-num">${lineNum1++}</span><span class="line-content">${escapeHtml(line)}</span></div>`;
                rightContent += `<div class="diff-line"><span class="line-num">${lineNum2++}</span><span class="line-content">${escapeHtml(line)}</span></div>`;
            });
        } else if (change.type === 'remove') {
            change.lines.forEach(line => {
                html += `<div class="diff-line diff-removed"><span class="line-num">${lineNum1++}</span><span class="line-content">${escapeHtml(line)}</span></div>`;
                rightContent += `<div class="diff-line diff-placeholder"><span class="line-num">-</span><span class="line-content"></span></div>`;
            });
        } else if (change.type === 'add') {
            change.lines.forEach(line => {
                html += `<div class="diff-line diff-placeholder"><span class="line-num">-</span><span class="line-content"></span></div>`;
                rightContent += `<div class="diff-line diff-added"><span class="line-num">${lineNum2++}</span><span class="line-content">${escapeHtml(line)}</span></div>`;
            });
        }
    });

    html += '</div></div>';
    html += rightContent + '</div></div>';
    html += '</div>';

    return html;
}

// Compute diff between two arrays of lines
function computeDiff(lines1, lines2) {
    // Simple diff algorithm - can be enhanced with more sophisticated algorithms
    const result = [];
    let i = 0, j = 0;

    while (i < lines1.length || j < lines2.length) {
        if (i >= lines1.length) {
            // Remaining lines in lines2 are additions
            result.push({ type: 'add', lines: lines2.slice(j) });
            break;
        } else if (j >= lines2.length) {
            // Remaining lines in lines1 are deletions
            result.push({ type: 'remove', lines: lines1.slice(i) });
            break;
        } else if (lines1[i] === lines2[j]) {
            // Lines are the same
            let unchanged = [];
            while (i < lines1.length && j < lines2.length && lines1[i] === lines2[j]) {
                unchanged.push(lines1[i]);
                i++;
                j++;
            }
            result.push({ type: 'unchanged', lines: unchanged });
        } else {
            // Lines are different - find next matching line
            let found = false;

            // Look ahead for matching lines
            for (let k = 1; k < 10 && !found; k++) {
                if (i + k < lines1.length && lines1[i + k] === lines2[j]) {
                    // Found match - lines before are removals
                    result.push({ type: 'remove', lines: lines1.slice(i, i + k) });
                    i += k;
                    found = true;
                } else if (j + k < lines2.length && lines1[i] === lines2[j + k]) {
                    // Found match - lines before are additions
                    result.push({ type: 'add', lines: lines2.slice(j, j + k) });
                    j += k;
                    found = true;
                }
            }

            if (!found) {
                // No match found - treat as remove and add
                result.push({ type: 'remove', lines: [lines1[i]] });
                result.push({ type: 'add', lines: [lines2[j]] });
                i++;
                j++;
            }
        }
    }

    return result;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close comparison modal
function closeComparisonModal() {
    const modal = document.getElementById('comparisonModal');
    if (modal) {
        modal.remove();
    }
    toggleComparisonMode(); // Exit comparison mode
}

// Clear comparison selection
function clearComparisonSelection() {
    selectedForComparison = [];
    // Remove any visual indicators from selected items
    document.querySelectorAll('.comparison-selected').forEach(el => {
        el.classList.remove('comparison-selected');
    });
}

// Download comparison result
function downloadComparisonResult() {
    if (selectedForComparison.length !== 2) return;

    const [file1, file2] = selectedForComparison;

    // Create diff report
    let report = `File Comparison Report\n`;
    report += `======================\n\n`;
    report += `File 1: ${file1.bucket}/${file1.key}\n`;
    report += `File 2: ${file2.bucket}/${file2.key}\n`;
    report += `Date: ${new Date().toISOString()}\n\n`;

    // Add diff content if available
    const diffContent = document.querySelector('.diff-view');
    if (diffContent) {
        report += `Differences:\n`;
        report += `-----------\n`;

        // Extract text from diff view
        const leftLines = diffContent.querySelectorAll('.diff-left .diff-line');
        const rightLines = diffContent.querySelectorAll('.diff-right .diff-line');

        leftLines.forEach((line, index) => {
            const leftContent = line.querySelector('.line-content')?.textContent || '';
            const rightContent = rightLines[index]?.querySelector('.line-content')?.textContent || '';

            if (line.classList.contains('diff-removed')) {
                report += `- ${leftContent}\n`;
            } else if (rightLines[index]?.classList.contains('diff-added')) {
                report += `+ ${rightContent}\n`;
            }
        });
    }

    // Download report
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// Add comparison button to file actions
function addComparisonButton(fileElement, bucket, key) {
    if (!comparisonMode) return;

    const button = document.createElement('button');
    button.className = 'btn-icon comparison-btn';
    button.title = 'Add to comparison';
    button.innerHTML = '<i class="fas fa-exchange-alt"></i>';
    button.onclick = (e) => {
        e.stopPropagation();
        addToComparison(bucket, key);
        fileElement.classList.add('comparison-selected');
    };

    fileElement.querySelector('.file-actions')?.appendChild(button);
}