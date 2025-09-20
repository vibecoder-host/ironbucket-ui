// File Editor with CodeMirror
// Provides text editing capabilities for various file types

class FileEditor {
    constructor() {
        this.editor = null;
        this.currentFile = null;
        this.isModified = false;
        this.originalContent = '';
        this.modal = null;
        this.currentTheme = 'default';
        this.currentFontSize = 14;

        // Supported text file extensions
        this.textFileExtensions = [
            'txt', 'js', 'css', 'html', 'json', 'xml', 'yaml', 'yml', 'md',
            'py', 'java', 'cpp', 'c', 'h', 'sh', 'sql', 'php', 'rb', 'go',
            'rs', 'ts', 'tsx', 'jsx', 'vue', 'env', 'gitignore', 'dockerfile'
        ];

        // Language mode mapping for CodeMirror
        this.languageModes = {
            'js': 'javascript',
            'jsx': 'jsx',
            'ts': 'javascript',
            'tsx': 'jsx',
            'json': 'application/json',
            'css': 'css',
            'html': 'htmlmixed',
            'xml': 'xml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown',
            'py': 'python',
            'java': 'text/x-java',
            'cpp': 'text/x-c++src',
            'c': 'text/x-csrc',
            'h': 'text/x-chdr',
            'sh': 'shell',
            'sql': 'sql',
            'php': 'php',
            'rb': 'ruby',
            'go': 'go',
            'rs': 'rust',
            'vue': 'vue',
            'dockerfile': 'dockerfile'
        };

        this.initializeModal();
        this.setupKeyboardShortcuts();
    }

    // Check if a file is editable as text
    isTextFile(fileName) {
        const ext = this.getFileExtension(fileName);
        return this.textFileExtensions.includes(ext) || fileName.toLowerCase() === 'makefile';
    }

    // Get file extension
    getFileExtension(fileName) {
        const parts = fileName.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    // Get CodeMirror mode for file
    getLanguageMode(fileName) {
        const ext = this.getFileExtension(fileName);
        if (fileName.toLowerCase() === 'makefile') return 'makefile';
        return this.languageModes[ext] || 'text/plain';
    }

    // Initialize the editor modal
    initializeModal() {
        this.modal = document.getElementById('fileEditorModal');
        if (!this.modal) {
            console.error('File editor modal not found');
            return;
        }

        // Setup theme selector
        const themeSelect = document.getElementById('editorTheme');
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                this.changeTheme(e.target.value);
            });
        }

        // Setup font size selector
        const fontSizeSelect = document.getElementById('editorFontSize');
        if (fontSizeSelect) {
            fontSizeSelect.addEventListener('change', (e) => {
                this.changeFontSize(parseInt(e.target.value));
            });
        }

        // Setup save buttons
        const saveBtn = document.getElementById('editorSaveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveFile());
        }

        const saveAsBtn = document.getElementById('editorSaveAsBtn');
        if (saveAsBtn) {
            saveAsBtn.addEventListener('click', () => this.saveAsFile());
        }

        const downloadBtn = document.getElementById('editorDownloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadFile());
        }

        // Setup modal close
        const closeBtn = this.modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeEditor());
        }

        // Close on escape
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeEditor();
            }
        });
    }

    // Setup keyboard shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (!this.modal || !this.modal.classList.contains('show')) return;

            // Ctrl+S or Cmd+S for save
            if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
                e.preventDefault();
                this.saveFile();
            }

            // Ctrl+Shift+S or Cmd+Shift+S for save as
            if ((e.ctrlKey || e.metaKey) && e.key === 'S' && e.shiftKey) {
                e.preventDefault();
                this.saveAsFile();
            }

            // Escape to close
            if (e.key === 'Escape') {
                e.preventDefault();
                this.closeEditor();
            }
        });
    }

    // Open file for editing
    async openFile(fileKey, fileName) {
        try {
            this.currentFile = { key: fileKey, name: fileName };

            // Show loading
            this.showLoading(true);

            // Update modal title
            this.updateModalTitle(fileName);

            // Fetch file content
            const content = await this.fetchFileContent(fileKey);
            this.originalContent = content;

            // Initialize CodeMirror
            this.initializeEditor(content, fileName);

            // Show modal
            this.modal.classList.add('show');
            document.body.style.overflow = 'hidden';

            // Focus editor
            setTimeout(() => {
                if (this.editor) {
                    this.editor.focus();
                }
            }, 100);

            this.showLoading(false);

        } catch (error) {
            console.error('Error opening file:', error);
            this.showError('Failed to load file content');
            this.showLoading(false);
        }
    }

    // Fetch file content from S3
    async fetchFileContent(fileKey) {
        if (!window.currentBucket) {
            throw new Error('Bucket not selected');
        }

        try {
            // Generate signed URL for reading
            if (window.generatePresignedUrl) {
                const signedUrl = await window.generatePresignedUrl(fileKey, 3600);

                const response = await fetch(signedUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch file: ${response.statusText}`);
                }

                return await response.text();
            } else {
                // Fallback to direct s3Fetch if generatePresignedUrl not available
                const response = await window.s3Fetch(`/${window.currentBucket}/${fileKey}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch file: ${response.statusText}`);
                }

                return await response.text();
            }
        } catch (error) {
            console.error('Error fetching file content:', error);
            throw error;
        }
    }

    // Initialize CodeMirror editor
    initializeEditor(content, fileName) {
        const editorContainer = document.getElementById('editorContainer');
        if (!editorContainer) {
            throw new Error('Editor container not found');
        }

        // Clear existing editor
        if (this.editor) {
            this.editor.toTextArea();
            this.editor = null;
        }

        // Create textarea
        const textarea = document.createElement('textarea');
        textarea.value = content;
        editorContainer.innerHTML = '';
        editorContainer.appendChild(textarea);

        // Initialize CodeMirror
        this.editor = CodeMirror.fromTextArea(textarea, {
            lineNumbers: true,
            mode: this.getLanguageMode(fileName),
            theme: this.currentTheme,
            autoCloseBrackets: true,
            matchBrackets: true,
            autoCloseTags: true,
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            extraKeys: {
                "Ctrl-F": "findPersistent",
                "Cmd-F": "findPersistent",
                "Ctrl-H": "replace",
                "Cmd-Alt-F": "replace",
                "F11": function(cm) {
                    cm.setOption("fullScreen", !cm.getOption("fullScreen"));
                },
                "Esc": function(cm) {
                    if (cm.getOption("fullScreen")) cm.setOption("fullScreen", false);
                }
            },
            viewportMargin: Infinity
        });

        // Set font size
        this.changeFontSize(this.currentFontSize);

        // Track changes
        this.editor.on('change', () => {
            this.setModified(true);
        });

        this.setModified(false);
    }

    // Update modal title with file path and modified indicator
    updateModalTitle(fileName) {
        const titleElement = document.getElementById('editorModalTitle');
        if (titleElement) {
            const modifiedIndicator = this.isModified ? ' •' : '';
            titleElement.textContent = `Edit: ${fileName}${modifiedIndicator}`;
        }

        const pathElement = document.getElementById('editorFilePath');
        if (pathElement && this.currentFile) {
            pathElement.textContent = this.currentFile.key;
        }
    }

    // Set modified state
    setModified(modified) {
        this.isModified = modified;
        this.updateModalTitle(this.currentFile ? this.currentFile.name : '');

        // Update save button state
        const saveBtn = document.getElementById('editorSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = !modified;
        }
    }

    // Change editor theme
    changeTheme(theme) {
        this.currentTheme = theme;
        if (this.editor) {
            this.editor.setOption('theme', theme);
        }

        // Apply theme to modal
        const modal = this.modal;
        if (modal) {
            modal.classList.toggle('dark-theme', theme.includes('dark') || theme === 'monokai' || theme === 'dracula');
        }
    }

    // Change font size
    changeFontSize(size) {
        this.currentFontSize = size;
        if (this.editor) {
            const wrapper = this.editor.getWrapperElement();
            wrapper.style.fontSize = size + 'px';
            this.editor.refresh();
        }
    }

    // Save file (overwrite original)
    async saveFile() {
        if (!this.editor || !this.currentFile) return;

        try {
            this.showLoading(true, 'Saving file...');

            const content = this.editor.getValue();
            await this.uploadFileContent(this.currentFile.key, content);

            this.originalContent = content;
            this.setModified(false);

            this.showSuccess('File saved successfully');

            // Refresh file list if in the same directory
            if (window.loadFiles) {
                window.loadFiles();
            }

        } catch (error) {
            console.error('Error saving file:', error);
            this.showError('Failed to save file');
        } finally {
            this.showLoading(false);
        }
    }

    // Save as new file
    async saveAsFile() {
        if (!this.editor || !this.currentFile) return;

        const newFileName = prompt('Enter new file name:', this.currentFile.name);
        if (!newFileName) return;

        try {
            this.showLoading(true, 'Saving file...');

            const content = this.editor.getValue();
            const newPath = this.currentFile.key.replace(/[^/]*$/, newFileName);

            await this.uploadFileContent(newPath, content);

            this.showSuccess(`File saved as ${newFileName}`);

            // Refresh file list
            if (window.loadFiles) {
                window.loadFiles();
            }

        } catch (error) {
            console.error('Error saving file as:', error);
            this.showError('Failed to save file');
        } finally {
            this.showLoading(false);
        }
    }

    // Download file
    downloadFile() {
        if (!this.editor || !this.currentFile) return;

        const content = this.editor.getValue();
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = this.currentFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
    }

    // Upload file content to S3
    async uploadFileContent(fileKey, content) {
        if (!window.s3Signer || !window.currentBucket) {
            throw new Error('S3 not initialized');
        }

        try {
            // Create a blob from the content
            const blob = new Blob([content], { type: 'text/plain' });

            // Generate signed URL for upload
            const signedUrl = await window.s3Signer.getSignedUrl('putObject', {
                Bucket: window.currentBucket,
                Key: fileKey,
                ContentType: 'text/plain',
                Expires: 3600
            });

            // Upload the file
            const response = await fetch(signedUrl, {
                method: 'PUT',
                body: blob,
                headers: {
                    'Content-Type': 'text/plain'
                }
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error uploading file:', error);
            throw error;
        }
    }

    // Close editor with confirmation if modified
    closeEditor() {
        if (this.isModified) {
            const shouldClose = confirm('You have unsaved changes. Are you sure you want to close?');
            if (!shouldClose) return;
        }

        this.modal.classList.remove('show');
        document.body.style.overflow = '';

        // Clean up editor
        if (this.editor) {
            this.editor.toTextArea();
            this.editor = null;
        }

        this.currentFile = null;
        this.isModified = false;
        this.originalContent = '';
    }

    // Show loading state
    showLoading(show, message = 'Loading...') {
        const loadingElement = document.getElementById('editorLoading');
        const loadingMessage = document.getElementById('editorLoadingMessage');

        if (loadingElement) {
            loadingElement.style.display = show ? 'flex' : 'none';
        }

        if (loadingMessage) {
            loadingMessage.textContent = message;
        }
    }

    // Show success message
    showSuccess(message) {
        // Use the existing notification system if available
        if (window.showNotification) {
            window.showNotification(message, 'success');
        } else {
            alert(message);
        }
    }

    // Show error message
    showError(message) {
        // Use the existing notification system if available
        if (window.showNotification) {
            window.showNotification(message, 'error');
        } else {
            alert('Error: ' + message);
        }
    }
}

// Initialize global file editor instance
window.fileEditor = new FileEditor();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileEditor;
}